/**
 * The update apply: the ONE path both surfaces use (PL-80). The MCP `apply_updates`
 * tool and the Updates modal on the projects list each hand it the set
 * `updateSelections.ts` computed, and it returns structured per-category results
 * instead of showing UI. Until 2026-10-20 the Check for Updates picker had its own
 * apply beside this one (`commands/updateExecutor.ts`, deleted).
 *
 * The substantive work lives in shared services (ForkSyncService, TemplateSync-
 * Service, ComponentUpdater, ...) and — for the snapshot/marker-bearing block
 * library logic — in `applyBlockLibraryUpdateResolved`. This module is the thin
 * per-item loop and the result shaping.
 *
 * Headless block-library policy: when `demoBuilder.blockLibraries.syncBehavior`
 * is `ask` (which would prompt in the UI), this resolves to the SAFE `disabled`
 * action — it records the upstream marker without overwriting local edits, and
 * reports the library as deferred. Set the behavior to `enabled` to apply.
 *
 * A caller with a person to ask (the Updates modal, PL-80) passes `questions`: the
 * `ask` setting and a template merge conflict are then asked rather than defaulted.
 * One that shows each update as it goes passes `onItem` (`updateApplyEach.ts`).
 */

import * as vscode from 'vscode';
import { OPERATION_STAGES as S } from '@/core/utils/operationStages';
import { getProjectDisplayName } from '@/core/utils/projectDisplayName';
import { sanitizeErrorForLogging } from '@/core/validation/SensitiveDataRedactor';
import { describeUpdateLeftOut } from '@/features/eds/services/addedEntriesRecord';
import { applyAdobeMcpUpdate } from '@/features/updates/services/adobeMcpUpdateCore';
import {
    applyBlockLibraryInstall,
    describeInstallOutcome,
} from '@/features/updates/services/blockLibraryInstall';
import { ComponentUpdater } from '@/features/updates/services/componentUpdater';
import { ForkSyncService } from '@/features/updates/services/forkSyncService';
import { applyIntegrationUpdates } from '@/features/updates/services/integrationUpdates';
import { refreshLocalStorefronts } from '@/features/updates/services/localStorefrontRefresh';
import { eachItem, watchingDone, type DescribeItem, type ItemObserver } from '@/features/updates/services/updateApplyEach';
import { applyFinish } from '@/features/updates/services/updateApplyFinish';
import {
    answeredClashOutcome,
    emptyResult,
    mergeInto,
    outcomeOf,
    type ApplyUpdatesResult,
    type CategoryResult,
    type ItemOutcome,
} from '@/features/updates/services/updateApplyResult';
import {
    applyBoilerplate,
    applyTemplate,
    type OnProgress,
    type TemplateConflictPolicy,
    type UpdateQuestions,
} from '@/features/updates/services/updateApplyTemplate';
import {
    applyBlockLibraryUpdateResolved,
    updateCommitShaWithRollback,
    type UpdateContext,
} from '@/features/updates/services/updateCore';
import type { UpdateSelections } from '@/features/updates/services/updateSelections';
import { inOrder, projectsOf, selectionsWhere } from '@/features/updates/services/updateSelectionsByProject';
import { shouldSkipBlockLibrary } from '@/features/updates/services/updateSources';
import type { Project } from '@/types/base';

export type { TemplateConflictPolicy, UpdateQuestions } from '@/features/updates/services/updateApplyTemplate';

/** How an apply decides what a person would be asked, and who hears each item. */
export interface ApplyUpdatesOptions {
    templateConflicts?: TemplateConflictPolicy;
    questions?: UpdateQuestions;
    onItem?: ItemObserver;
    /** Project paths, first to last: the order the Updates modal lists them in. */
    projectOrder?: readonly string[];
    /** Told as each project's local copy starts and ends being brought up to GitHub. */
    onLocalCopy?: (project: Project, outcome: ItemOutcome) => void;
}

/** A library kept under the `ask` setting: the core records only its name. */
const KEPT_BLOCKS: DescribeItem = (result) => outcomeOf(result, () => 'Not updated — your blocks were kept.');


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


