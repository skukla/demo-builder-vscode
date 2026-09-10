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
    type AdobeMcpUpdateItem,
    type BlockLibraryUpdateItem,
    type ForkSyncItem,
    type InspectorUpdateItem,
    type ProjectUpdateItem,
    type TemplateUpdateItem,
} from './updateTypes';
import { sleep } from '@/core/utils/sleep';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { sanitizeErrorForLogging } from '@/core/validation/SensitiveDataRedactor';
import { applyAdobeMcpUpdate } from '@/features/updates/services/adobeMcpUpdateCore';
import { ComponentUpdater } from '@/features/updates/services/componentUpdater';
import { ForkSyncService } from '@/features/updates/services/forkSyncService';
import { TemplateSyncService } from '@/features/updates/services/templateSyncService';
import {
    applyBlockLibraryUpdateResolved,
    updateCommitShaWithRollback,
    type UpdateContext,
} from '@/features/updates/services/updateCore';

// Re-exported verbatim for existing importers (checkUpdates, tests); the
// definitions moved to services/updateCore.ts so the headless apply service
// stops importing from a commands module.
export { applyBlockLibraryUpdateResolved, updateCommitShaWithRollback, type UpdateContext };

/**
 * User preference for two-way block library sync. Mirrors the
 * `demoBuilder.blockLibraries.syncBehavior` setting in package.json.
 */
type BlockLibrarySyncBehavior = 'ask' | 'enabled' | 'disabled';

