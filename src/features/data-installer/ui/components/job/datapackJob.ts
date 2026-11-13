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
 * Three kinds: an `install` of a pack the project does not hold, from its check; a `switch` over the
 * datapack it holds (S6), from its check, whose Switch asks "Save Your Changes First?" when the held
 * datapack has changes; and `watch`, a job already running when the window opened (Undo, Restore,
 * an agent's), from its run.
 *
 * @module features/data-installer/ui/components/job/datapackJob
 */

import type { LastAction } from '../importResult';

/** What the window was opened for. */
export type JobKind = 'install' | 'switch' | 'watch';

/** The window on screen. */
export type JobPhase =
    | 'check'
    | 'summary'
    | 'records'
    | 'dry-wait'
    | 'dry-result'
    | 'save-first'
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
    /** Switch pressed with changes to lose: the save question. */
    | { type: 'save-first' }
    | { type: 'ended'; clean: boolean };

/** Where a job opens: an install or a switch on its check, a running job on its run. */
export function startJob(kind: JobKind): JobState {
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
    start: ['summary', 'dry-result', 'save-first', 'ended'],
    'save-first': ['summary'],
    ended: ['run'],
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
            return { ...state, phase: 'run', lastAction: 'start' };
        case 'running':
            return { ...state, phase: 'run' };
        case 'save-first':
            return { ...state, phase: 'save-first' };
        case 'ended':
            return { ...state, phase: event.clean ? 'done' : 'ended' };
        default:
            return { ...state, phase: 'no-instance' };
    }
}

/**
 * The job after `event`; the same object when the event does not belong to the phase on screen.
 * A job opened running has no summary behind it, so its Back moves nothing; only a switch asks
 * the save question.
 */
export function datapackJob(state: JobState, event: JobEvent): JobState {
    if (!FROM[event.type].includes(state.phase)) return state;
    if (event.type === 'save-first' && state.kind !== 'switch') return state;
    if (state.kind === 'watch' && (event.type === 'back' || event.type === 'start')) return state;
    return next(state, event);
}
