import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { ENV_VAR_RENAMES, mergeEnvContent, parseEnvFile } from './envMerge';
import { classifyTransience, extractErrorMessage } from '@/core/errors';
import type { CommandExecutor } from '@/core/shell/commandExecutor';
import { DEFAULT_SHELL } from '@/core/shell/defaultShell';
import { nodeForInstall } from '@/core/shell/demoBuilderNode';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import {
    moveCloneToRelease,
    type ComponentRelease,
} from '@/features/app-builder/services/integrationReleaseSource';
import type { SourceUpdateResult } from '@/features/app-builder/services/integrationSourceUpdate';
import type { ComponentInstance, Project } from '@/types/base';
import type { TransformedComponentDefinition } from '@/types/components';
import type { Logger } from '@/types/logger';
import { parseJSON } from '@/types/typeGuards';

/**
 * How much build output to dump on failure.
 *
 * Same budget as the deploy-path build dump in `core/shell/buildComponent.ts`
 * and the mesh deploy dump in `meshDeployment.ts` — a reader looking for one of
 * these should find the same shape wherever a build or deploy step failed.
 */
const BUILD_OUTPUT_LOG_LIMIT = 500;

/** Moves a component's folder to a release. Its real-git behaviour is pinned in integrationReleaseSource.test.ts. */
export type MoveToRelease = (
    componentPath: string,
    repoUrl: string | undefined,
    release: ComponentRelease,
) => Promise<SourceUpdateResult>;

/**
 * A move that stopped before changing anything: the SC's own edits, or GitHub out of reach. There
 * is nothing to roll back, and rolling back would cost the folder its dependencies for nothing.
 */
class NothingMoved extends Error {}

export class ComponentUpdater {
    private logger: Logger;
    private extensionPath: string;
    private updatingComponents = new Set<string>(); // Concurrent update lock
    private moveToRelease: MoveToRelease;

    /** ADR-015: the executor arrives with the logger and extension path. */
    constructor(
        logger: Logger,
        extensionPath: string,
        private commandManager: CommandExecutor,
        moveToRelease?: MoveToRelease,
    ) {
        this.logger = logger;
        this.extensionPath = extensionPath;
        this.moveToRelease =
            moveToRelease ??
            ((componentPath, repoUrl, release) =>
                moveCloneToRelease(componentPath, repoUrl, release, (command, cwd) =>
                    this.commandManager.execute(command, {
                        cwd,
                        enhancePath: true,
                        shell: DEFAULT_SHELL,
                        timeout: TIMEOUTS.LONG,
                    }),
                ));
    }

