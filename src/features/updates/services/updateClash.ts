/**
 * What a template or Adobe boilerplate update does when it stops on a clash (EDS-57 step 3).
 *
 * Both rows ask the same question: Fix with AI (the clash is kept in the project's local
 * copy, `pendingClash.ts`), Leave it as it is (nothing changes, the update stays offered),
 * or, on the colleague's row only, Use the update. No choice involves reading code
 * (owner, 2026-10-20: no SC is comfortable with code). An agent passes a policy instead:
 * `keep`, `stop` (the default) or `reset`.
 *
 * Every clash is reported structurally (`CategoryResult.clashes`) as well as in a sentence,
 * so an agent gets the files and where they are kept without parsing words.
 *
 * @module features/updates/services/updateClash
 */

import { getProjectDisplayName } from '@/core/utils/projectDisplayName';
import { keepClash, type ClashTrack } from '@/features/updates/services/pendingClash';
import { describeEdit } from '@/features/updates/services/templateSyncMessages';
import type { TemplateSyncResult } from '@/features/updates/services/templateSyncTypes';
import { isThinLayerProject } from '@/features/updates/services/thinLayerUpdate';
import type { ClashReport } from '@/features/updates/services/updateApplyResult';
import type { UpdateContext } from '@/features/updates/services/updateCore';
import type { Project } from '@/types/base';

/**
 * What a headless update does on a clash: `stop` (the default) reports the files and
 * changes nothing; `keep` keeps the clash in the local copy for fixing; `reset` replaces
 * the files with the template's, only when the caller asked for exactly that.
 */
export type TemplateConflictPolicy = 'stop' | 'keep' | 'reset';

/** A person's answer: Fix with AI, Leave it as it is, or Use the update. */
export type ClashAnswer = 'fix' | 'leave' | 'reset';

/** A person's answer to a kept clash's fix that is not ready: Fix with AI, Keep it for later, or Drop the fix. */
export type UnfinishedAnswer = 'fix' | 'later' | 'leave';

/** What the clash question is asked about. */
export interface ClashQuestion {
    track: ClashTrack;
    files: string[];
    /** Whether Use the update is offered: the colleague's row, off the tested boilerplate. */
    canReset: boolean;
}

/** The colleague's row may reset; a tested-boilerplate storefront or Adobe's row never. */
export function canResetOnClash(project: Project, track: ClashTrack): boolean {
    return track === 'template' && !isThinLayerProject(project);
}

/**
 * Decide what a clash does: the person's answer when there is one to ask, else the policy.
 * A policy is passed through as given (a refused reset is the sync service's to refuse).
 */
export async function decideClash(
    project: Project,
    question: ClashQuestion,
    policy: TemplateConflictPolicy,
    ask?: (project: Project, question: ClashQuestion) => Promise<ClashAnswer>,
): Promise<TemplateConflictPolicy> {
    if (!ask) return policy;
    const answer = await ask(project, question);
    if (answer === 'fix') return 'keep';
    return answer === 'reset' && question.canReset ? 'reset' : 'stop';
}

const LABEL: Record<ClashTrack, string> = { template: '', boilerplate: ' (Adobe boilerplate)' };

/**
 * Report a clash that stops here (not kept): the sync's own sentence, and the files.
 *
 * @param notKept - why keeping it for fixing did not work, when that was tried
 */
export function stoppedClash(
    project: Project,
    track: ClashTrack,
    r: TemplateSyncResult,
    notKept?: string,
): { line: string; report: ClashReport } {
    const reason = notKept ? ` It could not be kept for fixing: ${notKept}.` : '';
    const name = getProjectDisplayName(project);
    return {
        line: `${name}${LABEL[track]}: ${r.error ?? 'the update clashed'}${reason}`,
        report: {
            project: name,
            projectName: project.name,
            track,
            files: r.conflicts ?? [],
            ...(r.edits ? { edits: r.edits } : {}),
            ...(notKept ? { notKept } : {}),
        },
    };
}

/**
 * Keep a clash in the project's local copy and record it (saving the project), or say
 * why it could not be kept.
 */
export async function keepForFixing(
    project: Project,
    track: ClashTrack,
    r: TemplateSyncResult,
    ctx: UpdateContext,
): Promise<{ line: string; report: ClashReport }> {
    const conflicts = r.conflicts ?? [];
    if (!r.clash || conflicts.length === 0) return stoppedClash(project, track, r, 'the update did not say what clashed');
    const fixes = track === 'template' && isThinLayerProject(project);
    const outcome = await keepClash(project, { track, clash: r.clash, conflicts, fixes }, ctx);
    if (outcome.kind === 'not-kept') return stoppedClash(project, track, r, outcome.reason);
    await ctx.stateManager.saveProject(project);
    const name = getProjectDisplayName(project);
    const noun = conflicts.length === 1 ? 'file clashes' : 'files clash';
    return {
        line:
            `${name}${LABEL[track]}: ${conflicts.length} ${noun} with edits in the storefront ` +
            `(${r.edits?.length ? r.edits.map(describeEdit).join('; ') : conflicts.join(', ')}). ` +
            "It is kept in the project's local copy to fix with AI; nothing was pushed.",
        report: {
            project: name,
            projectName: project.name,
            track,
            files: conflicts,
            ...(r.edits ? { edits: r.edits } : {}),
            keptIn: outcome.storefrontPath,
        },
    };
}
