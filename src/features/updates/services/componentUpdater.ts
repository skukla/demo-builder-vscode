import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { Logger } from '@/core/logging';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { Project } from '@/types';
import { toAppError, isTimeout, isNetwork } from '@/types/errors';
import { DEFAULT_SHELL } from '@/types/shell';
import { parseJSON } from '@/types/typeGuards';

export class ComponentUpdater {
    private logger: Logger;
    private extensionPath: string;
    private updatingComponents = new Set<string>(); // Concurrent update lock

    constructor(logger: Logger, extensionPath: string) {
        this.logger = logger;
        this.extensionPath = extensionPath;
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
        newVersion: string,
    ): Promise<void> {
        const component = project.componentInstances?.[componentId];
        if (!component?.path) {
            throw new Error(`Component ${componentId} not found`);
        }

        // RESILIENCE: Check for concurrent updates
        if (this.updatingComponents.has(componentId)) {
            throw new Error(`Update already in progress for ${componentId}`);
        }

        this.updatingComponents.add(componentId);

        try {
            this.logger.debug(`[Updates] Updating ${componentId} to ${newVersion}`);

            // CRITICAL: Always create snapshot for rollback
            const snapshotPath = `${component.path}.snapshot-${Date.now()}`;

            try {
                // 1. Create pre-update snapshot (full directory backup)
                this.logger.debug(`[Updates] Creating snapshot at ${snapshotPath}`);
                await fs.cp(component.path, snapshotPath, { recursive: true });

                // 2. Preserve .env file(s) for merge
                const envFiles = await this.backupEnvFiles(component.path);

                // 3. Remove old component directory
                await fs.rm(component.path, { recursive: true, force: true });

                // 4. Download and extract new version
                await this.downloadAndExtract(downloadUrl, component.path, componentId);

                // 5. VERIFY component structure (critical files exist)
                await this.verifyComponentStructure(component.path, componentId);

                // 5.5. Run post-update build for components that require it
                await this.runPostUpdateBuild(component.path, componentId);

                // 6. Restore and merge .env files (with programmatic write suppression)
                await this.mergeEnvFiles(component.path, envFiles);

                // 7. Update version tracking ONLY after successful verification
                if (!project.componentVersions) {
                    project.componentVersions = {};
                }
                project.componentVersions[componentId] = {
                    version: newVersion,
                    lastUpdated: new Date().toISOString(),
                };

                this.logger.info(`[Updates] Successfully updated ${componentId} to ${newVersion}`);

                // 8. Cleanup snapshot on success
                await fs.rm(snapshotPath, { recursive: true, force: true });
                this.logger.debug('[Updates] Removed snapshot (update successful)');

            } catch (error) {
                // AUTOMATIC ROLLBACK: Restore snapshot on ANY failure
                this.logger.error('[Updates] Update failed, rolling back to snapshot', error as Error);
        
                try {
                    // Remove broken update (if exists)
                    await fs.rm(component.path, { recursive: true, force: true });
          
                    // Restore snapshot
                    await fs.rename(snapshotPath, component.path);
          
                    this.logger.debug('[Updates] Rollback successful - component restored to previous state');
          
                    // RESILIENCE: Format user-friendly error message
                    throw new Error(this.formatUpdateError(error as Error));
                } catch (rollbackError) {
                    // Rollback itself failed - critical situation
                    this.logger.error('[Updates] CRITICAL: Rollback failed', rollbackError as Error);
                    throw new Error(
                        `Update failed AND rollback failed. Manual recovery required. Snapshot at: ${snapshotPath}`,
                    );
                }
            }
        } finally {
            // Always release lock
            this.updatingComponents.delete(componentId);
        }
    }

