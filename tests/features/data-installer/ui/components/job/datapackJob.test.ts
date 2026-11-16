/**
 * The datapack job's phases (step 03, S4): which window the job is on, and what moves it. Pure, so
 * every transition is pinned here rather than through a rendered window. The two rules it keeps:
 * the result shown is the LAST ACTION's (`lastAction`), and a press that does not belong to the
 * phase on screen moves nothing.
 */

import {
    datapackJob,
    startJob,
    type JobEvent,
    type JobPhase,
    type JobState,
} from '@/features/data-installer/ui/components/job/datapackJob';

const at = (phase: JobPhase, over: Partial<JobState> = {}): JobState => ({
    kind: 'install',
    phase,
    lastAction: null,
    ...over,
});

describe('startJob', () => {
    it('opens an install on its check', () => {
        expect(startJob('install')).toEqual({ kind: 'install', phase: 'check', lastAction: null });
    });

    it('opens a job already running on its run', () => {
        expect(startJob('watch')).toEqual({ kind: 'watch', phase: 'run', lastAction: null });
    });
});

describe('datapackJob', () => {
    const cases: Array<[string, JobState, JobEvent, JobState]> = [
        ['the check answered: the summary', at('check'), { type: 'checked' }, at('summary')],
        [
            'the project has no Commerce instance: the no-instance result',
            at('check'),
            { type: 'no-instance' },
            at('no-instance'),
        ],
        [
            'a job was already running when it opened: its run',
            at('check'),
            { type: 'running' },
            at('run'),
        ],
        ['Review Records: the spot check', at('summary'), { type: 'review' }, at('records')],
        ['Back from the spot check: the summary', at('records'), { type: 'back' }, at('summary')],
        [
            'Dry Run: its wait, keyed as the last action',
            at('summary'),
            { type: 'dry-run' },
            at('dry-wait', { lastAction: 'dryRun' }),
        ],
        [
            'the Dry Run answered: its result',
            at('dry-wait', { lastAction: 'dryRun' }),
            { type: 'dry-answered' },
            at('dry-result', { lastAction: 'dryRun' }),
        ],
        [
            'Back from the Dry Run result: the summary',
            at('dry-result', { lastAction: 'dryRun' }),
            { type: 'back' },
            at('summary', { lastAction: 'dryRun' }),
        ],
        [
            'Retry on a failed Dry Run: its wait again',
            at('dry-result', { lastAction: 'dryRun' }),
            { type: 'dry-run' },
            at('dry-wait', { lastAction: 'dryRun' }),
        ],
        [
            'Install from the summary: the run, keyed as the last action',
            at('summary'),
            { type: 'start' },
            at('run', { lastAction: 'start' }),
        ],
        [
            'Install from a passed Dry Run: the run',
            at('dry-result', { lastAction: 'dryRun' }),
            { type: 'start' },
            at('run', { lastAction: 'start' }),
        ],
        [
            'a clean end: the small result',
            at('run', { lastAction: 'start' }),
            { type: 'ended', clean: true },
            at('done', { lastAction: 'start' }),
        ],
        [
            'an end with a problem: stays on its steps',
            at('run', { lastAction: 'start' }),
            { type: 'ended', clean: false },
            at('ended', { lastAction: 'start' }),
        ],
        [
            'Retry on a stopped run: the run again',
            at('ended', { lastAction: 'start' }),
            { type: 'start' },
            at('run', { lastAction: 'start' }),
        ],
        [
            'Back from a refused start: the summary',
            at('ended', { lastAction: 'start' }),
            { type: 'back' },
            at('summary', { lastAction: 'start' }),
        ],
    ];

    it.each(cases)('%s', (_name, from, event, to) => {
        expect(datapackJob(from, event)).toEqual(to);
    });

    const ignored: Array<[string, JobState, JobEvent]> = [
        ['Install while the check runs', at('check'), { type: 'start' }],
        ['Review Records from the run', at('run', { lastAction: 'start' }), { type: 'review' }],
        [
            'a second end once ended',
            at('done', { lastAction: 'start' }),
            { type: 'ended', clean: false },
        ],
        ['the check answering after the summary is up', at('summary'), { type: 'checked' }],
        [
            'no instance once a job runs',
            at('run', { lastAction: 'start' }),
            { type: 'no-instance' },
        ],
        ['Dry Run during the run', at('run', { lastAction: 'start' }), { type: 'dry-run' }],
        [
            'Back on a job opened running: there is no summary behind it',
            { kind: 'watch', phase: 'ended', lastAction: null },
            { type: 'back' },
        ],
        ['Retry on a job opened running: its start was not this window\'s', { kind: 'watch', phase: 'ended', lastAction: null }, { type: 'start' }],
        ['a Dry Run answer arriving on the summary', at('summary'), { type: 'dry-answered' }],
    ];

    it.each(ignored)('moves nothing on %s', (_name, from, event) => {
        expect(datapackJob(from, event)).toBe(from);
    });
});

