/**
 * importJobWait — an agent's call that waits on a datapack job, saying its progress, instead of
 * polling it blind. The clock is injected, so nothing here waits; the progress lines are read from
 * the phase channel the MCP server forwards to the agent's chat.
 */

import {
    type JobWaitClock,
    waitForJob,
    waitMsOf,
} from '@/features/data-installer/handlers/importJobWait';
import type { ImportJobRecord } from '@/features/data-installer/types';
import { withPhaseSinks } from '@/core/utils/agentPhaseChannel';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

const record = (overrides: Partial<ImportJobRecord> = {}): ImportJobRecord => ({
    activationId: 'act-1',
    datapackName: 'luma',
    version: 'main',
    commerceInstance: 'tenant-1',
    dataTypes: ['categories', 'products'],
    startedAt: '2026-11-05T12:00:00.000Z',
    outcome: 'watching',
    perType: {},
    ...overrides,
});

/** A clock that moves two seconds per sleep. */
function clock(): JobWaitClock & { slept: number } {
    let at = 0;
    const state = {
        slept: 0,
        now: () => at,
        intervalMs: 2000,
        sleep: async (ms: number) => {
            state.slept += 1;
            at += ms;
        },
    };
    return state;
}

/** Run a wait over these records in turn, the last repeating, and collect what it said. */
async function run(records: Array<ImportJobRecord | null>, waitMs: number, time = clock()) {
    const said: string[] = [];
    let read = 0;
    const result = await withPhaseSinks([(line) => said.push(line)], () =>
        waitForJob(async () => records[Math.min(read++, records.length - 1)], waitMs, time)
    );
    return { result, said, time };
}

describe('waitMsOf', () => {
    it('is nothing unless a positive number of seconds is asked for', () => {
        expect(waitMsOf(undefined)).toBe(0);
        expect(waitMsOf(0)).toBe(0);
        expect(waitMsOf(-5)).toBe(0);
        expect(waitMsOf('30')).toBe(0);
    });

    it('never waits past the ceiling', () => {
        expect(waitMsOf(30)).toBe(30_000);
        expect(waitMsOf(600)).toBe(TIMEOUTS.DATAPACK_JOB_WAIT_MAX);
    });
});

describe('waitForJob', () => {
    it('answers the moment the job ends, having said each new step once', async () => {
        const counting = record({
            perType: { categories: 'success', products: 'processing' },
            detail: '50 of 330 products',
        });
        const { result, said } = await run(
            [
                record({ perType: { categories: 'processing' } }),
                counting,
                counting,
                record({ outcome: 'success' }),
            ],
            60_000
        );

        expect(result?.outcome).toBe('success');
        expect(said).toEqual([
            'Installing the datapack: 0 of 2 data types: Categories',
            'Installing the datapack: 1 of 2 data types: 50 of 330 products',
        ]);
    });

    it('answers with the job still running when the wait is up', async () => {
        const { result, time } = await run([record()], 6000);

        expect(result?.outcome).toBe('watching');
        expect(time.slept).toBe(3);
    });

    it('answers at once with no wait, and with nothing when no job was ever started', async () => {
        expect((await run([record()], 0)).time.slept).toBe(0);
        expect((await run([null], 60_000)).result).toBeNull();
    });
});
