/**
 * timedProgress: the clock decides the percentage (synthetic and immediate).
 */

import { executeImmediate, executeSynthetic } from '@/core/utils/progressUnifier/timedProgress';
import type { ExecutionContext } from '@/core/utils/progressUnifier/types';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { createProgressTestHarness } from '../../../helpers/progressUnifierTestHelpers';
import { createMockLogger, createMockStep, createProgressCollector } from './testUtils';

const context: ExecutionContext = { command: 'npm install -g x', stepIndex: 1, totalSteps: 2, stepName: 'Step' };

const collect = createProgressCollector();
const settle = () => new Promise((resolve) => setImmediate(resolve));

describe('executeSynthetic', () => {
    let logger: ReturnType<typeof createMockLogger>;

    beforeEach(() => {
        logger = createMockLogger();
    });

    function start(estimatedDuration?: number, continueOnError?: boolean, message = 'Installing') {
        const harness = createProgressTestHarness(logger);
        const process = harness.createMockProcess();
        harness.mocks.spawn.mockImplementation(() => process);
        harness.reporterDeps.enhanceDetailWithElapsedTime = (detail) => `${detail}!`;
        const step = { ...createMockStep('Step', message, 'synthetic', context.command, estimatedDuration), continueOnError };
        const { onProgress, progressUpdates } = collect();
        const run = executeSynthetic(harness.reporterDeps, step, context, onProgress);
        return { harness, process, run, progressUpdates };
    }

    it('reports once per update interval along the estimated-duration curve, through the elapsed decoration', async () => {
        const { harness, run, process, progressUpdates } = start(10000);

        await harness.advanceTime(TIMEOUTS.PROGRESS_UPDATE_INTERVAL * 2);
        await process.triggerClose(0);
        await run;

        expect(progressUpdates.slice(0, 2)).toStrictEqual([
            {
                overall: { percent: 55, currentStep: 2, totalSteps: 2, stepName: 'Step' },
                command: { type: 'indeterminate', percent: 10, detail: 'Installing!', confidence: 'synthetic' },
            },
            {
                overall: { percent: 60, currentStep: 2, totalSteps: 2, stepName: 'Step' },
                command: { type: 'indeterminate', percent: 20, detail: 'Installing!', confidence: 'synthetic' },
            },
        ]);
    });

    it('names the step when the step has no message', async () => {
        const { harness, run, process, progressUpdates } = start(10000, undefined, '');

        await harness.advanceTime(TIMEOUTS.PROGRESS_UPDATE_INTERVAL);
        await process.triggerClose(0);
        await run;

        expect(progressUpdates[0].command?.detail).toBe('Step!');
    });

    it('caps at 95% until the command exits, using the default duration when none is estimated', async () => {
        const { harness, run, process, progressUpdates } = start();

        await harness.advanceTime(TIMEOUTS.DEFAULT_STEP_DURATION * 2);
        await process.triggerClose(0);
        await run;

        const running = progressUpdates.slice(0, -1).map((u) => u.command?.percent ?? 0);
        expect(Math.max(...running)).toBe(95);
        expect(running).toHaveLength((TIMEOUTS.DEFAULT_STEP_DURATION * 2) / TIMEOUTS.PROGRESS_UPDATE_INTERVAL);
    });

    it('stops the interval and reports 100% Complete when the command exits', async () => {
        const { harness, run, process, progressUpdates } = start(10000);

        await harness.advanceTime(TIMEOUTS.PROGRESS_UPDATE_INTERVAL);
        await process.triggerClose(0);
        await run;

        expect(harness.getActiveTimers()).toStrictEqual([]);
        expect(progressUpdates.at(-1)).toStrictEqual({
            overall: { percent: 100, currentStep: 2, totalSteps: 2, stepName: 'Step' },
            command: { type: 'determinate', percent: 100, detail: 'Complete!', confidence: 'synthetic' },
        });
    });

    it('traces stdout and stderr through the logger', async () => {
        const { process, run } = start(10000);

        process.triggerStdout('out');
        process.triggerStderr('err');
        await settle();
        await process.triggerClose(0);
        await run;

        expect(logger.trace).toHaveBeenCalledTimes(2);
    });

    it('rejects with the exit code and command when the command fails, after the final report', async () => {
        const { process, run, progressUpdates } = start(10000);
        const outcome = run.then(() => 'resolved', (e: Error) => e.message);

        await process.triggerClose(3);

        expect(await outcome).toBe('Command failed with code 3: npm install -g x');
        expect(progressUpdates.at(-1)?.command?.percent).toBe(100);
    });

    it('resolves on a failure when the step continues on error', async () => {
        const { process, run } = start(10000, true);

        await process.triggerClose(3);

        await expect(run).resolves.toBeUndefined();
    });
});