// Step 03, S6: a switch over the datapack the project holds (decisions J2-3, J8-1).
describe('a switch', () => {
    const sw = (phase: JobPhase, over: Partial<JobState> = {}): JobState => at(phase, { kind: 'switch', ...over });

    it('opens on its check', () => {
        expect(startJob('switch')).toEqual({ kind: 'switch', phase: 'check', lastAction: null });
    });

    it.each<[string, JobState, JobEvent, JobState]>([
        ['Switch with changes: the save question', sw('summary'), { type: 'save-first' }, sw('save-first')],
        [
            'the save question answered: the run, keyed as the last action',
            sw('save-first'),
            { type: 'start' },
            sw('run', { lastAction: 'start' }),
        ],
        ['Switch with no changes: the run', sw('summary'), { type: 'start' }, sw('run', { lastAction: 'start' })],
        ['Back from a refused start: the summary', sw('ended', { lastAction: 'start' }), { type: 'back' }, sw('summary', { lastAction: 'start' })],
    ])('%s', (_name, from, event, to) => {
        expect(datapackJob(from, event)).toEqual(to);
    });

    it.each<[string, JobState]>([
        ['from the check', sw('check')],
        ['from the run', sw('run', { lastAction: 'start' })],
        ['from an install summary: an install never asks', at('summary')],
    ])('asks nothing %s', (_name, from) => {
        expect(datapackJob(from, { type: 'save-first' })).toBe(from);
    });

    // C3 review (2026-11-13): a start sent with no answer, refused by the host for one, asks from the run.
    it('asks from the run when the host refused a start for an answer about changes', () => {
        const running: JobState = { kind: 'switch', phase: 'run', lastAction: 'start' };

        expect(datapackJob(running, { type: 'needs-answer' })).toEqual({ ...running, phase: 'save-first' });
    });
});

// Step 03, S7: Uninstall (decisions J5-1, J5-2). Its check ends on the question, "Uninstall My
// Luma?", which is the summary's place; the run is the removal's, keyed as the last action so the
// result reads the uninstall's request and never an install's.
describe('an uninstall', () => {
    const un = (phase: JobPhase, over: Partial<JobState> = {}): JobState => at(phase, { kind: 'uninstall', ...over });

    it('opens on its check', () => {
        expect(startJob('uninstall')).toEqual({ kind: 'uninstall', phase: 'check', lastAction: null });
    });

    it.each<[string, JobState, JobEvent, JobState]>([
        ['the check answered: the question', un('check'), { type: 'checked' }, un('summary')],
        ['Uninstall with changes: the save question', un('summary'), { type: 'save-first' }, un('save-first')],
        ['Uninstall with nothing to save: the run, keyed on the removal', un('summary'), { type: 'start' }, un('run', { lastAction: 'reset' })],
        ['the save question answered: the run', un('save-first'), { type: 'start' }, un('run', { lastAction: 'reset' })],
        ['Retry on a stopped run: the run again', un('ended', { lastAction: 'reset' }), { type: 'start' }, un('run', { lastAction: 'reset' })],
        ['Back from a start that never ran: the question', un('ended', { lastAction: 'reset' }), { type: 'back' }, un('summary', { lastAction: 'reset' })],
    ])('%s', (_name, from, event, to) => {
        expect(datapackJob(from, event)).toEqual(to);
    });

    it('moves nothing on Dry Run: an uninstall has none', () => {
        const from = un('summary');
        expect(datapackJob(from, { type: 'dry-run' })).toBe(from);
    });

    // Walk F151 (owner, 2026-11-16): the one step that deletes can be checked first.
    it('opens Review Records from its question, and Back returns to it', () => {
        expect(datapackJob(un('summary'), { type: 'review' })).toEqual(un('records'));
        expect(datapackJob(un('records'), { type: 'back' })).toEqual(un('summary'));
    });
});

