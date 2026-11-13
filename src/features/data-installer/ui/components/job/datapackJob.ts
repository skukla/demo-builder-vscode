/**
 * Which window a datapack job is on, and what moves it (step 03, S4): one window per phase, each
 * drawn by `DatapackJobWindow`. Pure: no React, no requests (`useDatapackJob` holds those and sends
 * the events).
 *
 * Two rules it keeps, both learned on the window this replaces:
 * - **The result shown is the LAST ACTION's** (`importResult.ts`): Dry Run and Install each set
 *   `lastAction`, so an earlier outcome is never replayed over the one just caused.
 * - **A press that does not belong to the phase on screen moves nothing**: an answer arriving late
 *   (the check after the summary is up, a second end) is ignored rather than jumping the window.
 *
 * Four kinds: an `install` of a pack the project does not hold, from its check; a `switch` over the
 * datapack it holds (S6), from its check, whose Switch asks "Save Your Changes First?" when the held
 * datapack has changes; an `uninstall` of the datapack it holds (S7), from its check, whose question
 * ("Uninstall My Luma?") stands where the summary does and asks the same save question, with no
 * Review Records and no Dry Run, its run keyed on the removal (`reset`); a `restore` of the datapack
 * the demo uses (S8), whose check IS its start (`restore-datapack` without `confirm` starts when
 * nothing of the SC's would be lost), so it is keyed on the start from the moment it opens, and the
 * check ends on a result (up to date, refused), the question "Restore My Luma?", or the run; and
 * `watch`, a job already running when the window opened (Undo, an agent's), from its run.
 *
 * @module features/data-installer/ui/components/job/datapackJob
 */

import type { LastAction } from '../importResult';

/** What the window was opened for. */
export type JobKind = 'install' | 'switch' | 'uninstall' | 'restore' | 'watch';

/** The window on screen. */
export type JobPhase =
    | 'check'
    | 'summary'
    | 'records'
    | 'dry-wait'
    | 'dry-result'
    | 'save-first'
    /** Restore's question over unsaved edits. */
    | 'question'
    | 'run'
    | 'ended'
    | 'done'
    | 'no-instance';

export interface JobState {
    kind: JobKind;
    phase: JobPhase;
    /** The operation whose outcome the window shows (`importResult.ts`). */
    lastAction: LastAction | null;
}

export type JobEvent =
    | { type: 'checked' }
    | { type: 'no-instance' }
    | { type: 'running' }
    | { type: 'review' }
    | { type: 'back' }
    | { type: 'dry-run' }
    | { type: 'dry-answered' }
    | { type: 'start' }
    /** Switch or Uninstall pressed with changes to lose: the save question. */
    | { type: 'save-first' }
    /** A start sent with no answer (nothing had changed when read) that the host refused with CHANGES_NEED_ANSWER: the save question. */
    | { type: 'needs-answer' }
    /** Restore's check found unsaved edits: its question. */
    | { type: 'asks' }
    | { type: 'ended'; clean: boolean };

/**
 * Where a job opens: an install, a switch, an uninstall or a restore on its check, a running job on
 * its run. A restore's check is its start, so it is keyed on it from the first.
 */
export function startJob(kind: JobKind): JobState {
    if (kind === 'restore') return { kind, phase: 'check', lastAction: 'start' };
    return { kind, phase: kind === 'watch' ? 'run' : 'check', lastAction: null };
}

/** The phases each event may leave from. */
const FROM: Record<JobEvent['type'], readonly JobPhase[]> = {
    checked: ['check'],
    'no-instance': ['check'],
    running: ['check'],
    review: ['summary'],
    back: ['records', 'dry-result', 'ended'],
    'dry-run': ['summary', 'dry-result'],
    'dry-answered': ['dry-wait'],
    start: ['summary', 'dry-result', 'save-first', 'question', 'ended'],
    'save-first': ['summary'],
    'needs-answer': ['run'],
    asks: ['check'],
    ended: ['run', 'check'],
};

/** Where an allowed event goes. */
function next(state: JobState, event: JobEvent): JobState {
    switch (event.type) {
        case 'checked':
        case 'back':
            return { ...state, phase: 'summary' };
        case 'review':
            return { ...state, phase: 'records' };
        case 'dry-run':
            return { ...state, phase: 'dry-wait', lastAction: 'dryRun' };
        case 'dry-answered':
            return { ...state, phase: 'dry-result' };
        case 'start':
            return { ...state, phase: 'run', lastAction: state.kind === 'uninstall' ? 'reset' : 'start' };
        case 'running':
            return { ...state, phase: 'run' };
        case 'save-first':
        case 'needs-answer':
            return { ...state, phase: 'save-first' };
        case 'asks':
            return { ...state, phase: 'question' };
        case 'ended':
            return { ...state, phase: event.clean ? 'done' : 'ended' };
        default:
            return { ...state, phase: 'no-instance' };
    }
}

/** The kinds that ask "Save Your Changes First?": those that uninstall the held datapack. */
const ASKS_SAVE: readonly JobKind[] = ['switch', 'uninstall'];
/** What an uninstall's question does not offer. */
const NOT_UNINSTALL: ReadonlyArray<JobEvent['type']> = ['review', 'dry-run'];
/** What only a restore's check and question move on. */
const RESTORE_ONLY: ReadonlyArray<JobEvent['type']> = ['asks'];
/** What a restore never moves on: it has no summary, and no Retry or Back after a refusal. */
const NOT_RESTORE: ReadonlyArray<JobEvent['type']> = ['checked', 'no-instance', 'back'];

/** Whether the job's kind takes the event: what is one kind's alone moves no other. */
function kindTakes(state: JobState, event: JobEvent): boolean {
    const { kind, phase } = state;
    if (kind !== 'restore') {
        const endsAtCheck = event.type === 'ended' && phase === 'check';
        return !RESTORE_ONLY.includes(event.type) && !endsAtCheck;
    }
    if (NOT_RESTORE.includes(event.type)) return false;
    return !(event.type === 'start' && phase === 'ended');
}

/**
 * The job after `event`; the same object when the event does not belong to the phase on screen.
 * A job opened running has no summary behind it, so its Back moves nothing; only what uninstalls
 * the held datapack asks the save question; an uninstall has no Review Records and no Dry Run; only
 * a restore asks its question or ends at its check, and it has no summary, Back or Retry.
 */
export function datapackJob(state: JobState, event: JobEvent): JobState {
    if (!FROM[event.type].includes(state.phase)) return state;
    if (!kindTakes(state, event)) return state;
    if ((event.type === 'save-first' || event.type === 'needs-answer') && !ASKS_SAVE.includes(state.kind)) return state;
    if (state.kind === 'uninstall' && NOT_UNINSTALL.includes(event.type)) return state;
    if (state.kind === 'watch' && (event.type === 'back' || event.type === 'start')) return state;
    return next(state, event);
}
