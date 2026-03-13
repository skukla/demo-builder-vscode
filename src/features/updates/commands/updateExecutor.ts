/**
 * Update execution functions for the Check Updates command.
 *
 * Each function performs a specific category of update after the user
 * has made their selection in the QuickPick. Extracted from
 * CheckUpdatesCommand to keep the command class under the 500-line limit.
 */

import * as vscode from 'vscode';
import {
    shouldSkipBlockLibrary,
    type BlockLibraryUpdateItem,
    type ForkSyncItem,
    type InspectorUpdateItem,
    type ProjectUpdateItem,
    type TemplateUpdateItem,
} from './updateTypes';
import type { StateManager } from '@/core/state';
import { TIMEOUTS } from '@/core/utils';
import { sanitizeErrorForLogging } from '@/core/validation';
import { ComponentUpdater } from '@/features/updates/services/componentUpdater';
import { ForkSyncService } from '@/features/updates/services/forkSyncService';
import { TemplateSyncService } from '@/features/updates/services/templateSyncService';
import type { Logger } from '@/types/logger';

// ---------------------------------------------------------------------------
// Context passed from the command to executor functions
// ---------------------------------------------------------------------------

export interface UpdateContext {
    secrets: vscode.SecretStorage;
    extensionPath: string;
    stateManager: StateManager;
    logger: Logger;
}

// ---------------------------------------------------------------------------
// Shared: running demo guard
// ---------------------------------------------------------------------------

/**
 * If the project is running, prompt the user to stop it.
 * Returns true if the project is safe to update, false if skipped.
 */
async function ensureProjectStopped(
    project: { name: string; path: string; status?: string },
    actionVerb: string,
    ctx: UpdateContext,
): Promise<boolean> {
    if (project.status !== 'running') return true;

    const stop = await vscode.window.showWarningMessage(
        `"${project.name}" is currently running. Stop it before updating?`,
        `Stop & ${actionVerb}`,
        'Skip',
    );

    if (!stop || stop === 'Skip') {
        ctx.logger.debug(`[Updates] Skipping ${project.name} (demo running, user declined)`);
        return false;
    }

    const currentProject = await ctx.stateManager.getCurrentProject();
    if (currentProject?.path === project.path) {
        await vscode.commands.executeCommand('demoBuilder.stopDemo');
        await new Promise(resolve => setTimeout(resolve, TIMEOUTS.DEMO_STOP_WAIT));
    }

    return true;
}

// ---------------------------------------------------------------------------
// Fork sync
// ---------------------------------------------------------------------------

export async function performForkSyncUpdates(
    selections: ForkSyncItem[],
    ctx: UpdateContext,
): Promise<void> {
    const forkSyncService = new ForkSyncService(ctx.secrets, ctx.logger);

    for (const item of selections) {
        try {
            const result = await forkSyncService.syncFork(item.owner, item.repo, item.branch);
            if (result.success) {
                ctx.logger.info(`[Updates] Fork synced: ${item.owner}/${item.repo}`);
            } else if (result.conflict) {
                vscode.window.showWarningMessage(
                    `${item.owner}/${item.repo} has diverged from upstream and cannot be fast-forwarded.`,
                );
                ctx.logger.warn(`[Updates] Fork sync conflict: ${item.owner}/${item.repo}`);
            } else {
                ctx.logger.warn(`[Updates] Fork sync failed: ${item.owner}/${item.repo} — ${result.message}`);
            }
        } catch (error) {
            const sanitizedError = sanitizeErrorForLogging(error as Error);
            ctx.logger.error(`[Updates] Fork sync error: ${item.owner}/${item.repo}`, error as Error);
            vscode.window.showErrorMessage(
                `Failed to sync fork ${item.owner}/${item.repo}: ${sanitizedError}`,
            );
        }
    }
}

// ---------------------------------------------------------------------------
// Template sync
// ---------------------------------------------------------------------------

export async function performTemplateUpdates(
    selections: TemplateUpdateItem[],
    ctx: UpdateContext,
): Promise<Set<string>> {
    const succeededPaths = new Set<string>();

    // Check for running demos first
    let filtered = selections;
    for (const selection of filtered) {
        const canProceed = await ensureProjectStopped(selection.project, 'Sync', ctx);
        if (!canProceed) {
            filtered = filtered.filter(s => s.project.path !== selection.project.path);
        }
    }

    if (filtered.length === 0) {
        return succeededPaths;
    }

    const { successCount, failCount } = await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Syncing Templates',
            cancellable: false,
        },
        async (progress) => {
            const templateSyncService = new TemplateSyncService(ctx.secrets, ctx.logger);
            let successCount = 0;
            let failCount = 0;

            for (const selection of filtered) {
                const project = selection.project;

                progress.report({
                    message: `${project.name}...`,
                    increment: (100 / filtered.length),
                });

                try {
                    const result = await templateSyncService.syncWithTemplate(project, {
                        strategy: 'merge',
                    });

                    if (result.success) {
                        await templateSyncService.updateLastSyncedCommit(
                            project,
                            result.syncedCommit,
                            ctx.stateManager,
                        );

                        successCount++;
                        succeededPaths.add(project.path);
                        ctx.logger.info(`[Updates] Template synced for ${project.name} (${result.strategy}${result.fallbackOccurred ? ', fallback' : ''})`);

                        if (result.fallbackOccurred && result.conflicts) {
                            vscode.window.showWarningMessage(
                                `${project.name}: Merge conflicts in ${result.conflicts.length} files, fell back to reset.`,
                            );
                        }
                    } else {
                        throw new Error(result.error || 'Unknown error');
                    }
                } catch (error) {
                    failCount++;
                    const sanitizedError = sanitizeErrorForLogging(error as Error);
                    ctx.logger.error(`[Updates] Template sync failed for ${project.name}`, error as Error);
                    vscode.window.showErrorMessage(
                        `Failed to sync template for ${project.name}: ${sanitizedError}`,
                    );
                }
            }

            return { successCount, failCount };
        },
    );

    if (successCount > 0) {
        const message = failCount > 0
            ? `Synced ${successCount} template(s), ${failCount} failed.`
            : `Successfully synced ${successCount} template(s).`;
        vscode.window.showInformationMessage(message);
    }

    return succeededPaths;
}