// Step 03, S8; step-07 U1 (J9-5 to J9-7): Restore. Its check is its start request without confirm, so
// the job is keyed on the start from the moment it opens. The check ends on a result (up to date,
// refused) or the question; Original over unsaved edits goes from the question to the save question.
describe('a restore', () => {
    const re = (phase: JobPhase): JobState => ({ kind: 'restore', phase, lastAction: 'start' });

    it('opens on its check, keyed on the start the check sends', () => {
        expect(startJob('restore')).toEqual(re('check'));
    });

    it.each<[string, JobState, JobEvent, JobState]>([
        ['the check answered: the question', re('check'), { type: 'asks' }, re('question')],
        ['the question answered: the run', re('question'), { type: 'start' }, re('run')],
        ['Original over unsaved edits: the save question', re('question'), { type: 'save-first' }, re('save-first')],
        ['the save question answered: the run', re('save-first'), { type: 'start' }, re('run')],
        ['a newer save alone: the run', re('check'), { type: 'running' }, re('run')],
        ['up to date: the result', re('check'), { type: 'ended', clean: true }, re('done')],
        ['refused: the result', re('check'), { type: 'ended', clean: false }, re('ended')],
    ])('%s', (_name, from, event, to) => {
        expect(datapackJob(from, event)).toEqual(to);
    });

    it.each<[string, JobState, JobEvent]>([
        ['the summary: a restore has none', re('check'), { type: 'checked' }],
        ['no instance: the refusal says why', re('check'), { type: 'no-instance' }],
        ['Back from a refusal: nothing behind it', re('ended'), { type: 'back' }],
        ['Retry: the restore offers none', re('ended'), { type: 'start' }],
        ['Review Records', re('question'), { type: 'review' }],
        ['Dry Run', re('question'), { type: 'dry-run' }],
        ['the save question before the question', re('check'), { type: 'save-first' }],
    ])('moves nothing on %s', (_name, from, event) => {
        expect(datapackJob(from, event)).toBe(from);
    });

    it.each<[string, JobState]>([
        ['an install check', at('check')],
        ['an uninstall check', at('check', { kind: 'uninstall' })],
    ])('asks nothing and ends on no problem from %s', (_name, from) => {
        expect(datapackJob(from, { type: 'asks' })).toBe(from);
        expect(datapackJob(from, { type: 'ended', clean: false })).toBe(from);
    });

    it('ends nothing clean from an uninstall check', () => {
        const from = at('check', { kind: 'uninstall' });
        expect(datapackJob(from, { type: 'ended', clean: true })).toBe(from);
    });

    // Owner walk Q8 (2026-11-13): installing what the store already matches ends at its check.
    it('ends an install check on the up-to-date result', () => {
        expect(datapackJob(at('check'), { type: 'ended', clean: true })).toEqual(at('done'));
    });
});

// Step-07 U1 (J9-2): Update. Its check (`update-datapack` without confirm) ends on the summary of what
// changed, or on its result (up to date, or a check that failed); the summary has Review Records, no
// Dry Run and no save question.
describe('an update', () => {
    const up = (phase: JobPhase, lastAction: JobState['lastAction'] = null): JobState => ({ kind: 'update', phase, lastAction });

    it('opens on its check, keyed on no start yet', () => {
        expect(startJob('update')).toEqual(up('check'));
    });

    it.each<[string, JobState, JobEvent, JobState]>([
        ['what changed: the summary', up('check'), { type: 'checked' }, up('summary')],
        ['nothing left to apply: the result', up('check'), { type: 'ended', clean: true }, up('done')],
        ['Review Records', up('summary'), { type: 'review' }, up('records')],
        ['Back from Review Records', up('records'), { type: 'back' }, up('summary')],
        ['Update: the run', up('summary'), { type: 'start' }, up('run', 'start')],
    ])('%s', (_name, from, event, to) => {
        expect(datapackJob(from, event)).toEqual(to);
    });

    it.each<[string, JobEvent]>([
        ['Dry Run', { type: 'dry-run' }],
        ['the save question', { type: 'save-first' }],
        ["Restore's question", { type: 'asks' }],
    ])('moves nothing on %s', (_name, event) => {
        for (const from of [up('summary'), up('check')]) expect(datapackJob(from, event)).toBe(from);
    });
});
