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
