/**
 * The template part of the headless apply: one storefront's template update, and what
 * happens when it stops on the SC's edits. Split from `updateApplyService.ts` on
 * 2026-10-20 (PL-80), when the question a person is asked there took that file over
 * its size limit.
 *
 * @module features/updates/services/updateApplyTemplate
 */

import { OPERATION_STAGES as S } from '@/core/utils/operationStages';
import { sanitizeErrorForLogging } from '@/core/validation/SensitiveDataRedactor';
import { getGitHubServices } from '@/features/eds/handlers/edsServiceCache';
import { writeBoilerplateBase } from '@/features/updates/services/boilerplateBase';
import { refreshBaseFromColleague, type BaseRefreshDeps } from '@/features/updates/services/boilerplateBaseRefresh';
import { compareCommits } from '@/features/updates/services/githubApiClient';
import { TemplateSyncService } from '@/features/updates/services/templateSyncService';
import type { TemplateSyncResult } from '@/features/updates/services/templateSyncTypes';
import { emptyResult, type CategoryResult, type ClashReport } from '@/features/updates/services/updateApplyResult';
import {
    canResetOnClash,
    decideClash,
    keepForFixing,
    stoppedClash,
    type ClashAnswer,
    type ClashQuestion,
    type TemplateConflictPolicy,
} from '@/features/updates/services/updateClash';
import type { UpdateContext } from '@/features/updates/services/updateCore';
import type { UpdateSelections } from '@/features/updates/services/updateSelections';
import type { Project } from '@/types/base';

/**
 * Where a category reports: the step from the stage table, the same names the
 * dashboard's apply shows (`updateStages.ts`), and the item it is on for the line
 * under it. Until slice 8 of the progress vocabulary (2026-10-16) each item was its
 * own long message ("Updating eds-storefront in My Demo").
 */
export type OnProgress = (stage: string, item?: string) => void;

export type { TemplateConflictPolicy } from '@/features/updates/services/updateClash';

/**
 * What a person is asked during an apply (PL-80): the Updates modal passes these, and
 * asks them in its progress window. An agent passes none, and the defaults decide: a
 * template conflict follows `templateConflicts`, a library under `ask` is kept.
 */
export interface UpdateQuestions {
    /** A template or Adobe boilerplate update clashes with edits: Fix with AI, Leave, or Reset? */
    onClash(project: Project, question: ClashQuestion): Promise<ClashAnswer>;
    /** A block library under the `ask` sync setting: replace its blocks with the new ones? */
    replaceLibraryBlocks(libraryName: string, project: Project): Promise<boolean>;
}

/** A merge that stopped on a clash, and what was decided about it. */
type ClashOutcome = { kind: 'settled'; result: TemplateSyncResult } | { kind: 'clash'; line: string; report: ClashReport };

/**
 * A template update, and on a clash the decision: reset (the colleague's row only, never
 * a tested-boilerplate storefront, EDS-51; the service refuses that too), keep it for
 * fixing with AI, or stop.
 */
async function syncTemplateHeadless(
    svc: TemplateSyncService,
    project: Project,
    ctx: UpdateContext,
    policy: TemplateConflictPolicy,
    questions?: UpdateQuestions,
): Promise<ClashOutcome> {
    const merged = await svc.syncWithTemplate(project, { strategy: 'merge' });
    if (merged.success || !merged.conflicts?.length) return { kind: 'settled', result: merged };
    const question = { track: 'template' as const, files: merged.conflicts, canReset: canResetOnClash(project, 'template') };
    const decision = await decideClash(project, question, policy, questions?.onClash);
    if (decision === 'reset') return { kind: 'settled', result: await svc.syncWithTemplate(project, { strategy: 'reset' }) };
    const clash = decision === 'keep' ? await keepForFixing(project, 'template', merged, ctx) : stoppedClash(project, 'template', merged);
    return { kind: 'clash', ...clash };
}

/** Count a clash as not applied: its sentence, and its files for the agent. */
function recordClash(result: CategoryResult, clash: { line: string; report: ClashReport }): void {
    result.failCount++;
    result.errors.push(clash.line);
    (result.clashes ??= []).push(clash.report);
}

/** The colleague's description file and GitHub's compare, with the SC's token. */
export function baseRefreshDeps(ctx: UpdateContext): BaseRefreshDeps {
    const { fileOperations } = getGitHubServices(ctx.secrets);
    return {
        readFile: async (owner, repo, path, ref) => (await fileOperations.getFileContent(owner, repo, path, ref))?.content,
        compare: (owner, repo, base, head) => compareCommits(ctx.secrets, owner, repo, base, head),
    };
}

export async function applyTemplate(
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
            const outcome = await syncTemplateHeadless(svc, project, ctx, policy, questions);
            if (outcome.kind === 'clash') {
                recordClash(result, outcome);
                continue;
            }
            const r = outcome.result;
            if (r.success) {
                await svc.updateLastSyncedCommit(project, r.syncedCommit, ctx.stateManager);
                // The colleague may have moved their own Adobe base; keep ours true (EDS-56 D4).
                if (await refreshBaseFromColleague(project, baseRefreshDeps(ctx))) {
                    await ctx.stateManager.saveProject(project);
                }
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

/**
 * Bring each colleague's storefront's Adobe half to our tested version (EDS-56). Runs after
 * `applyTemplate`, so a storefront taking both gets the colleague's changes first, each its
 * own commit. Records only `boilerplateBase.commit`: the colleague's `lastSyncedCommit` is
 * the other track's. A stop on the SC's edits is a failure that names the files; no reset is
 * offered on this track, by a person or by policy.
 */
export async function applyBoilerplate(
    items: UpdateSelections['boilerplate'],
    ctx: UpdateContext,
    onProgress?: OnProgress,
    policy: TemplateConflictPolicy = 'stop',
    questions?: UpdateQuestions,
): Promise<CategoryResult> {
    const result = emptyResult();
    if (items.length === 0) return result;
    const svc = new TemplateSyncService(getGitHubServices(ctx.secrets), ctx.logger, ctx.commandManager);
    for (const { project, base, tested } of items) {
        onProgress?.(S.updatingTemplate.label, `${project.name}: Adobe boilerplate`);
        try {
            const r = await svc.syncBoilerplate(project, { base, tested });
            if (!r.success && r.conflicts?.length) {
                const question = { track: 'boilerplate' as const, files: r.conflicts, canReset: false };
                const decision = await decideClash(project, question, policy, questions?.onClash);
                recordClash(result, decision === 'keep'
                    ? await keepForFixing(project, 'boilerplate', r, ctx)
                    : stoppedClash(project, 'boilerplate', r));
                continue;
            }
            if (!r.success) throw new Error(r.error || 'Unknown error');
            writeBoilerplateBase(project, { ...base, commit: r.syncedCommit });
            await ctx.stateManager.saveProject(project);
            result.successCount++;
            ctx.logger.info(`[Updates] Adobe boilerplate updated for ${project.name}`);
        } catch (error) {
            result.failCount++;
            result.errors.push(`${project.name} (Adobe boilerplate): ${sanitizeErrorForLogging(error as Error)}`);
            ctx.logger.error(`[Updates] Adobe boilerplate update failed for ${project.name}`, error as Error);
        }
    }
    return result;
}