async function applyComponents(
    items: UpdateSelections['component'],
    ctx: UpdateContext,
    onProgress?: OnProgress,
): Promise<CategoryResult> {
    const result = emptyResult();
    if (items.length === 0) return result;

    // Group by project so we save once per project.
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
    // The npm-update → regenerate → persist sequence lives in its own core
    // (adobeMcpUpdateCore.ts). This loop only shapes results.
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

/** The categories an apply reports, each the sum of its projects'. */
type CategoryKey = Exclude<keyof ApplyUpdatesResult, 'totalApplied' | 'totalFailed'>;

/** What every core in one apply shares. */
interface ApplyRun {
    ctx: UpdateContext;
    onProgress?: OnProgress;
    options: ApplyUpdatesOptions;
    onItem?: ItemObserver;
    /** The items that applied, when told item by item; unknown otherwise. */
    done?: ReadonlySet<object>;
}

/**
 * One project's updates, in its kinds' order, each added to its category's result; then
 * its local copy brought up to what they wrote.
 */
async function applyProject(s: UpdateSelections, run: ApplyRun, into: Record<CategoryKey, CategoryResult>): Promise<void> {
    const { ctx, onProgress, onItem } = run;
    const { questions, templateConflicts: policy } = run.options;
    const add = (key: CategoryKey, result: CategoryResult): void => mergeInto(into[key], result);
    // First among the storefront writes: a fixed clash finishes before anything else moves the repository.
    add('finish', await eachItem('finish', s.finish, (some) => applyFinish(some, ctx, onProgress, questions), onItem));
    const succeededPaths = new Set<string>();
    add('template', await eachItem('template', s.template, async (some) => {
        const applied = await applyTemplate(some, ctx, onProgress, policy, questions);
        applied.succeededPaths.forEach((path) => succeededPaths.add(path));
        return applied.result;
    }, onItem, answeredClashOutcome));
    add('boilerplate', await eachItem('boilerplate', s.boilerplate, (some) =>
        applyBoilerplate(some, ctx, onProgress, policy, questions), onItem, answeredClashOutcome));
    add('component', await eachItem('component', s.component, (some) => applyComponents(some, ctx, onProgress), onItem));
    add('adobeMcp', await eachItem('adobeMcp', s.adobeMcp, (some) => applyAdobeMcp(some, ctx, onProgress), onItem));
    // Libraries first, then the Inspector SDK: one category, as the agent reads it.
    add('addon', await eachItem('blockLibrary', s.blockLibrary, (some) =>
        applyAddons(some, [], succeededPaths, ctx, onProgress, questions), onItem, KEPT_BLOCKS));
    add('addon', await eachItem('inspector', s.inspector, (some) =>
        applyAddons([], some, succeededPaths, ctx, onProgress, questions), onItem));
    add('blockLibraryInstall', await eachItem('blockLibraryInstall', s.blockLibraryInstall, (some) =>
        applyBlockLibraryInstalls(some, ctx, onProgress), onItem));
    add('integration', await eachItem('integration', s.integration, (some) =>
        applyIntegrationUpdates(some, ctx, onProgress), onItem));
    // Every kind above that writes a storefront writes it on GitHub; the local copy agents
    // edit is brought up to it here (EDS-57). Told item by item, only what applied wrote.
    const wrote = [...s.template, ...s.boilerplate, ...s.blockLibrary, ...s.blockLibraryInstall]
        .filter((item) => !run.done || run.done.has(item))
        .map((item) => item.project);
    if (wrote.length > 0) await refreshLocalStorefronts(wrote, ctx, onProgress, run.options.onLocalCopy);
}

/**
 * Apply all selected updates: the template repositories first, since a project's template
 * update reads from them, then one project at a time (in `projectOrder`, the Updates
 * modal's, when given), each in its kinds' order (`PROJECT_SELECTION_KINDS`). It ran by
 * kind across every project until 2026-10-21, which moved the modal's run out of the
 * order it lists (owner). Each category's result is the sum of its projects', so the
 * agent reads the same totals either way.
 */
export async function applyUpdatesHeadless(
    selections: UpdateSelections,
    ctx: UpdateContext,
    onProgress?: OnProgress,
    options: ApplyUpdatesOptions = {},
): Promise<ApplyUpdatesResult> {
    const { onItem, done } = watchingDone(options.onItem);
    const run: ApplyRun = { ctx, onProgress, options, onItem, done };
    const into: Record<CategoryKey, CategoryResult> = {
        forkSync: await eachItem('forkSync', selections.forkSync, (some) => applyForkSync(some, ctx, onProgress), onItem),
        finish: emptyResult(),
        template: emptyResult(),
        boilerplate: emptyResult(),
        component: emptyResult(),
        adobeMcp: emptyResult(),
        addon: emptyResult(),
        blockLibraryInstall: emptyResult(),
        integration: emptyResult(),
    };
    for (const project of inOrder(projectsOf(selections), options.projectOrder)) {
        await applyProject(selectionsWhere(selections, (p) => p.path === project.path), run, into);
    }
    const cats = Object.values(into);
    return {
        ...into,
        totalApplied: cats.reduce((sum, c) => sum + c.successCount, 0),
        totalFailed: cats.reduce((sum, c) => sum + c.failCount, 0),
    };
}
