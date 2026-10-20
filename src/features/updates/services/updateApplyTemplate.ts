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
import { TemplateSyncService } from '@/features/updates/services/templateSyncService';
import type { TemplateSyncResult } from '@/features/updates/services/templateSyncTypes';
import { isThinLayerProject } from '@/features/updates/services/thinLayerUpdate';
import { emptyResult, type CategoryResult } from '@/features/updates/services/updateApplyResult';
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
