/**
 * milestoneProgress: output patterns mapped to progress points.
 */

import { executeMilestones } from '@/core/utils/progressUnifier/milestoneProgress';
import type { ExecutionContext } from '@/core/utils/progressUnifier/types';
import { createProgressTestHarness } from '../../../helpers/progressUnifierTestHelpers';
import { createMockLogger, createMockStep, createProgressCollector } from './testUtils';

const context: ExecutionContext = { command: 'brew install x', stepIndex: 0, totalSteps: 2, stepName: 'Brew' };

const milestones = [
    { pattern: 'Downloading', progress: 30, message: 'Fetching bottle' },
    { pattern: 'Pouring', progress: 70 },
    { pattern: 'Summary', progress: 100, message: 'Done' },
];

describe('executeMilestones', () => {
    const collect = createProgressCollector();
    let logger: ReturnType<typeof createMockLogger>;

    beforeEach(() => {
        logger = createMockLogger();
    });

    function start(continueOnError?: boolean, withMilestones = true) {
        const harness = createProgressTestHarness(logger);
        const process = harness.createMockProcess();
        harness.mocks.spawn.mockImplementation(() => process);
        const step = {
            ...createMockStep('Brew', 'Installing', 'milestones', context.command),
            milestones: withMilestones ? milestones : undefined,
            continueOnError,
        };
        const { onProgress, progressUpdates } = collect();
        const run = executeMilestones(harness.reporterDeps, step, context, onProgress);
        return { harness, process, run, progressUpdates };
    }

    const settle = () => new Promise((resolve) => setImmediate(resolve));

    it('reports a matched milestone with its message, index and the step-scaled overall percent', async () => {
        const { process, run, progressUpdates } = start();

        process.triggerStdout('==> Downloading bottle');
        await settle();
        await process.triggerClose(0);
        await run;

        expect(progressUpdates).toStrictEqual([
            {
                overall: { percent: 15, currentStep: 1, totalSteps: 2, stepName: 'Brew' },
                command: {
                    type: 'determinate',
                    percent: 30,
                    detail: 'Fetching bottle',
                    confidence: 'estimated',
                    currentMilestoneIndex: 1,
                    totalMilestones: 3,
                },
            },
        ]);
    });

    it('falls back to the first 100 characters of the output when the milestone has no message', async () => {
        const { process, run, progressUpdates } = start();

        process.triggerStdout(`  Pouring ${'y'.repeat(200)}`);
        await settle();
        await process.triggerClose(0);
        await run;

        expect(progressUpdates[0].command?.detail).toBe(`Pouring ${'y'.repeat(200)}`.substring(0, 100));
        expect(progressUpdates[0].command?.currentMilestoneIndex).toBe(2);
    });

    it('only ever moves forward and reports each milestone once', async () => {
        const { process, run, progressUpdates } = start();

        process.triggerStdout('Pouring');
        await settle();
        process.triggerStdout('Downloading again');
        await settle();
        process.triggerStdout('Pouring');
        await settle();
        process.triggerStderr('Summary');
        await settle();
        await process.triggerClose(0);
        await run;

        expect(progressUpdates.map((u) => u.command?.percent)).toStrictEqual([70, 100]);
    });

    it('reports nothing when the step has no milestones', async () => {
        const { process, run, progressUpdates } = start(undefined, false);

        process.triggerStdout('Downloading');
        await settle();
        await process.triggerClose(0);
        await run;

        expect(progressUpdates).toStrictEqual([]);
    });

    it('traces stdout and stderr through the logger', async () => {
        const { process, run } = start();

        process.triggerStdout('out');
        process.triggerStderr('err');
        await settle();
        await process.triggerClose(0);
        await run;

        expect(logger.trace).toHaveBeenCalledTimes(2);
    });

    it('rejects with the exit code and command when the command fails', async () => {
        const { process, run } = start();
        const outcome = run.then(() => 'resolved', (e: Error) => e.message);

        await process.triggerClose(1);

        expect(await outcome).toBe('Command failed with code 1: brew install x');
    });

    it('resolves on a failure when the step continues on error', async () => {
        const { process, run } = start(true);

        await process.triggerClose(1);

        await expect(run).resolves.toBeUndefined();
    });
});
