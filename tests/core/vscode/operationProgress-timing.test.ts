/**
 * The run timing every progress push carries (PL-59, 2026-10-16): when the run began,
 * on every push, and how long it took, on its end. One clock for the run, so the
 * modal can say how long a whole reset took rather than restarting with each stage.
 *
 * Asserted on the payload the screen receives.
 */

import { pushOperationProgress, startModalRun } from '@/core/vscode/operationProgress';

const ID = 'timing-run';
const T0 = new Date('2026-10-16T10:00:00Z').getTime();

let screen: jest.Mock;

/** The payload the screen received last. */
const lastSent = () => screen.mock.calls[screen.mock.calls.length - 1][1];

beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(T0);
    screen = jest.fn().mockResolvedValue(undefined);
    startModalRun(ID, screen);
});

afterEach(() => {
    jest.useRealTimers();
});

describe('the run timing on progress pushes', () => {
    it('stamps every running push with when the run began, not when the stage did', async () => {
        await pushOperationProgress({ id: ID, state: 'running', stage: 'Copying content' });
        jest.setSystemTime(T0 + 60_000);
        await pushOperationProgress({ id: ID, state: 'running', stage: 'Publishing' });

        expect(lastSent()).toEqual({ id: ID, state: 'running', stage: 'Publishing', startedAt: T0 });
    });

    it('says how long the whole run took on its end', async () => {
        await pushOperationProgress({ id: ID, state: 'running', stage: 'Copying content' });
        jest.setSystemTime(T0 + 192_000);
        await pushOperationProgress({ id: ID, state: 'succeeded' });

        expect(lastSent()).toEqual({ id: ID, state: 'succeeded', startedAt: T0, tookMs: 192_000 });
    });

    it('adds no timing to an end that no running push came before', async () => {
        await pushOperationProgress({ id: ID, state: 'failed', error: 'No project found' });

        expect(lastSent()).toEqual({ id: ID, state: 'failed', error: 'No project found' });
    });

    it('starts the next run fresh after one ends', async () => {
        await pushOperationProgress({ id: ID, state: 'running' });
        await pushOperationProgress({ id: ID, state: 'succeeded' });
        jest.setSystemTime(T0 + 5_000);
        await pushOperationProgress({ id: ID, state: 'running' });

        expect(lastSent()).toMatchObject({ startedAt: T0 + 5_000 });
    });

    // A run that never sent its end (a crash, a closed window) left its start behind,
    // and the next run under the same id counted from it.
    it('starts a new modal run fresh when the last one never ended', async () => {
        await pushOperationProgress({ id: ID, state: 'running' });
        jest.setSystemTime(T0 + 600_000);
        startModalRun(ID, screen);
        await pushOperationProgress({ id: ID, state: 'running' });

        expect(lastSent()).toMatchObject({ startedAt: T0 + 600_000 });
    });
});
