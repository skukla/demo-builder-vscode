/**
 * Headless update-apply service.
 *
 * The `perform*` functions in `commands/updateExecutor.ts` drive updates from the
 * QuickPick command — they own the UI shell (running-demo prompts, progress
 * notifications, summary toasts). This module is the modal-free counterpart used
 * by the MCP `apply_updates` tool: it applies the set `updateSelections.ts`
 * computed for a project, returning structured per-category results instead of
 * showing UI.
 *
 * The substantive work lives in shared services (ForkSyncService, TemplateSync-
 * Service, ComponentUpdater, ...) and — for the snapshot/marker-bearing block
 * library logic — in `applyBlockLibraryUpdateResolved`, which both paths call.
 * The only thing that diverges here is the thin per-item loop + result shaping.
 *
 * Headless block-library policy: when `demoBuilder.blockLibraries.syncBehavior`
 * is `ask` (which would prompt in the UI), this resolves to the SAFE `disabled`
 * action — it records the upstream marker without overwriting local edits, and
 * reports the library as deferred. Set the behavior to `enabled` to apply.
 *
 * A caller with a person to ask (the Updates modal, PL-80) passes `questions`: the
 * `ask` setting and a template merge conflict are then asked rather than defaulted.
 */

import * as vscode from 'vscode';
import { OPERATION_STAGES as S } from '@/core/utils/operationStages';
import { getProjectDisplayName } from '@/core/utils/projectDisplayName';
import { sanitizeErrorForLogging } from '@/core/validation/SensitiveDataRedactor';
import { getGitHubServices } from '@/features/eds/handlers/edsServiceCache';
import { describeUpdateLeftOut } from '@/features/eds/services/addedEntriesRecord';
import { shouldSkipBlockLibrary } from '@/features/updates/commands/updateTypes';
import { applyAdobeMcpUpdate } from '@/features/updates/services/adobeMcpUpdateCore';
import {
    applyBlockLibraryInstall,
    describeInstallOutcome,
} from '@/features/updates/services/blockLibraryInstall';
import { ComponentUpdater } from '@/features/updates/services/componentUpdater';
import { ForkSyncService } from '@/features/updates/services/forkSyncService';
import { applyIntegrationUpdates } from '@/features/updates/services/integrationUpdates';
import { TemplateSyncService } from '@/features/updates/services/templateSyncService';
import type { TemplateSyncResult } from '@/features/updates/services/templateSyncTypes';
import { isThinLayerProject } from '@/features/updates/services/thinLayerUpdate';
import {
    emptyResult,
    type ApplyUpdatesResult,
    type CategoryResult,
} from '@/features/updates/services/updateApplyResult';
import {
    applyBlockLibraryUpdateResolved,
    updateCommitShaWithRollback,
    type UpdateContext,
} from '@/features/updates/services/updateCore';
import type { UpdateSelections } from '@/features/updates/services/updateSelections';
import type { Project } from '@/types/base';

/**
 * Where a category reports: the step from the stage table, the same names the
 * dashboard's apply shows (`updateStages.ts`), and the item it is on for the line
 * under it. Until slice 8 of the progress vocabulary (2026-10-16) each item was its
 * own long message ("Updating eds-storefront in My Demo").
 */
type OnProgress = (stage: string, item?: string) => void;

// ==========================================================
// Per-category apply cores (modal-free)
// ==========================================================

async function applyForkSync(
    items: UpdateSelections['forkSync'],
    ctx: UpdateContext,
    onProgress?: OnProgress,
): Promise<CategoryResult> {
    const result = emptyResult();
    if (items.length === 0) return result;
    const svc = new ForkSyncService(ctx.secrets, ctx.logger);
    for (const item of items) {
        onProgress?.(S.syncingSourceRepos.label, `${item.owner}/${item.repo}`);
        try {
            const r = await svc.syncFork(item.owner, item.repo, item.branch);
            if (r.success) {
                result.successCount++;
                ctx.logger.info(`[Updates] Fork synced: ${item.owner}/${item.repo}`);
            } else {
                result.failCount++;
                result.errors.push(
                    `${item.owner}/${item.repo}: ${r.conflict ? 'diverged from upstream (cannot fast-forward)' : r.message || 'sync failed'}`,
                );
            }
        } catch (error) {
            result.failCount++;
            result.errors.push(
                `${item.owner}/${item.repo}: ${sanitizeErrorForLogging(error as Error)}`,
            );
            ctx.logger.error(
                `[Updates] Fork sync error: ${item.owner}/${item.repo}`,
                error as Error,
            );
        }
    }
    return result;
}