    /**
   * RESILIENCE: Format error messages to be user-friendly
   * Uses typed error detection for common failure types and provides helpful context
   */
    private formatUpdateError(error: Error): string {
        const appError = toAppError(error);
        const message = error.message.toLowerCase();

        // Network/offline errors - use typed error detection
        if (isNetwork(appError)) {
            return 'Update failed: No internet connection. Please check your network and try again.';
        }

        // Timeout errors - use typed error detection
        if (isTimeout(appError)) {
            return 'Update failed: Download timed out. Please try again with a better connection.';
        }

        // HTTP errors - still use string detection for specific status codes
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
            return 'Update failed: Downloaded component is incomplete or corrupted. Please try again.';
        }

        // Generic fallback with user message from typed error
        return `Update failed and was rolled back: ${appError.userMessage}`;
    }

    /**
   * Verify component structure after extraction
   * Ensures critical files exist before marking update as successful
   */
    private async verifyComponentStructure(componentPath: string, componentId: string): Promise<void> {
        this.logger.debug(`[Updates] Verifying component structure for ${componentId}`);
    
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
                this.logger.debug(`[Updates] ✓ Verified ${file} exists`);
            } catch {
                throw new Error(`Component verification failed: ${file} missing after extraction`);
            }
        }
    
        // Verify package.json is valid JSON
        try {
            const pkgPath = path.join(componentPath, 'package.json');
            const pkgContent = await fs.readFile(pkgPath, 'utf-8');
            const pkg = parseJSON<Record<string, unknown>>(pkgContent);
            if (!pkg) {
                throw new Error('Invalid JSON');
            }
            this.logger.debug('[Updates] ✓ package.json is valid JSON');
        } catch {
            throw new Error('Component verification failed: package.json is invalid');
        }
    
        this.logger.debug('[Updates] ✓ Component structure verified successfully');
    }

    /**
     * Run post-update build for components that require compilation/processing
     *
     * Uses component registry configuration (buildScript, nodeVersion) to determine
     * what build steps are required. This makes the system extensible - any component
     * with a buildScript in components.json will be built after updates.
     */
    private async runPostUpdateBuild(componentPath: string, componentId: string): Promise<void> {
        // Get component configuration from registry
        const { ComponentRegistryManager } = await import('@/features/components/services/ComponentRegistryManager');
        const registryManager = new ComponentRegistryManager(this.extensionPath);
        const componentDef = await registryManager.getComponentById(componentId);

        // Skip if component has no buildScript configured
        const buildScript = componentDef?.configuration?.buildScript;
        if (!buildScript) {
            this.logger.debug(`[Updates] No buildScript configured for ${componentId}, skipping build`);
            return;
        }

        this.logger.debug(`[Updates] Running post-update setup for ${componentId}...`);

        const { ServiceLocator } = await import('@/core/di');
        const commandManager = ServiceLocator.getCommandExecutor();
        const nodeVersion = componentDef.configuration?.nodeVersion || null;

        try {
            // 1. Install dependencies (build scripts may require dev dependencies)
            this.logger.debug('[Updates] Installing dependencies...');
            const installResult = await commandManager.execute('npm install --no-fund --prefer-offline', {
                cwd: componentPath,
                timeout: TIMEOUTS.NPM_INSTALL,
                shell: DEFAULT_SHELL,
                enhancePath: true,
                useNodeVersion: nodeVersion,
            });

            if (installResult.code !== 0) {
                throw new Error(`npm install failed: ${installResult.stderr || installResult.stdout}`);
            }
            this.logger.debug('[Updates] ✓ Dependencies installed');

            // 2. Run configured build script (force rebuild for updates)
            this.logger.debug(`[Updates] Running build script: ${buildScript}`);
            const buildResult = await commandManager.execute(`npm run ${buildScript} -- --force`, {
                cwd: componentPath,
                timeout: TIMEOUTS.NPM_INSTALL,
                shell: DEFAULT_SHELL,
                enhancePath: true,
                useNodeVersion: nodeVersion,
            });

            if (buildResult.code !== 0) {
                throw new Error(`Build failed: ${buildResult.stderr || buildResult.stdout}`);
            }

            this.logger.debug('[Updates] ✓ Post-update build completed successfully');
        } catch (error) {
            this.logger.error('[Updates] Post-update build failed', error as Error);
            throw new Error(`Post-update build failed for ${componentId}: ${(error as Error).message}`);
        }
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
                this.logger.debug(`[Updates] Backed up ${filename}`);
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
        componentId: string,
    ): Promise<void> {
        // SECURITY: Validate GitHub URL before downloading
        const { validateGitHubDownloadURL } = await import('@/core/validation');
        try {
            validateGitHubDownloadURL(downloadUrl);
        } catch (error) {
            this.logger.error('[Updates] Download URL validation failed', error as Error);
            throw new Error(`Security check failed: ${(error as Error).message}`);
        }

        const { ServiceLocator } = await import('@/core/di');
        const commandManager = ServiceLocator.getCommandExecutor();

        const tempZip = path.join(path.dirname(targetPath), `${componentId}-temp.zip`);

        try {
            // Download zip with timeout
            this.logger.debug(`[Updates] Downloading from ${downloadUrl}`);

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), TIMEOUTS.UPDATE_DOWNLOAD);

            try {
                const response = await fetch(downloadUrl, { signal: controller.signal });
                if (!response.ok) {
                    throw new Error(`Download failed: HTTP ${response.status}`);
                }
                const buffer = await response.arrayBuffer();
                await fs.writeFile(tempZip, Buffer.from(buffer));
                this.logger.debug(`[Updates] Downloaded ${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB`);
            } finally {
                clearTimeout(timeout);
            }
      
            // Extract zip (GitHub archives have root folder, need to strip it)
            await fs.mkdir(targetPath, { recursive: true });

            // Reuse existing command execution pattern with timeout, shell, and path enhancement
            // SECURITY: shell is SAFE here because:
            // - tempZip and targetPath are internal paths (not user input)
            // - downloadUrl is validated by validateGitHubDownloadURL() before this point
            // - All paths are controlled by the extension (no user-supplied paths)
            //
            // GitHub archives have a root folder (e.g., "skukla-commerce-mesh-abc123/")
            // We need to: 1) extract, 2) move contents up, 3) remove the empty root folder
            await commandManager.execute(
                `unzip -q "${tempZip}" -d "${targetPath}" && mv "${targetPath}"/*/* "${targetPath}"/ && rmdir "${targetPath}"/*/`,
                {
                    shell: DEFAULT_SHELL,    // CRITICAL FIX: Required for command chaining (&&) and glob expansion (*/*)
                    timeout: TIMEOUTS.UPDATE_EXTRACT,
                    enhancePath: true,
                },
            );

            this.logger.debug(`[Updates] Extracted to ${targetPath}`);
        } finally {
            // Cleanup temp zip
            try {
                await fs.unlink(tempZip);
            } catch {
                // Ignore cleanup errors
            }
        }
    }

    /**
   * Merge .env files: preserve user values, add new defaults
   * CRITICAL: Uses programmatic write suppression to prevent false notifications
   */
    private async mergeEnvFiles(
        componentPath: string,
        oldEnvFiles: Map<string, string>,
    ): Promise<void> {
    // IMPORTANT: Register programmatic writes BEFORE writing files
        const envFilePaths = Array.from(oldEnvFiles.keys()).map(filename => 
            path.join(componentPath, filename),
        );
    
        await vscode.commands.executeCommand(
            'demoBuilder._internal.registerProgrammaticWrites', 
            envFilePaths,
        );
    
        this.logger.debug(`[Updates] Registered ${envFilePaths.length} programmatic writes with file watcher`);
    
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
                this.logger.debug(`[Updates] Restored ${filename} (no template found)`);
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
                this.logger.debug(`[Updates] Merged ${filename}: added ${addedKeys.length} new variables (${addedKeys.join(', ')})`);
            } else {
                this.logger.debug(`[Updates] Merged ${filename}: preserved user config, no new variables`);
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