describe('executeImmediate', () => {
    let logger: ReturnType<typeof createMockLogger>;

    beforeEach(() => {
        logger = createMockLogger();
    });

    function start(estimatedDuration?: number, continueOnError?: boolean, command = context.command, message = 'Quick') {
        const harness = createProgressTestHarness(logger);
        const process = harness.createMockProcess();
        harness.mocks.spawn.mockImplementation(() => process);
        const step = { ...createMockStep('Step', message, 'immediate', command, estimatedDuration), continueOnError };
        const { onProgress, progressUpdates } = collect();
        const run = executeImmediate(harness.reporterDeps, step, { ...context, command }, onProgress);
        return { harness, process, run, progressUpdates };
    }

    it('answers configureFnmShell without spawning: one exact 100% report under the raw step name', async () => {
        const { harness, run, progressUpdates } = start(undefined, undefined, 'configureFnmShell');

        await run;

        expect(harness.mocks.spawn).not.toHaveBeenCalled();
        expect(progressUpdates).toStrictEqual([
            {
                overall: { percent: 100, currentStep: 2, totalSteps: 2, stepName: 'Step' },
                command: { type: 'determinate', percent: 100, detail: 'Quick', confidence: 'exact' },
            },
        ]);
    });

    it('steps 20, 50 and 80 at a fifth, a half and four fifths of the minimum duration', async () => {
        const { harness, run, process, progressUpdates } = start(1000);

        await harness.advanceTime(900);
        const times = harness.mocks.timers.setTimeout.mock.calls.slice(0, 3).map((c) => c[1]);
        await process.triggerClose(0);
        await harness.advanceTime(1000);
        await run;

        expect(times).toStrictEqual([200, 500, 800]);
        expect(progressUpdates.slice(0, 3)).toStrictEqual([20, 50, 80].map((percent) => ({
            overall: { percent: 50 + percent / 2, currentStep: 2, totalSteps: 2, stepName: 'Step' },
            command: { type: 'determinate', percent, detail: 'Quick', confidence: 'exact' },
        })));
    });

    it('caps the minimum duration and defaults it when the step estimates none', async () => {
        const capped = start(60000);
        const defaulted = start();

        expect(capped.harness.mocks.timers.setTimeout.mock.calls[0][1]).toBe(TIMEOUTS.PROGRESS_MIN_DURATION_CAP * 0.2);
        expect(defaulted.harness.mocks.timers.setTimeout.mock.calls[0][1]).toBe(
            TIMEOUTS.PROGRESS_ESTIMATED_DEFAULT_SHORT * 0.2,
        );
    });

    it('names the step when the step has no message', async () => {
        const { harness, run, process, progressUpdates } = start(1000, undefined, context.command, '');

        await harness.advanceTime(300);
        await process.triggerClose(0);
        await harness.advanceTime(1000);
        await run;

        expect(progressUpdates[0].command?.detail).toBe('Step');
    });

    it('drops the pending steps once the command exits and holds the final report until the minimum duration', async () => {
        const { harness, run, process, progressUpdates } = start(1000);

        await harness.advanceTime(300);
        await process.triggerClose(0);
        const pending = harness.getActiveTimers().map((t) => t.ms);
        await harness.advanceTime(699);
        const before = progressUpdates.length;
        await harness.advanceTime(1);
        await run;

        expect(pending).toStrictEqual([700]);
        expect(before).toBe(1);
        expect(progressUpdates.map((u) => u.command?.percent)).toStrictEqual([20, 100]);
        expect(progressUpdates.at(-1)).toStrictEqual({
            overall: { percent: 100, currentStep: 2, totalSteps: 2, stepName: 'Step' },
            command: { type: 'determinate', percent: 100, detail: 'Complete', confidence: 'exact' },
        });
    });

    it('reports the final step at once when the command outlives the minimum duration', async () => {
        const { harness, run, process, progressUpdates } = start(1000);

        await harness.advanceTime(5000);
        await process.triggerClose(0);
        const pending = harness.getActiveTimers();
        await harness.advanceTime(1);
        await run;

        expect(pending.map((t) => t.ms)).toStrictEqual([0]);
        expect(progressUpdates.map((u) => u.command?.percent)).toStrictEqual([20, 50, 80, 100]);
    });

    it('rejects with the exit code and command when the command fails', async () => {
        const { harness, process, run } = start(1000);
        const outcome = run.then(() => 'resolved', (e: Error) => e.message);

        await process.triggerClose(4);
        await harness.advanceTime(1000);

        expect(await outcome).toBe('Command failed with code 4: npm install -g x');
    });

    it('resolves on a failure when the step continues on error', async () => {
        const { harness, process, run } = start(1000, true);
        const outcome = run.then(() => 'resolved', (e: Error) => e.message);

        await process.triggerClose(4);
        await harness.advanceTime(1000);

        expect(await outcome).toBe('resolved');
    });
});
