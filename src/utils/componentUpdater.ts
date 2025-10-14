import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { Project } from '../types';
import { Logger } from './logger';
import { TIMEOUTS } from './timeoutConfig';

export class ComponentUpdater {
  private logger: Logger;
  private updatingComponents = new Set<string>(); // Concurrent update lock

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Update a component to a specific version with automatic rollback on failure
   * - Prevents concurrent updates to same component
   * - ALWAYS creates snapshot before update (for rollback safety)
   * - Downloads and extracts new version
   * - Verifies component structure post-extraction
   * - Merges .env files (preserves user config)
   * - Uses programmatic write suppression to avoid false notifications
   * - Automatically rolls back on ANY failure
   * - Only updates version tracking after successful verification
   */
  async updateComponent(
    project: Project,
    componentId: string,
    downloadUrl: string,
    newVersion: string
  ): Promise<void> {
    const component = project.componentInstances?.[componentId];
    if (!component || !component.path) {
      throw new Error(`Component ${componentId} not found`);
    }

    // RESILIENCE: Check for concurrent updates
    if (this.updatingComponents.has(componentId)) {
      throw new Error(`Update already in progress for ${componentId}`);
    }

    this.updatingComponents.add(componentId);

    try {
      this.logger.info(`[Update] Updating ${componentId} to ${newVersion}`);

      // CRITICAL: Always create snapshot for rollback
      const snapshotPath = `${component.path}.snapshot-${Date.now()}`;
      
      try {
        // 1. Create pre-update snapshot (full directory backup)
        this.logger.info(`[Update] Creating snapshot at ${snapshotPath}`);
        await fs.cp(component.path, snapshotPath, { recursive: true });

        // 2. Preserve .env file(s) for merge
        const envFiles = await this.backupEnvFiles(component.path);

        // 3. Remove old component directory
        await fs.rm(component.path, { recursive: true, force: true });

        // 4. Download and extract new version
        await this.downloadAndExtract(downloadUrl, component.path, componentId);

        // 5. VERIFY component structure (critical files exist)
        await this.verifyComponentStructure(component.path, componentId);

        // 6. Restore and merge .env files (with programmatic write suppression)
        await this.mergeEnvFiles(component.path, envFiles);

        // 7. Update version tracking ONLY after successful verification
        if (!project.componentVersions) {
          project.componentVersions = {};
        }
        project.componentVersions[componentId] = {
          version: newVersion,
          lastUpdated: new Date().toISOString()
        };

        this.logger.info(`[Update] Successfully updated ${componentId} to ${newVersion}`);

        // 8. Cleanup snapshot on success
        await fs.rm(snapshotPath, { recursive: true, force: true });
        this.logger.debug(`[Update] Removed snapshot (update successful)`);

      } catch (error) {
        // AUTOMATIC ROLLBACK: Restore snapshot on ANY failure
        this.logger.error(`[Update] Update failed, rolling back to snapshot`, error as Error);
        
        try {
          // RESILIENT ROLLBACK: Try multiple strategies with retries
          await this.performRobustRollback(component.path, snapshotPath);
          
          this.logger.info(`[Update] Rollback successful - component restored to previous state`);
          
          // RESILIENCE: Format user-friendly error message
          throw new Error(this.formatUpdateError(error as Error));
        } catch (rollbackError) {
          // Rollback itself failed - critical situation
          this.logger.error(`[Update] CRITICAL: Rollback failed`, rollbackError as Error);
          throw new Error(
            `Update failed AND rollback failed. Manual recovery required. Snapshot at: ${snapshotPath}`
          );
        }
      }
    } finally {
      // Always release lock
      this.updatingComponents.delete(componentId);
    }
  }

  /**
   * PUBLIC: Retry rollback manually (called from UI when user clicks "Retry Rollback")
   * This is the same logic as automatic rollback, made public for manual retries
   */
  async retryRollback(targetPath: string, snapshotPath: string): Promise<void> {
    this.logger.info(`[Rollback] Manual retry requested for ${targetPath}`);
    await this.performRobustRollback(targetPath, snapshotPath);
    this.logger.info(`[Rollback] Manual retry successful`);
  }

