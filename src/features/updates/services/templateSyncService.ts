/**
 * Template Sync Service
 *
 * Applies upstream template updates to an EDS storefront project.
 * Supports two strategies:
 * - merge: Attempts git merge, preserving local customizations
 * - reset: Full reset to template (loses customizations)
 *
 * Key files (fstab.yaml, config.json) are preserved regardless of strategy.
 */

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import type { Logger } from '@/types/logger';
import type { Project } from '@/types';
import { COMPONENT_IDS } from '@/core/constants';
import { ServiceLocator } from '@/core/di';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { DEFAULT_SHELL } from '@/types/shell';
import { GitHubTokenService } from '@/features/eds/services/githubTokenService';
import { GitHubFileOperations } from '@/features/eds/services/githubFileOperations';
import { injectTokenIntoUrl } from '@/features/eds/services/githubHelpers';

/**
 * Options for template sync operation
 */
export interface TemplateSyncOptions {
    /** Sync strategy: 'merge' attempts git merge, 'reset' does full reset */
    strategy: 'merge' | 'reset';
    /** Files to preserve (never overwritten) - always includes fstab.yaml */
    preserveFiles?: string[];
}

/**
 * Result of template sync operation
 */
export interface TemplateSyncResult {
    /** Whether sync completed successfully */
    success: boolean;
    /** Strategy that was actually used (may differ from requested if fallback occurred) */
    strategy: 'merge' | 'reset';
    /** Commit SHA after sync */
    syncedCommit: string;
    /** Files with merge conflicts (if any) */
    conflicts?: string[];
    /** Error message if sync failed */
    error?: string;
    /** Whether fallback to reset occurred due to conflicts */
    fallbackOccurred?: boolean;
}

/**
 * Files that should never be overwritten during template sync
 * These contain project-specific configuration
 */
const DEFAULT_PRESERVE_FILES = [
    'fstab.yaml',       // Helix content source configuration
    'config.json',      // Commerce endpoint configuration
];

/**
 * Template Sync Service
 *
 * Synchronizes an EDS project with its upstream template.
 */
export class TemplateSyncService {
    private logger: Logger;
    private secrets: vscode.SecretStorage;

    constructor(secrets: vscode.SecretStorage, logger: Logger) {
        this.secrets = secrets;
        this.logger = logger;
    }

    /**
     * Sync local EDS project with upstream template
     *
     * @param project - Project to sync
     * @param options - Sync options (strategy and files to preserve)
     * @returns Sync result
     */
    async syncWithTemplate(
        project: Project,
        options: TemplateSyncOptions,
    ): Promise<TemplateSyncResult> {
        // Extract EDS metadata
        const edsInstance = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT];
        if (!edsInstance?.metadata) {
            return {
                success: false,
                strategy: options.strategy,
                syncedCommit: '',
                error: 'No EDS metadata found in project',
            };
        }

        const metadata = edsInstance.metadata as Record<string, unknown>;
        const githubRepo = metadata.githubRepo as string | undefined;
        const templateOwner = metadata.templateOwner as string | undefined;
        const templateRepo = metadata.templateRepo as string | undefined;

        if (!githubRepo || !templateOwner || !templateRepo) {
            return {
                success: false,
                strategy: options.strategy,
                syncedCommit: '',
                error: 'Missing required metadata: githubRepo, templateOwner, or templateRepo',
            };
        }

        // Parse owner/repo from githubRepo
        const [repoOwner, repoName] = githubRepo.split('/');
        if (!repoOwner || !repoName) {
            return {
                success: false,
                strategy: options.strategy,
                syncedCommit: '',
                error: `Invalid githubRepo format: ${githubRepo}`,
            };
        }

        // Combine default and custom preserve files
        const preserveFiles = [
            ...DEFAULT_PRESERVE_FILES,
            ...(options.preserveFiles ?? []),
        ];