function readSyncBehavior(): BlockLibrarySyncBehavior {
    return vscode.workspace
        .getConfiguration('demoBuilder.blockLibraries')
        .get<BlockLibrarySyncBehavior>('syncBehavior', 'ask');
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
        await sleep(TIMEOUTS.DEMO_STOP_WAIT);
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
                ctx.logger.warn(
                    `[Updates] Fork sync failed: ${item.owner}/${item.repo} — ${result.message}`,
                );
            }
        } catch (error) {
            const sanitizedError = sanitizeErrorForLogging(error as Error);
            ctx.logger.error(
                `[Updates] Fork sync error: ${item.owner}/${item.repo}`,
                error as Error,
            );
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
            filtered = filtered.filter((s) => s.project.path !== selection.project.path);
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
            const templateSyncService = new TemplateSyncService(ctx.secrets, ctx.logger, ctx.commandManager);
            let successCount = 0;
            let failCount = 0;

            for (const selection of filtered) {
                const project = selection.project;

                progress.report({
                    message: `${project.name}…`,
                    increment: 100 / filtered.length,
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
                        ctx.logger.info(
                            `[Updates] Template synced for ${project.name} (${result.strategy}${result.fallbackOccurred ? ', fallback' : ''})`,
                        );

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
                    ctx.logger.error(
                        `[Updates] Template sync failed for ${project.name}`,
                        error as Error,
                    );
                    vscode.window.showErrorMessage(
                        `Failed to sync template for ${project.name}: ${sanitizedError}`,
                    );
                }
            }

            return { successCount, failCount };
        },
    );

    if (successCount > 0) {
        const message =
            failCount > 0
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
            const componentUpdater = new ComponentUpdater(ctx.logger, ctx.extensionPath, ctx.commandManager);
            let successCount = 0;
            let failCount = 0;

            for (const [, updates] of projectUpdates.entries()) {
                const project = updates[0].project;

                for (const update of updates) {
                    if (!update.releaseInfo) continue;

                    progress.report({
                        message: `${update.componentId} in ${project.name}…`,
                        increment: 100 / totalUpdates,
                    });

                    try {
                        await componentUpdater.updateComponent(
                            project,
                            update.componentId,
                            update.releaseInfo.downloadUrl,
                            update.latestVersion,
                        );
                        successCount++;
                        ctx.logger.info(
                            `[Updates] Updated ${update.componentId} in ${project.name}`,
                        );
                    } catch (error) {
                        failCount++;
                        const sanitizedError = sanitizeErrorForLogging(error as Error);
                        ctx.logger.error(
                            `[Updates] Failed to update ${update.componentId} in ${project.name}`,
                            error as Error,
                        );
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
// Adobe MCP package updates
// ---------------------------------------------------------------------------

/**
 * Apply the Adobe MCP package update in each selected project via the shared
 * `applyAdobeMcpUpdate` core (npm update in the isolated tools dir →
 * regenerate AI context files → persist the freshness stamp). This function
 * owns only the UI shell — running-demo guard per project,
 * `vscode.window.withProgress`, per-project error isolation — mirroring
 * `performComponentUpdates`.
 *
 * No storefront-path guard here: `AdobeMcpUpdateItem`s only exist because
 * `AdobeMcpUpdateChecker.checkForUpdates` passed its own EDS gate (it returns
 * null without a storefront path), so the checker is the contract.
 */
export async function performAdobeMcpUpdates(
    selections: AdobeMcpUpdateItem[],
    ctx: UpdateContext,
): Promise<void> {
    // Dedupe by project path (a project should only appear once anyway).
    const byProject = new Map<string, AdobeMcpUpdateItem>();
    for (const sel of selections) {
        byProject.set(sel.project.path, sel);
    }

    // Running-demo guard per project.
    for (const [, item] of byProject.entries()) {
        const canProceed = await ensureProjectStopped(item.project, 'Update', ctx);
        if (!canProceed) byProject.delete(item.project.path);
    }

    if (byProject.size === 0) return;

    const total = byProject.size;
    const { successCount, failCount } = await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Updating Adobe MCP',
            cancellable: false,
        },
        async (progress) => {
            let successCount = 0;
            let failCount = 0;

            for (const [, item] of byProject.entries()) {
                const { project, packageName, latestVersion } = item;

                progress.report({
                    message: `${packageName} → ${latestVersion} in ${project.name}…`,
                    increment: 100 / total,
                });

                try {
                    await applyAdobeMcpUpdate(project, packageName, latestVersion, ctx);
                    successCount++;
                } catch (error) {
                    failCount++;
                    const sanitizedError = sanitizeErrorForLogging(error as Error);
                    ctx.logger.error(
                        `[Updates] Failed to update ${packageName} in ${project.name}`,
                        error as Error,
                    );
                    vscode.window.showErrorMessage(
                        `Failed to update Adobe MCP in ${project.name}: ${sanitizedError}`,
                    );
                }
            }

            return { successCount, failCount };
        },
    );

    if (failCount > 0) {
        vscode.window.showWarningMessage(
            `Updated ${successCount} Adobe MCP package(s), ${failCount} failed.`,
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
    const syncBehavior = readSyncBehavior();

    for (const item of blockLibrarySelections) {
        if (shouldSkipBlockLibrary(item.library, item.project, templateSyncSucceeded)) {
            ctx.logger.info(
                `[Updates] Add-on dedup: skipping "${item.library.name}" — covered by template sync`,
            );
            continue;
        }

        try {
            await applyBlockLibraryUpdate(item, syncBehavior, ctx);
        } catch (error) {
            const sanitizedError = sanitizeErrorForLogging(error as Error);
            ctx.logger.error(
                `[Updates] Failed to update block library "${item.library.name}"`,
                error as Error,
            );
            vscode.window.showErrorMessage(
                `Failed to update ${item.library.name}: ${sanitizedError}`,
            );
        }
    }

    for (const item of inspectorSelections) {
        try {
            await updateCommitShaWithRollback(
                item.project.installedInspectorSdk,
                item.latestCommit,
                () => ctx.stateManager.saveProject(item.project),
            );
            ctx.logger.info(`[Updates] Updated Inspector SDK in ${item.project.name}`);
        } catch (error) {
            const sanitizedError = sanitizeErrorForLogging(error as Error);
            ctx.logger.error(
                `[Updates] Failed to update Inspector SDK in ${item.project.name}`,
                error as Error,
            );
            vscode.window.showErrorMessage(`Failed to update Inspector SDK: ${sanitizedError}`);
        }
    }
}

/**
 * Apply a block library update according to `demoBuilder.blockLibraries.syncBehavior`.
 *
 * - `disabled`: record the upstream SHA in `syncDisabledMarker` and skip both
 *   the file re-install and the `commitSha` bump. The storefront stays at the
 *   install-time commit; the AI Overview screen interprets the
 *   marker as "Sync disabled — N commits behind upstream".
 * - `ask`: prompt the user. "Update" continues as if `enabled`; "Skip"
 *   continues as if `disabled`; dialog dismissal aborts the per-library
 *   update entirely.
 * - `enabled`: re-install block files from upstream via the same atomic-tree-
 *   commit path used during project creation (`installBlockCollections`), then
 *   bump `commitSha` on success. Clears any previous `syncDisabledMarker`.
 *
 * NOTE: The re-install overwrites any local edits to block files. A 3-way
 * merge when local edits exist will require upstream-fetching infrastructure
 * not yet in place. Until the 3-way merge ships, users should commit/promote
 * local block edits BEFORE accepting a library update (or set `syncBehavior`
 * to `disabled`).
 */
async function applyBlockLibraryUpdate(
    item: BlockLibraryUpdateItem,
    syncBehavior: BlockLibrarySyncBehavior,
    ctx: UpdateContext,
): Promise<void> {
    const lib = item.project.installedBlockLibraries?.find((l) => l.name === item.library.name);
    if (!lib) {
        ctx.logger.warn(
            `[Updates] Block library "${item.library.name}" not in installedBlockLibraries; skipping`,
        );
        return;
    }

    // Narrowed by RESOLUTION, not by cast: 'ask' either becomes a concrete
    // choice below or the function returns. The `as` this replaces silenced
    // the one check that would catch a new BlockLibrarySyncBehavior member
    // slipping through unresolved (2026-08-27 sweep; the repo's boundary-cast
    // rule).
    let effectiveBehavior: 'enabled' | 'disabled';
    if (syncBehavior === 'ask') {
        const choice = await vscode.window.showInformationMessage(
            `Library "${item.library.name}" has new commits upstream. ` +
                `Apply the update? This will overwrite any local edits to block files in this library.`,
            'Update',
            'Skip',
        );
        if (!choice) {
            ctx.logger.info(`[Updates] User dismissed update dialog for "${item.library.name}"`);
            return;
        }
        effectiveBehavior = choice === 'Update' ? 'enabled' : 'disabled';
    } else {
        effectiveBehavior = syncBehavior;
    }

    await applyBlockLibraryUpdateResolved(item, effectiveBehavior, ctx);
}