/**
 * What a headless template update does when the merge stops on conflicts.
 * `stop` (the default) reports the files and changes nothing; `reset` replaces
 * them with the template's version — only when the caller asked for exactly that.
 */
export type TemplateConflictPolicy = 'stop' | 'reset';

/**
 * What a person is asked during an apply (PL-80): the Updates modal passes these, and
 * asks them in its progress window. An agent passes none, and the defaults decide: a
 * template conflict follows `templateConflicts`, a library under `ask` is kept.
 */
export interface UpdateQuestions {
    /** A template update conflicts with the SC's edits: replace those files with the template's? */
    resetTemplateOnConflict(project: Project, conflicts: string[]): Promise<boolean>;
    /** A block library under the `ask` sync setting: replace its blocks with the new ones? */
    replaceLibraryBlocks(libraryName: string, project: Project): Promise<boolean>;
}

export interface ApplyUpdatesOptions {
    templateConflicts?: TemplateConflictPolicy;
    questions?: UpdateQuestions;
}

async function syncTemplateHeadless(
    svc: TemplateSyncService,
    project: Project,
    policy: TemplateConflictPolicy,
    questions?: UpdateQuestions,
): Promise<TemplateSyncResult> {
    const merged = await svc.syncWithTemplate(project, { strategy: 'merge' });
    if (merged.success || !merged.conflicts?.length) return merged;
    // A storefront on the tested boilerplate is never offered a reset to the bare
    // template: it would drop Demo Builder's fixes (EDS-51); the service refuses it too.
    const reset =
        policy === 'reset' ||
        (!isThinLayerProject(project) && (await questions?.resetTemplateOnConflict(project, merged.conflicts)));
    if (!reset) return merged;
    return svc.syncWithTemplate(project, { strategy: 'reset' });
}

async function applyTemplate(
    items: UpdateSelections['template'],
    ctx: UpdateContext,
    onProgress?: OnProgress,
    policy: TemplateConflictPolicy = 'stop',
    questions?: UpdateQuestions,
): Promise<{ result: CategoryResult; succeededPaths: Set<string> }> {
    const result = emptyResult();
    const succeededPaths = new Set<string>();
    if (items.length === 0) return { result, succeededPaths };
    const svc = new TemplateSyncService(getGitHubServices(ctx.secrets), ctx.logger, ctx.commandManager);
    for (const { project } of items) {
        onProgress?.(S.updatingTemplate.label, project.name);
        try {
            const r = await syncTemplateHeadless(svc, project, policy, questions);
            if (r.success) {
                await svc.updateLastSyncedCommit(project, r.syncedCommit, ctx.stateManager);
                succeededPaths.add(project.path);
                result.successCount++;
                ctx.logger.info(`[Updates] Template synced for ${project.name} (${r.strategy})`);
                // A fix or piece the update could not put back (EDS-51), in plain words.
                for (const note of r.notes ?? []) (result.applied ??= []).push(`${project.name}: ${note}`);
            } else {
                throw new Error(r.error || 'Unknown error');
            }
        } catch (error) {
            result.failCount++;
            result.errors.push(`${project.name}: ${sanitizeErrorForLogging(error as Error)}`);
            ctx.logger.error(`[Updates] Template sync failed for ${project.name}`, error as Error);
        }
    }
    return { result, succeededPaths };
}

