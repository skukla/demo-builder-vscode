/**
 * Applying a "Finish" row (EDS-57): a storefront update whose clash was kept to fix with AI.
 *
 * The finish is `finishClash`, the one place a fixed clash is pushed. When the fix is not
 * ready (a marker left, a file that does not parse, another file changed), a person is
 * asked what next, in words that need no code: Fix with AI (their AI opens on it again),
 * Keep it for later, or Drop the fix. An agent passes no questions and gets the reason.
 *
 * @module features/updates/services/updateApplyFinish
 */

import { COMPONENT_IDS } from '@/core/constants';
import { OPERATION_STAGES as S } from '@/core/utils/operationStages';
import { getProjectDisplayName } from '@/core/utils/projectDisplayName';
import { sanitizeErrorForLogging } from '@/core/validation/SensitiveDataRedactor';
import { finishClash, leaveClash, type FinishOutcome } from '@/features/updates/services/pendingClashFinish';
import { createFinishDeps } from '@/features/updates/services/pendingClashFinishDeps';
import { emptyResult, type CategoryResult } from '@/features/updates/services/updateApplyResult';
import type { OnProgress, UpdateQuestions } from '@/features/updates/services/updateApplyTemplate';
import type { UpdateContext } from '@/features/updates/services/updateCore';
import type { UpdateSelections } from '@/features/updates/services/updateSelections';
import type { Project } from '@/types/base';

const WHICH: Record<'template' | 'boilerplate', string> = {
    template: 'update',
    boilerplate: 'Adobe boilerplate update',
};

async function settleUnfinished(
    project: Project,
    entry: UpdateSelections['finish'][number],
    reason: string,
    ctx: UpdateContext,
    result: CategoryResult,
    questions?: UpdateQuestions,
): Promise<void> {
    const name = getProjectDisplayName(project);
    const answer = questions ? await questions.onUnfinished(project, reason) : 'later';
    result.failCount++;
    if (answer === 'leave') {
        await leaveClash(project, ctx);
        result.errors.push(`${name}: the fix was dropped; the ${WHICH[entry.clash.track]} is offered again.`);
        return;
    }
    result.errors.push(`${name}: not finished yet, because ${reason}.`);
    const storefrontPath = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT]?.path;
    // A clash still kept, so the SC's AI can be opened on it again (the boundary does that).
    (result.clashes ??= []).push({
        project: name,
        projectName: project.name,
        track: entry.clash.track,
        files: entry.clash.files,
        ...(answer === 'fix' && storefrontPath ? { keptIn: storefrontPath } : {}),
    });
}

function record(project: Project, entry: UpdateSelections['finish'][number], outcome: FinishOutcome, result: CategoryResult): void {
    const name = getProjectDisplayName(project);
    const which = WHICH[entry.clash.track];
    if (outcome.kind === 'finished') {
        result.successCount++;
        (result.applied ??= []).push(`${name}: the ${which} fixed with AI is finished and live.`, ...outcome.notes.map((n) => `${name}: ${n}`));
    } else if (outcome.kind === 'moved-on') {
        result.failCount++;
        result.errors.push(`${name}: a newer version came out, so the fix was dropped. Check for updates again.`);
    } else if (outcome.kind === 'failed') {
        result.failCount++;
        result.errors.push(`${name}: the ${which} was not finished: ${outcome.reason}.`);
    }
}

/** Finish each kept clash the SC ticked. */
export async function applyFinish(
    items: UpdateSelections['finish'],
    ctx: UpdateContext,
    onProgress?: OnProgress,
    questions?: UpdateQuestions,
): Promise<CategoryResult> {
    const result = emptyResult();
    if (items.length === 0) return result;
    const deps = createFinishDeps(ctx);
    for (const entry of items) {
        const { project } = entry;
        onProgress?.(S.updatingTemplate.label, `${project.name}: finishing the fix`);
        try {
            const outcome = await finishClash(project, deps);
            if (outcome.kind === 'not-fixed') await settleUnfinished(project, entry, outcome.reason, ctx, result, questions);
            else record(project, entry, outcome, result);
        } catch (error) {
            result.failCount++;
            result.errors.push(`${getProjectDisplayName(project)}: ${sanitizeErrorForLogging(error as Error)}`);
            ctx.logger.error(`[Updates] Finishing the kept clash failed for ${project.name}`, error as Error);
        }
    }
    return result;
}