        // Execute sync based on strategy
        if (options.strategy === 'merge') {
            return this.mergeFromTemplate(
                repoOwner,
                repoName,
                templateOwner,
                templateRepo,
                preserveFiles,
            );
        } else {
            return this.resetToTemplate(
                repoOwner,
                repoName,
                templateOwner,
                templateRepo,
                preserveFiles,
            );
        }
    }

    /**
     * Smart merge from template preserving customizations
     *
     * Attempts git merge, falls back to reset if conflicts detected.
     */
    private async mergeFromTemplate(
        repoOwner: string,
        repoName: string,
        templateOwner: string,
        templateRepo: string,
        preserveFiles: string[],
    ): Promise<TemplateSyncResult> {
        const githubTokenService = new GitHubTokenService(this.secrets, this.logger);
        const token = await githubTokenService.getToken();
        if (!token) {
            return {
                success: false,
                strategy: 'merge',
                syncedCommit: '',
                error: 'Not authenticated with GitHub',
            };
        }

        const commandManager = ServiceLocator.getCommandExecutor();
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'template-sync-'));
        this.logger.info(`[TemplateSync] Starting merge from ${templateOwner}/${templateRepo} to ${repoOwner}/${repoName}`);

        try {
            // Step 1: Clone user's repo
            this.logger.debug(`[TemplateSync] Cloning user repo...`);
            const userRepoUrl = injectTokenIntoUrl(`https://github.com/${repoOwner}/${repoName}.git`, token.token);
            const cloneResult = await commandManager.execute(
                `git clone --depth 50 --branch main "${userRepoUrl}" repo`,
                { cwd: tempDir, timeout: TIMEOUTS.LONG, shell: DEFAULT_SHELL },
            );
            if (cloneResult.code !== 0) {
                throw new Error(`Failed to clone user repo: ${cloneResult.stderr}`);
            }

            const repoDir = path.join(tempDir, 'repo');

            // Step 2: Backup preserved files
            const backups = await this.backupPreservedFiles(repoDir, preserveFiles);

            // Step 3: Add template as remote and fetch
            this.logger.debug(`[TemplateSync] Fetching template repo...`);
            const templateUrl = `https://github.com/${templateOwner}/${templateRepo}.git`;
            await commandManager.execute(`git remote add template "${templateUrl}"`, {
                cwd: repoDir, timeout: TIMEOUTS.QUICK, shell: DEFAULT_SHELL,
            });

            const fetchResult = await commandManager.execute(`git fetch template main`, {
                cwd: repoDir, timeout: TIMEOUTS.LONG, shell: DEFAULT_SHELL,
            });
            if (fetchResult.code !== 0) {
                throw new Error(`Failed to fetch template: ${fetchResult.stderr}`);
            }

            // Step 4: Try merge (without commit)
            this.logger.debug(`[TemplateSync] Attempting merge...`);
            const mergeResult = await commandManager.execute(
                `git merge template/main --no-commit --no-ff`,
                { cwd: repoDir, timeout: TIMEOUTS.NORMAL, shell: DEFAULT_SHELL },
            );

            // Step 5: Check for conflicts
            const conflictResult = await commandManager.execute(
                `git diff --name-only --diff-filter=U`,
                { cwd: repoDir, timeout: TIMEOUTS.QUICK, shell: DEFAULT_SHELL },
            );
            const conflicts = conflictResult.stdout.trim().split('\n').filter(Boolean);

            if (conflicts.length > 0) {
                // Conflicts detected - abort merge and fall back to reset
                this.logger.warn(`[TemplateSync] Merge conflicts detected in ${conflicts.length} files, falling back to reset`);
                await commandManager.execute(`git merge --abort`, {
                    cwd: repoDir, timeout: TIMEOUTS.QUICK, shell: DEFAULT_SHELL,
                });

                // Restore backups before reset
                await this.restorePreservedFiles(repoDir, backups);

                // Perform reset
                const resetResult = await this.performReset(
                    repoDir,
                    templateOwner,
                    templateRepo,
                    preserveFiles,
                    backups,
                    commandManager,
                );

                return {
                    ...resetResult,
                    conflicts,
                    fallbackOccurred: true,
                };
            }

            // Step 6: No conflicts - restore preserved files and commit
            await this.restorePreservedFiles(repoDir, backups);

            // Stage all changes
            await commandManager.execute(`git add -A`, {
                cwd: repoDir, timeout: TIMEOUTS.QUICK, shell: DEFAULT_SHELL,
            });

            // Check if there are changes to commit
            const statusResult = await commandManager.execute(`git status --porcelain`, {
                cwd: repoDir, timeout: TIMEOUTS.QUICK, shell: DEFAULT_SHELL,
            });

            let syncedCommit: string;
            if (statusResult.stdout.trim()) {
                const commitResult = await commandManager.execute(
                    `git commit -m "chore: sync with template"`,
                    { cwd: repoDir, timeout: TIMEOUTS.QUICK, shell: DEFAULT_SHELL },
                );
                if (commitResult.code !== 0) {
                    throw new Error(`Failed to commit: ${commitResult.stderr}`);
                }
            }

            // Get commit SHA
            const shaResult = await commandManager.execute(`git rev-parse HEAD`, {
                cwd: repoDir, timeout: TIMEOUTS.QUICK, shell: DEFAULT_SHELL,
            });
            syncedCommit = shaResult.stdout.trim();

            // Step 7: Push to origin
            this.logger.debug(`[TemplateSync] Pushing to origin...`);
            const pushResult = await commandManager.execute(`git push origin main`, {
                cwd: repoDir, timeout: TIMEOUTS.LONG, shell: DEFAULT_SHELL,
            });
            if (pushResult.code !== 0) {
                throw new Error(`Failed to push: ${pushResult.stderr}`);
            }

            this.logger.info(`[TemplateSync] Merge completed successfully`);
            return {
                success: true,
                strategy: 'merge',
                syncedCommit,
            };
        } catch (error) {
            this.logger.error(`[TemplateSync] Merge failed`, error as Error);
            return {
                success: false,
                strategy: 'merge',
                syncedCommit: '',
                error: (error as Error).message,
            };
        } finally {
            // Clean up temp directory
            try {
                await fs.rm(tempDir, { recursive: true, force: true });
            } catch (cleanupError) {
                this.logger.warn(`[TemplateSync] Failed to clean up temp directory: ${(cleanupError as Error).message}`);
            }
        }
    }

    /**
     * Full reset to template (loses customizations except preserved files)
     */
    private async resetToTemplate(
        repoOwner: string,
        repoName: string,
        templateOwner: string,
        templateRepo: string,
        preserveFiles: string[],
    ): Promise<TemplateSyncResult> {
        const githubTokenService = new GitHubTokenService(this.secrets, this.logger);
        const token = await githubTokenService.getToken();
        if (!token) {
            return {
                success: false,
                strategy: 'reset',
                syncedCommit: '',
                error: 'Not authenticated with GitHub',
            };
        }

        const commandManager = ServiceLocator.getCommandExecutor();
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'template-sync-'));
        this.logger.info(`[TemplateSync] Starting reset from ${templateOwner}/${templateRepo} to ${repoOwner}/${repoName}`);

        try {
            // Step 1: Clone user's repo
            this.logger.debug(`[TemplateSync] Cloning user repo...`);
            const userRepoUrl = injectTokenIntoUrl(`https://github.com/${repoOwner}/${repoName}.git`, token.token);
            const cloneResult = await commandManager.execute(
                `git clone --depth 1 --branch main "${userRepoUrl}" repo`,
                { cwd: tempDir, timeout: TIMEOUTS.LONG, shell: DEFAULT_SHELL },
            );
            if (cloneResult.code !== 0) {
                throw new Error(`Failed to clone user repo: ${cloneResult.stderr}`);
            }

            const repoDir = path.join(tempDir, 'repo');

            // Step 2: Backup preserved files
            const backups = await this.backupPreservedFiles(repoDir, preserveFiles);

            // Step 3: Add template as remote and fetch
            this.logger.debug(`[TemplateSync] Fetching template repo...`);
            const templateUrl = `https://github.com/${templateOwner}/${templateRepo}.git`;
            await commandManager.execute(`git remote add template "${templateUrl}"`, {
                cwd: repoDir, timeout: TIMEOUTS.QUICK, shell: DEFAULT_SHELL,
            });

            const fetchResult = await commandManager.execute(`git fetch template main`, {
                cwd: repoDir, timeout: TIMEOUTS.LONG, shell: DEFAULT_SHELL,
            });
            if (fetchResult.code !== 0) {
                throw new Error(`Failed to fetch template: ${fetchResult.stderr}`);
            }

            // Step 4: Perform reset
            const resetResult = await this.performReset(
                repoDir,
                templateOwner,
                templateRepo,
                preserveFiles,
                backups,
                commandManager,
            );

            return resetResult;
        } catch (error) {
            this.logger.error(`[TemplateSync] Reset failed`, error as Error);
            return {
                success: false,
                strategy: 'reset',
                syncedCommit: '',
                error: (error as Error).message,
            };
        } finally {
            // Clean up temp directory
            try {
                await fs.rm(tempDir, { recursive: true, force: true });
            } catch (cleanupError) {
                this.logger.warn(`[TemplateSync] Failed to clean up temp directory: ${(cleanupError as Error).message}`);
            }
        }
    }

    /**
     * Perform the actual reset operation (shared by merge fallback and reset strategy)
     */
    private async performReset(
        repoDir: string,
        templateOwner: string,
        templateRepo: string,
        preserveFiles: string[],
        backups: Map<string, string>,
        commandManager: ReturnType<typeof ServiceLocator.getCommandExecutor>,
    ): Promise<TemplateSyncResult> {
        // Reset to template's content
        this.logger.debug(`[TemplateSync] Resetting to template content...`);
        const readTreeResult = await commandManager.execute(
            `git read-tree --reset -u template/main`,
            { cwd: repoDir, timeout: TIMEOUTS.NORMAL, shell: DEFAULT_SHELL },
        );
        if (readTreeResult.code !== 0) {
            throw new Error(`Failed to read template tree: ${readTreeResult.stderr}`);
        }

        // Restore preserved files
        await this.restorePreservedFiles(repoDir, backups);

        // Stage and commit
        await commandManager.execute(`git add -A`, {
            cwd: repoDir, timeout: TIMEOUTS.QUICK, shell: DEFAULT_SHELL,
        });

        const statusResult = await commandManager.execute(`git status --porcelain`, {
            cwd: repoDir, timeout: TIMEOUTS.QUICK, shell: DEFAULT_SHELL,
        });

        let syncedCommit: string;
        if (statusResult.stdout.trim()) {
            const commitResult = await commandManager.execute(
                `git commit -m "chore: sync with template (reset)"`,
                { cwd: repoDir, timeout: TIMEOUTS.QUICK, shell: DEFAULT_SHELL },
            );
            if (commitResult.code !== 0) {
                throw new Error(`Failed to commit: ${commitResult.stderr}`);
            }
        }

        // Get commit SHA
        const shaResult = await commandManager.execute(`git rev-parse HEAD`, {
            cwd: repoDir, timeout: TIMEOUTS.QUICK, shell: DEFAULT_SHELL,
        });
        syncedCommit = shaResult.stdout.trim();

        // Push with force (reset may rewrite history)
        this.logger.debug(`[TemplateSync] Pushing to origin...`);
        const pushResult = await commandManager.execute(`git push origin main --force`, {
            cwd: repoDir, timeout: TIMEOUTS.LONG, shell: DEFAULT_SHELL,
        });
        if (pushResult.code !== 0) {
            throw new Error(`Failed to push: ${pushResult.stderr}`);
        }

        this.logger.info(`[TemplateSync] Reset completed successfully`);
        return {
            success: true,
            strategy: 'reset',
            syncedCommit,
        };
    }

    /**
     * Backup preserved files before sync
     */
    private async backupPreservedFiles(
        repoDir: string,
        preserveFiles: string[],
    ): Promise<Map<string, string>> {
        const backups = new Map<string, string>();

        for (const filePath of preserveFiles) {
            const fullPath = path.join(repoDir, filePath);
            try {
                const content = await fs.readFile(fullPath, 'utf-8');
                backups.set(filePath, content);
                this.logger.debug(`[TemplateSync] Backed up ${filePath}`);
            } catch {
                // File doesn't exist - that's okay, skip it
                this.logger.debug(`[TemplateSync] File ${filePath} not found, skipping backup`);
            }
        }

        return backups;
    }

    /**
     * Restore preserved files after sync
     */
    private async restorePreservedFiles(
        repoDir: string,
        backups: Map<string, string>,
    ): Promise<void> {
        for (const [filePath, content] of backups) {
            const fullPath = path.join(repoDir, filePath);
            try {
                // Ensure directory exists
                await fs.mkdir(path.dirname(fullPath), { recursive: true });
                await fs.writeFile(fullPath, content, 'utf-8');
                this.logger.debug(`[TemplateSync] Restored ${filePath}`);
            } catch (error) {
                this.logger.warn(`[TemplateSync] Failed to restore ${filePath}: ${(error as Error).message}`);
            }
        }
    }

    /**
     * Update the project's lastSyncedCommit after successful sync
     *
     * @param project - Project to update
     * @param commitSha - New commit SHA to save
     * @param stateManager - State manager for persistence
     */
    async updateLastSyncedCommit(
        project: Project,
        commitSha: string,
        stateManager: { saveProject: (project: Project) => Promise<void> },
    ): Promise<void> {
        const edsInstance = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT];
        if (!edsInstance?.metadata) {
            this.logger.warn('[TemplateSync] Cannot update lastSyncedCommit - no EDS metadata');
            return;
        }

        const metadata = edsInstance.metadata as Record<string, unknown>;
        metadata.lastSyncedCommit = commitSha;

        await stateManager.saveProject(project);
        this.logger.info(`[TemplateSync] Updated lastSyncedCommit to ${commitSha.substring(0, 7)}`);
    }
}