async function applyComponents(
    items: UpdateSelections['component'],
    ctx: UpdateContext,
    onProgress?: OnProgress,
): Promise<CategoryResult> {
    const result = emptyResult();
    if (items.length === 0) return result;

    // Group by project so we save once per project (mirrors performComponentUpdates).
    const byProject = new Map<string, { project: Project; items: UpdateSelections['component'] }>();
    for (const item of items) {
        const entry = byProject.get(item.project.path) ?? { project: item.project, items: [] };
        entry.items.push(item);
        byProject.set(item.project.path, entry);
    }

    const updater = new ComponentUpdater(ctx.logger, ctx.extensionPath, ctx.commandManager);
    for (const { project, items: updates } of byProject.values()) {
        for (const update of updates) {
            if (!update.downloadUrl) continue;
            // Its display name, not its id: line 2 reads as a phrase (owner, 2026-10-16).
            const shown = project.componentInstances?.[update.componentId]?.name ?? update.componentId;
            onProgress?.(S.updatingComponents.label, `${shown} in ${project.name}`);
            try {
                await updater.updateComponent(
                    project,
                    update.componentId,
                    update.downloadUrl,
                    update.latestVersion,
                );
                result.successCount++;
                ctx.logger.info(`[Updates] Updated ${update.componentId} in ${project.name}`);
            } catch (error) {
                result.failCount++;
                result.errors.push(
                    `${update.componentId} in ${project.name}: ${sanitizeErrorForLogging(error as Error)}`,
                );
                ctx.logger.error(
                    `[Updates] Failed to update ${update.componentId} in ${project.name}`,
                    error as Error,
                );
            }
        }
        await ctx.stateManager.saveProject(project);
    }
    return result;
}

async function applyAdobeMcp(
    items: UpdateSelections['adobeMcp'],
    ctx: UpdateContext,
    onProgress?: OnProgress,
): Promise<CategoryResult> {
    const result = emptyResult();
    // No empty-list return here: unlike its siblings this core constructs no
    // service, so the loop below already does nothing for nothing.
    // The npm-update → regenerate → persist sequence lives in the ONE shared
    // core (adobeMcpUpdateCore.ts), which the interactive sibling
    // `performAdobeMcpUpdates` also calls. This loop only shapes results.
    // (Until 2026-08-04 this path carried its own copy that ran `npm update`
    // in the STOREFRONT dir — a silent no-op that re-offered the same update
    // forever. The shared core is what makes that drift impossible now.)
    for (const { project, packageName, latestVersion } of items) {
        onProgress?.(S.updatingAiTools.label, `${packageName} ${latestVersion} in ${project.name}`);
        try {
            await applyAdobeMcpUpdate(project, packageName, latestVersion, ctx);
            result.successCount++;
        } catch (error) {
            result.failCount++;
            result.errors.push(`${project.name}: ${sanitizeErrorForLogging(error as Error)}`);
            ctx.logger.error(
                `[Updates] Failed to update ${packageName} in ${project.name}`,
                error as Error,
            );
        }
    }
    return result;
}

async function applyAddons(
    blockLibraries: UpdateSelections['blockLibrary'],
    inspector: UpdateSelections['inspector'],
    succeededTemplatePaths: Set<string>,
    ctx: UpdateContext,
    onProgress?: OnProgress,
    questions?: UpdateQuestions,
): Promise<CategoryResult> {
    const result = emptyResult();

    // 'ask' asks a person when there is one; headless, it is the safe 'disabled'
    // (record the marker; do not overwrite local edits).
    const setting = vscode.workspace
        .getConfiguration('demoBuilder.blockLibraries')
        .get<'ask' | 'enabled' | 'disabled'>('syncBehavior', 'ask');
    const behaviorFor = async (item: UpdateSelections['blockLibrary'][number]): Promise<'enabled' | 'disabled'> => {
        if (setting !== 'ask') return setting === 'enabled' ? 'enabled' : 'disabled';
        return (await questions?.replaceLibraryBlocks(item.library.name, item.project)) ? 'enabled' : 'disabled';
    };

    for (const item of blockLibraries) {
        if (shouldSkipBlockLibrary(item.library, item.project, succeededTemplatePaths)) {
            ctx.logger.info(
                `[Updates] Add-on dedup: skipping "${item.library.name}" — covered by template sync`,
            );
            continue;
        }
        onProgress?.(S.updatingAddOns.label, item.library.name);
        try {
            const behavior = await behaviorFor(item);
            const leftOut = await applyBlockLibraryUpdateResolved(item, behavior, ctx);
            const note = describeUpdateLeftOut(item, leftOut);
            if (note) (result.leftOut ??= []).push(note);
            // Kept under 'ask', by a person's answer or by the headless default: not applied.
            if (setting === 'ask' && behavior === 'disabled') {
                (result.deferred ??= []).push(item.library.name);
            } else {
                result.successCount++;
            }
        } catch (error) {
            result.failCount++;
            result.errors.push(`${item.library.name}: ${sanitizeErrorForLogging(error as Error)}`);
            ctx.logger.error(
                `[Updates] Failed to update block library "${item.library.name}"`,
                error as Error,
            );
        }
    }

    for (const item of inspector) {
        onProgress?.(S.updatingAddOns.label, `Inspector SDK in ${item.project.name}`);
        try {
            await updateCommitShaWithRollback(
                item.project.installedInspectorSdk,
                item.latestCommit,
                () => ctx.stateManager.saveProject(item.project),
            );
            result.successCount++;
            ctx.logger.info(`[Updates] Updated Inspector SDK in ${item.project.name}`);
        } catch (error) {
            result.failCount++;
            result.errors.push(
                `Inspector SDK in ${item.project.name}: ${sanitizeErrorForLogging(error as Error)}`,
            );
            ctx.logger.error(
                `[Updates] Failed to update Inspector SDK in ${item.project.name}`,
                error as Error,
            );
        }
    }

    return result;
}