  /**
   * RESILIENT ROLLBACK: Multiple strategies to restore snapshot even with file locks
   * Tries progressively more aggressive approaches:
   * 1. Simple copy+remove (works across devices)
   * 2. Retry with exponential backoff (handles transient locks)
   * 3. Force removal with delays (gives processes time to release locks)
   */
  private async performRobustRollback(targetPath: string, snapshotPath: string): Promise<void> {
    const maxRetries = 5;
    const baseDelay = 500; // ms
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.logger.debug(`[Rollback] Attempt ${attempt}/${maxRetries}`);
        
        // Strategy 1: Remove broken directory (with force flag)
        try {
          await fs.rm(targetPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
          this.logger.debug(`[Rollback] Removed broken component directory`);
        } catch (rmError) {
          // If removal fails, it might not exist - that's OK, continue
          this.logger.debug(`[Rollback] Could not remove target (might not exist): ${(rmError as Error).message}`);
        }
        
        // Strategy 2: Copy snapshot to target (works across devices, unlike rename)
        await fs.cp(snapshotPath, targetPath, { 
          recursive: true,
          force: true,
          errorOnExist: false
        });
        this.logger.debug(`[Rollback] Copied snapshot to target location`);
        
        // Strategy 3: Verify restoration by checking critical file
        const pkgPath = path.join(targetPath, 'package.json');
        await fs.access(pkgPath);
        this.logger.debug(`[Rollback] Verified restoration (package.json exists)`);
        
        // Success! Cleanup snapshot
        try {
          await fs.rm(snapshotPath, { recursive: true, force: true });
          this.logger.debug(`[Rollback] Cleaned up snapshot after successful restoration`);
        } catch {
          // Snapshot cleanup failure is not critical - log and continue
          this.logger.debug(`[Rollback] Could not remove snapshot (non-critical)`);
        }
        
        return; // Success!
        
      } catch (attemptError) {
        this.logger.debug(`[Rollback] Attempt ${attempt} failed: ${(attemptError as Error).message}`);
        
        if (attempt === maxRetries) {
          // Final attempt failed - throw to trigger manual recovery message
          throw attemptError;
        }
        
        // Wait with exponential backoff before next attempt
        const delay = baseDelay * Math.pow(2, attempt - 1);
        this.logger.debug(`[Rollback] Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * RESILIENCE: Format error messages to be user-friendly
   * Detects common failure types (network, offline, timeout) and provides helpful context
   */
  private formatUpdateError(error: Error): string {
    const message = error.message.toLowerCase();
    
    // Network/offline errors
    if (message.includes('fetch') || message.includes('network') || 
        message.includes('enotfound') || message.includes('econnrefused')) {
      return 'Update failed: No internet connection. Please check your network and try again.';
    }
    
    // Timeout errors
    if (message.includes('abort') || message.includes('timeout')) {
      return 'Update failed: Download timed out. Please try again with a better connection.';
    }
    
    // HTTP errors
    if (message.includes('http 404')) {
      return 'Update failed: Release not found on GitHub. The version may have been removed.';
    }
    if (message.includes('http 403')) {
      return 'Update failed: Access denied. GitHub rate limit may be exceeded.';
    }
    if (message.includes('http')) {
      return `Update failed: Server error (${error.message}). Please try again later.`;
    }
    
    // Extraction/verification errors
    if (message.includes('verification failed') || message.includes('missing after extraction')) {
      return `Update failed: Downloaded component is incomplete or corrupted. Please try again.`;
    }
    
    // Generic fallback with original message
    return `Update failed and was rolled back: ${error.message}`;
  }

  /**
   * Verify component structure after extraction
   * Ensures critical files exist before marking update as successful
   */
  private async verifyComponentStructure(componentPath: string, componentId: string): Promise<void> {
    this.logger.debug(`[Update] Verifying component structure for ${componentId}`);
    
    // Define required files per component type
    const requiredFiles: string[] = ['package.json'];
    
    // Add component-specific requirements
    if (componentId === 'commerce-mesh') {
      requiredFiles.push('mesh.json');
    }
    
    // Check all required files exist
    for (const file of requiredFiles) {
      const filePath = path.join(componentPath, file);
      try {
        await fs.access(filePath);
        this.logger.debug(`[Update] ✓ Verified ${file} exists`);
      } catch {
        throw new Error(`Component verification failed: ${file} missing after extraction`);
      }
    }
    
    // Verify package.json is valid JSON
    try {
      const pkgPath = path.join(componentPath, 'package.json');
      const pkgContent = await fs.readFile(pkgPath, 'utf-8');
      JSON.parse(pkgContent);
      this.logger.debug('[Update] ✓ package.json is valid JSON');
    } catch {
      throw new Error('Component verification failed: package.json is invalid');
    }
    
    this.logger.info(`[Update] ✓ Component structure verified successfully`);
  }

  /**
   * Backup .env files before component removal (simplified - just .env and .env.local)
   */
  private async backupEnvFiles(componentPath: string): Promise<Map<string, string>> {
    const envFiles = new Map<string, string>();
    const envPatterns = ['.env', '.env.local'];
    
    for (const filename of envPatterns) {
      const envPath = path.join(componentPath, filename);
      try {
        const content = await fs.readFile(envPath, 'utf-8');
        envFiles.set(filename, content);
        this.logger.debug(`[Update] Backed up ${filename}`);
      } catch {
        // File doesn't exist, skip
      }
    }
    
    return envFiles;
  }

  /**
   * Download and extract component archive from GitHub
   * Uses existing command execution and timeout patterns
   */
  private async downloadAndExtract(
    downloadUrl: string,
    targetPath: string,
    componentId: string
  ): Promise<void> {
    const { getExternalCommandManager } = await import('../extension');
    const commandManager = getExternalCommandManager();
    
    const tempZip = path.join(path.dirname(targetPath), `${componentId}-temp.zip`);
    
    try {
      // Download zip with timeout
      this.logger.debug(`[Update] Downloading from ${downloadUrl}`);
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUTS.UPDATE_DOWNLOAD);
      
      try {
        const response = await fetch(downloadUrl, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`Download failed: HTTP ${response.status}`);
        }
        const buffer = await response.arrayBuffer();
        await fs.writeFile(tempZip, Buffer.from(buffer));
        this.logger.debug(`[Update] Downloaded ${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB`);
      } finally {
        clearTimeout(timeout);
      }
      
      // Extract zip (GitHub archives have root folder, need to strip it)
      await fs.mkdir(targetPath, { recursive: true });
      
      // Reuse existing command execution pattern with timeout and path enhancement
      await commandManager.execute(
        `unzip -q "${tempZip}" -d "${targetPath}" && mv "${targetPath}"/*/* "${targetPath}"/`,
        { 
          timeout: TIMEOUTS.UPDATE_EXTRACT,
          enhancePath: true
        }
      );
      
      this.logger.debug(`[Update] Extracted to ${targetPath}`);
    } finally {
      // Cleanup temp zip
      try {
        await fs.unlink(tempZip);
      } catch {}
    }
  }

  /**
   * Merge .env files: preserve user values, add new defaults
   * CRITICAL: Uses programmatic write suppression to prevent false notifications
   */
  private async mergeEnvFiles(
    componentPath: string,
    oldEnvFiles: Map<string, string>
  ): Promise<void> {
    // IMPORTANT: Register programmatic writes BEFORE writing files
    const envFilePaths = Array.from(oldEnvFiles.keys()).map(filename => 
      path.join(componentPath, filename)
    );
    
    await vscode.commands.executeCommand(
      'demoBuilder._internal.registerProgrammaticWrites', 
      envFilePaths
    );
    
    this.logger.debug(`[Update] Registered ${envFilePaths.length} programmatic writes with file watcher`);
    
    // Now perform merge and write - file watcher will ignore these changes
    for (const [filename, oldContent] of oldEnvFiles.entries()) {
      const envPath = path.join(componentPath, filename);
      
      // Check if new version has .env.example
      const examplePath = path.join(componentPath, `${filename}.example`);
      let newTemplate = '';
      
      try {
        newTemplate = await fs.readFile(examplePath, 'utf-8');
      } catch {
        // No example file, just restore old .env as-is
        await fs.writeFile(envPath, oldContent, 'utf-8');
        this.logger.debug(`[Update] Restored ${filename} (no template found)`);
        continue;
      }
      
      // Parse both files
      const oldVars = this.parseEnvFile(oldContent);
      const templateVars = this.parseEnvFile(newTemplate);
      
      // Merge strategy: keep all old values, add new keys with default values
      const merged = new Map([...templateVars, ...oldVars]);
      
      // Write merged content
      const mergedContent = Array.from(merged.entries())
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');
      
      await fs.writeFile(envPath, mergedContent + '\n', 'utf-8');
      
      const addedKeys = Array.from(templateVars.keys()).filter(k => !oldVars.has(k));
      if (addedKeys.length > 0) {
        this.logger.info(`[Update] Merged ${filename}: added ${addedKeys.length} new variables (${addedKeys.join(', ')})`);
      } else {
        this.logger.info(`[Update] Merged ${filename}: preserved user config, no new variables`);
      }
    }
  }

  /**
   * Parse .env file content into key-value pairs
   */
  private parseEnvFile(content: string): Map<string, string> {
    const vars = new Map<string, string>();
    
    content.split('\n').forEach(line => {
      line = line.trim();
      if (!line || line.startsWith('#')) return;
      
      const [key, ...valueParts] = line.split('=');
      if (key) {
        vars.set(key.trim(), valueParts.join('=').trim());
      }
    });
    
    return vars;
  }
}

