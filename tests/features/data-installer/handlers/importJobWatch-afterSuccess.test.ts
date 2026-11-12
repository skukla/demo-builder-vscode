/**
 * `runAndWatch`'s `afterSuccess`: work that may run only once the job has ENDED in success (Undo
 * Last Save deletes the newest save then, never before). It runs after the job's record is written,
 * never for a job that failed, and a failure inside it is logged and leaves the job's outcome alone.
 *
 * Imports the harness first: it owns the runner's mock, which `runAndWatch` must bind to.
 */

import {
    PAYLOAD,
    happyEngine,
    makeImportHarness,
    mockedWatch,
    resetImportHandlerMocks,
} from './importHandlers.testUtils';
import { JOB_KEY, runAndWatch } from '@/features/data-installer/handlers/importJobWatch';
import { TransientStateManager } from '@/core/state/transientStateManager';
import type { ImportRequest } from '@/features/data-installer/services/importRequest';
import type { ImportJobRecord } from '@/features/data-installer/types';
import type { HandlerContext } from '@/types/handlers';

const REQUEST: ImportRequest = {
    id: { name: PAYLOAD.datapackName, version: PAYLOAD.version },
    commerceInstance: PAYLOAD.commerceInstance,
    dataTypes: PAYLOAD.dataTypes,
};

/** Let the detached watch run to its end. */
const flush = async (): Promise<void> => {
    for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setImmediate(resolve));
};

async function start(context: HandlerContext, afterSuccess: () => Promise<void>): Promise<void> {
    const { engine } = happyEngine();
    const response = await runAndWatch(context, engine, REQUEST, {
        operation: 'import',
        validate: async () => ({ valid: true }),
        begin: async () => ({ activationId: 'act-1' }),
        rejected: 'rejected',
        failed: 'failed',
        afterSuccess,
    });
    expect(response.success).toBe(true);
    await flush();
}

const outcomeNow = async (
    context: HandlerContext
): Promise<ImportJobRecord['outcome'] | undefined> =>
    (await new TransientStateManager(context.context).get<ImportJobRecord | null>(JOB_KEY, null))
        ?.outcome;

beforeEach(() => {
    resetImportHandlerMocks();
});

describe('afterSuccess', () => {
    it('runs once the job ends in success, after its record says so', async () => {
        const { context } = makeImportHarness();
        let outcomeSeen: ImportJobRecord['outcome'] | undefined;
        const afterSuccess = jest.fn(async () => {
            outcomeSeen = await outcomeNow(context);
        });

        await start(context, afterSuccess);

        expect(afterSuccess).toHaveBeenCalledTimes(1);
        expect(outcomeSeen).toBe('success');
    });

    it('does not run when the job fails', async () => {
        mockedWatch.mockResolvedValue({
            outcome: 'error',
            perType: { products: 'error' },
            reason: 'Commerce refused.',
        });
        const { context } = makeImportHarness();
        const afterSuccess = jest.fn(async () => undefined);

        await start(context, afterSuccess);

        expect(afterSuccess).not.toHaveBeenCalled();
        expect(await outcomeNow(context)).toBe('error');
    });

    it('a failure inside it leaves the job a success', async () => {
        const { context } = makeImportHarness();
        const afterSuccess = jest.fn(async () => {
            throw new Error('library unreachable');
        });

        await start(context, afterSuccess);

        expect(afterSuccess).toHaveBeenCalledTimes(1);
        // Uncaught, the throw would reach the watch's own catch, which records `unwatchable`.
        expect(await outcomeNow(context)).toBe('success');
    });
});