    /**
   * Update a component to a specific version with automatic rollback on failure
   * - Prevents concurrent updates to same component
   * - ALWAYS creates snapshot before update (excludes node_modules for speed - can be reinstalled)
   * - Moves the folder to the release, refusing if it holds the SC's own edits
   * - Verifies component structure after the move
   * - Merges .env files (preserves user config)
   * - Uses programmatic write suppression to avoid false notifications
   * - Automatically rolls back on ANY failure
   * - Only updates version tracking after successful verification
   */
    async updateComponent(
        project: Project,
        componentId: string,
        tag: string,
        newVersion: string,
    ): Promise<void> {
        const component = project.componentInstances?.[componentId];
        if (!component?.path) {
            throw new Error(`Component ${componentId} not found in project state`);
        }

        // RESILIENCE: Verify component path exists on filesystem
        // Handles cases where component was deleted but still registered in state
        try {
            await fs.access(component.path);
        } catch {
            throw new Error(
                `Component ${componentId} path does not exist on filesystem: ${component.path}. ` +
                'The component may have been deleted. Remove it from the project or reinstall it.',
            );
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
                // 1. Create pre-update snapshot (exclude node_modules for speed)
                this.logger.debug(`[Updates] Creating snapshot at ${snapshotPath}`);
                await fs.cp(component.path, snapshotPath, { 
                    recursive: true,
                    filter: (src: string) => {
                        // Exclude node_modules - can be regenerated with npm install
                        return !src.includes('node_modules');
                    },
                });

                // 2. Preserve .env file(s) for merge
                const envFiles = await this.backupEnvFiles(component.path);

                // 3. Move to the release. It keeps what the SC changed: edits refuse the move.
                const moved = await this.moveToRelease(component.path, component.repoUrl, {
                    tag,
                    version: newVersion,
                });
                if (moved.status === 'refused' || moved.status === 'failed') {
                    throw new NothingMoved(moved.detail);
                }

                // 5. VERIFY component structure (critical files exist)
                await this.verifyComponentStructure(component.path, componentId);

                // 5.5. Run post-update build for components that require it
                await this.runPostUpdateBuild(component.path, componentId);

                // 6. Restore and merge .env files (with programmatic write suppression)
                await this.mergeEnvFiles(component.path, envFiles);

                // 6.5. Record the Node it was just installed under, so Start Demo runs it there
                await this.recordNodeVersion(component, componentId);

                // 7. Update version tracking ONLY after successful verification
                if (!project.componentVersions) {
                    project.componentVersions = {};
                }
                project.componentVersions[componentId] = {
                    version: newVersion,
                    lastUpdated: new Date().toISOString(),
                };

                // Also update componentInstances.version to stay in sync
                // (projectFileLoader.discoverComponents prefers this over componentVersions)
                component.version = newVersion;

                this.logger.info(`[Updates] Successfully updated ${componentId} to ${newVersion}`);

                // 8. Cleanup snapshot on success
                await fs.rm(snapshotPath, { recursive: true, force: true });
                this.logger.debug('[Updates] Removed snapshot (update successful)');

            } catch (error) {
                if (error instanceof NothingMoved) {
                    await fs.rm(snapshotPath, { recursive: true, force: true });
                    throw new Error(error.message);
                }

                // AUTOMATIC ROLLBACK: Restore snapshot on ANY failure
                this.logger.error('[Updates] Update failed, rolling back to snapshot', error as Error);
        
                try {
                    // Remove broken update (if exists)
                    await fs.rm(component.path, { recursive: true, force: true });
          
                    // Restore snapshot
                    await fs.rename(snapshotPath, component.path);
          
                    this.logger.debug('[Updates] Rollback successful - component restored to previous state');
          
                    // Reinstall node_modules (not included in snapshot)
                    this.logger.debug('[Updates] Reinstalling dependencies after rollback');
                    
                    // Try to get node version from registry, but don't fail if we can't
                    // During rollback, we just want to get dependencies installed
                    let nodeVersion: string | null = null;
                    try {
                        nodeVersion = nodeForInstall(await this.componentDefinition(componentId));
                    } catch (_error) {
                        this.logger.debug('[Updates] Could not determine node version from registry, using default');
                    }

                    const installResult = await this.commandManager.execute('npm install --no-fund', {
                        cwd: component.path,
                        timeout: TIMEOUTS.VERY_LONG,
                        shell: DEFAULT_SHELL,
                        enhancePath: true,
                        useNodeVersion: nodeVersion,
                    });

                    if (installResult.code !== 0) {
                        this.logger.warn(`[Updates] Failed to reinstall dependencies after rollback: ${installResult.stderr}`);
                    } else {
                        this.logger.debug('[Updates] ✓ Dependencies reinstalled');
                    }
                } catch (rollbackError) {
                    // Rollback itself failed - critical situation
                    this.logger.error('[Updates] CRITICAL: Rollback failed', rollbackError as Error);
                    throw new Error(
                        `Update failed AND rollback failed. Manual recovery required. Snapshot at: ${snapshotPath}`,
                    );
                }

                // RESILIENCE: Format user-friendly error message. Thrown OUTSIDE the
                // rollback try: inside it, the rollback catch caught this very throw and
                // every failed update — rollback included — reported "rollback failed".
                throw new Error(this.formatUpdateError(error as Error));
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
        const transience = classifyTransience(error);
        const message = error.message.toLowerCase();

        // Network/offline errors - use typed error detection
        if (transience.kind === 'network') {
            return 'Update failed: No internet connection. Please check your network and try again.';
        }

        // Timeout errors - use typed error detection
        if (transience.kind === 'timeout') {
            return 'Update failed: GitHub timed out. Please try again with a better connection.';
        }

        if (message.includes('verification failed')) {
            return 'Update failed: The new version is incomplete. Please try again.';
        }

        // The message is THIS EXTENSION'S OWN, not a library's, which is why it is
        // passed through rather than replaced by a generic. Everything reaching here
        // was thrown by our code with a deliberate sentence -- "Build failed (exit 1):
        // tsc: 3 errors", "Security check failed: not a GitHub host". Convention 1 bans
        // handing over the LIBRARY's words; these are already the translation.
        //
        // Replacing it with a generic was tried on 2026-09-11 and six tests caught it
        // immediately: the rule is about whose words they are, not which field they
        // arrived in.
        return `Update failed and was rolled back: ${extractErrorMessage(error)}`;
    }

    /**
   * Verify component structure after the move
   * Ensures critical files exist before marking update as successful
   */
    private async verifyComponentStructure(componentPath: string, componentId: string): Promise<void> {
        this.logger.debug(`[Updates] Verifying component structure for ${componentId}`);
    
        // Define required files per component type
        const requiredFiles: string[] = ['package.json'];
    
        // Check all required files exist
        for (const file of requiredFiles) {
            const filePath = path.join(componentPath, file);
            try {
                await fs.access(filePath);
                this.logger.debug(`[Updates] ✓ Verified ${file} exists`);
            } catch {
                throw new Error(`Component verification failed: ${file} missing after the update`);
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
     * Rewrite the component's recorded Node (`metadata.nodeVersion`) to the Node the
     * update just installed it under (`nodeForInstall`: Demo Builder's Node, PR-1a).
     * Start Demo reads the record, so without this a moved Node moved the install
     * and left `npm run dev` on the old one. A component that installs nothing (an
     * EDS storefront) keeps whatever it had.
     */
    private async recordNodeVersion(instance: ComponentInstance, componentId: string): Promise<void> {
        const declared = nodeForInstall(await this.componentDefinition(componentId));
        if (!declared) return;
        instance.metadata = { ...instance.metadata, nodeVersion: declared };
    }

    /**
     * Run post-update setup: install dependencies and optionally build
     *
     * A new version can need different dependencies, so this always installs them
     * (unless skipNpmInstall is set), then
     * runs the build script if one is configured.
     */
    private async runPostUpdateBuild(componentPath: string, componentId: string): Promise<void> {
        const componentDef = await this.componentDefinition(componentId);

        const nodeVersion = nodeForInstall(componentDef);
        const skipNpmInstall = componentDef?.configuration?.skipNpmInstall === true;
        const buildScript = componentDef?.configuration?.buildScript;

        // No package.json check here: verifyComponentStructure has already required
        // one, so a guard on it could never be false when this runs.
        try {
            // 1. Install dependencies (unless skipped)
            if (!skipNpmInstall) {
                this.logger.debug(`[Updates] Installing dependencies for ${componentId}`);
                const installResult = await this.commandManager.execute('npm install --no-fund', {
                    cwd: componentPath,
                    timeout: TIMEOUTS.VERY_LONG,
                    shell: DEFAULT_SHELL,
                    enhancePath: true,
                    useNodeVersion: nodeVersion,
                });

                if (installResult.code !== 0) {
                    throw new Error(`npm install failed: ${installResult.stderr || installResult.stdout}`);
                }
                this.logger.debug('[Updates] ✓ Dependencies installed');
            }

            // 2. Run configured build script (only if buildScript is set)
            if (buildScript) {
                this.logger.debug(`[Updates] Running build script: ${buildScript}`);
                const buildResult = await this.commandManager.execute(`npm run ${buildScript} -- --force`, {
                    cwd: componentPath,
                    timeout: TIMEOUTS.VERY_LONG,
                    shell: DEFAULT_SHELL,
                    enhancePath: true,
                    useNodeVersion: nodeVersion,
                });

                if (buildResult.code !== 0) {
                    // Dump BEFORE throwing, for the same reason the deploy-path
                    // build does (`core/shell/buildComponent.ts`): the logger keeps
                    // only a message's FIRST line and then redacts a leading path
                    // wholesale, which is exactly what node prints on an uncaught
                    // exception — so the message cannot be the record.
                    this.logger.debug('[Updates] Post-update build failed', {
                        code: buildResult.code,
                        stdout: buildResult.stdout?.substring(0, BUILD_OUTPUT_LOG_LIMIT),
                        stderr: buildResult.stderr?.substring(0, BUILD_OUTPUT_LOG_LIMIT),
                    });
                    throw new Error(
                        `Build failed (exit ${buildResult.code}): ${buildResult.stderr || buildResult.stdout}`,
                    );
                }
                this.logger.debug('[Updates] ✓ Post-update build completed successfully');
            }
        } catch (error) {
            this.logger.error('[Updates] Post-update setup failed', error as Error);
            throw new Error(`Post-update setup failed for ${componentId}: ${(error as Error).message}`);
        }
    }

    /** The catalog entry for a component id — the one lookup both the build and the rollback use. */
    private async componentDefinition(
        componentId: string,
    ): Promise<TransformedComponentDefinition | undefined> {
        const { getComponentRegistryManager } = await import(
            '@/features/components/services/componentRegistryInstance'
        );
        return getComponentRegistryManager(this.extensionPath).getComponentById(componentId);
    }

    /**
   * Backup .env files before the move (simplified - just .env and .env.local)
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
      
            const mergedContent = mergeEnvContent(oldContent, newTemplate, ENV_VAR_RENAMES);
            await fs.writeFile(envPath, mergedContent, 'utf-8');
      
            const addedKeys = Array.from(parseEnvFile(newTemplate).keys()).filter(
                (k) => !parseEnvFile(oldContent).has(k),
            );
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
}