/**
 * Install each selected-but-missing block library. Not gated by
 * `syncBehavior`: an install only adds block folders that are not in the
 * storefront yet (see blockLibraryInstall.ts), and the caller's `confirm:true`
 * is the consent for the commit it makes.
 */
async function applyBlockLibraryInstalls(
    items: UpdateSelections['blockLibraryInstall'],
    ctx: UpdateContext,
    onProgress?: OnProgress,
): Promise<CategoryResult> {
    const result = emptyResult();
    for (const item of items) {
        onProgress?.(S.addingBlockLibraries.label, item.library.name);
        try {
            const outcome = await applyBlockLibraryInstall(item, ctx);
            result.successCount++;
            (result.installed ??= []).push(describeInstallOutcome(outcome, getProjectDisplayName(item.project)));
        } catch (error) {
            result.failCount++;
            result.errors.push(`${item.library.name}: ${sanitizeErrorForLogging(error as Error)}`);
            ctx.logger.error(
                `[Updates] Failed to install block library "${item.library.name}"`,
                error as Error,
            );
        }
    }
    return result;
}

// ==========================================================
// Orchestrator
// ==========================================================

/**
 * Apply all selected updates headlessly, in the same category order the QuickPick
 * command uses (fork → template → components → Adobe MCP → add-ons → block
 * library installs → integration pairs), threading template-sync successes into
 * the add-on dedup.
 */
export async function applyUpdatesHeadless(
    selections: UpdateSelections,
    ctx: UpdateContext,
    onProgress?: OnProgress,
    options: ApplyUpdatesOptions = {},
): Promise<ApplyUpdatesResult> {
    const forkSync = await applyForkSync(selections.forkSync, ctx, onProgress);
    const { result: template, succeededPaths } = await applyTemplate(
        selections.template,
        ctx,
        onProgress,
        options.templateConflicts,
        options.questions,
    );
    const component = await applyComponents(selections.component, ctx, onProgress);
    const adobeMcp = await applyAdobeMcp(selections.adobeMcp, ctx, onProgress);
    const addon = await applyAddons(
        selections.blockLibrary,
        selections.inspector,
        succeededPaths,
        ctx,
        onProgress,
        options.questions,
    );

    const blockLibraryInstall = await applyBlockLibraryInstalls(
        selections.blockLibraryInstall,
        ctx,
        onProgress,
    );

    const integration = await applyIntegrationUpdates(selections.integration, ctx, onProgress);

    const cats = [forkSync, template, component, adobeMcp, addon, blockLibraryInstall, integration];
    return {
        forkSync,
        template,
        component,
        adobeMcp,
        addon,
        blockLibraryInstall,
        integration,
        totalApplied: cats.reduce((s, c) => s + c.successCount, 0),
        totalFailed: cats.reduce((s, c) => s + c.failCount, 0),
    };
}