// ---------------------------------------------------------------------------
// Component updates
// ---------------------------------------------------------------------------

export async function performComponentUpdates(
    selections: ProjectUpdateItem[],
    ctx: UpdateContext,
): Promise<void> {
    const projectUpdates = new Map<string, ProjectUpdateItem[]>();
    for (const selection of selections) {
        const key = selection.project.path;
        if (!projectUpdates.has(key)) {
            projectUpdates.set(key, []);
        }
        projectUpdates.get(key)?.push(selection);
    }

    // Check for running demos first
    for (const [, updates] of projectUpdates.entries()) {
        const project = updates[0].project;
        const canProceed = await ensureProjectStopped(project, 'Update', ctx);
        if (!canProceed) {
            projectUpdates.delete(project.path);
        }
    }

    if (projectUpdates.size === 0) {
        return;
    }

    const totalUpdates = Array.from(projectUpdates.values()).reduce((sum, u) => sum + u.length, 0);

    const { successCount, failCount } = await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Updating Components',
            cancellable: false,
        },
        async (progress) => {
            const componentUpdater = new ComponentUpdater(ctx.logger, ctx.extensionPath);
            let successCount = 0;
            let failCount = 0;

            for (const [, updates] of projectUpdates.entries()) {
                const project = updates[0].project;

                for (const update of updates) {
                    if (!update.releaseInfo) continue;

                    progress.report({
                        message: `${update.componentId} in ${project.name}...`,
                        increment: (100 / totalUpdates),
                    });

                    try {
                        await componentUpdater.updateComponent(
                            project,
                            update.componentId,
                            update.releaseInfo.downloadUrl,
                            update.latestVersion,
                        );
                        successCount++;
                        ctx.logger.info(`[Updates] Updated ${update.componentId} in ${project.name}`);
                    } catch (error) {
                        failCount++;
                        const sanitizedError = sanitizeErrorForLogging(error as Error);
                        ctx.logger.error(`[Updates] Failed to update ${update.componentId} in ${project.name}`, error as Error);
                        vscode.window.showErrorMessage(
                            `Failed to update ${update.componentId} in ${project.name}: ${sanitizedError}`,
                        );
                    }
                }

                await ctx.stateManager.saveProject(project);
            }

            return { successCount, failCount };
        },
    );

    if (failCount > 0) {
        vscode.window.showWarningMessage(
            `Updated ${successCount} component(s), ${failCount} failed. Restart affected demos to apply changes.`,
            'OK',
        );
    }
}

// ---------------------------------------------------------------------------
// Add-on updates (block libraries + inspector SDK)
// ---------------------------------------------------------------------------

export async function performAddonUpdates(
    blockLibrarySelections: BlockLibraryUpdateItem[],
    inspectorSelections: InspectorUpdateItem[],
    templateSyncSucceeded: Set<string>,
    ctx: UpdateContext,
): Promise<void> {
    for (const item of blockLibrarySelections) {
        if (shouldSkipBlockLibrary(item.library, item.project, templateSyncSucceeded)) {
            ctx.logger.info(`[Updates] Add-on dedup: skipping "${item.library.name}" — covered by template sync`);
            continue;
        }

        try {
            const lib = item.project.installedBlockLibraries?.find(l => l.name === item.library.name);
            await updateCommitShaWithRollback(
                lib, item.latestCommit,
                () => ctx.stateManager.saveProject(item.project),
            );
            ctx.logger.info(`[Updates] Updated block library "${item.library.name}" in ${item.project.name}`);
        } catch (error) {
            const sanitizedError = sanitizeErrorForLogging(error as Error);
            ctx.logger.error(`[Updates] Failed to update block library "${item.library.name}"`, error as Error);
            vscode.window.showErrorMessage(
                `Failed to update ${item.library.name}: ${sanitizedError}`,
            );
        }
    }

    for (const item of inspectorSelections) {
        try {
            await updateCommitShaWithRollback(
                item.project.installedInspectorSdk, item.latestCommit,
                () => ctx.stateManager.saveProject(item.project),
            );
            ctx.logger.info(`[Updates] Updated Inspector SDK in ${item.project.name}`);
        } catch (error) {
            const sanitizedError = sanitizeErrorForLogging(error as Error);
            ctx.logger.error(`[Updates] Failed to update Inspector SDK in ${item.project.name}`, error as Error);
            vscode.window.showErrorMessage(
                `Failed to update Inspector SDK: ${sanitizedError}`,
            );
        }
    }
}

// ---------------------------------------------------------------------------
// Shared helper
// ---------------------------------------------------------------------------

/**
 * Mutate a commitSha, save, and rollback on failure.
 * Prevents in-memory state poisoning when save throws.
 */
async function updateCommitShaWithRollback(
    target: { commitSha: string } | undefined,
    newSha: string,
    save: () => Promise<void>,
): Promise<void> {
    if (!target) return;
    const original = target.commitSha;
    target.commitSha = newSha;
    try {
        await save();
    } catch (error) {
        target.commitSha = original;
        throw error;
    }
}
