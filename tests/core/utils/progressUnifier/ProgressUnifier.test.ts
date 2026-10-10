/**
 * ProgressUnifier: the step loop, the reporter choice and the elapsed clock.
 *
 * The reporters themselves are tested in exactProgress / milestoneProgress /
 * timedProgress; the family's other suites drive whole steps end to end.
 */

import { ProgressUnifier } from '@/core/utils/progressUnifier/ProgressUnifier';
import type { IProcessSpawner } from '@/core/utils/progressUnifier/types';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { createTestableProgressUnifier } from '../../../helpers/progressUnifierTestHelpers';
import { createMockLogger, createMockStep, createProgressCollector } from './testUtils';

const collect = createProgressCollector();
const settle = () => new Promise((resolve) => setImmediate(resolve));

describe('ProgressUnifier.executeStep', () => {
    let logger: ReturnType<typeof createMockLogger>;

    beforeEach(() => {
        logger = createMockLogger();
    });

    it('announces each command as Starting at its share of the step, then reports the step done', async () => {
        const { onProgress, progressUpdates } = collect();
        const { progressUnifier, advanceTime } = createTestableProgressUnifier(logger);
        const step = { ...createMockStep('Step {version}', 'Quick', 'immediate'), commands: ['a', 'b'] };

        const run = progressUnifier.executeStep(step, 1, 4, onProgress, { nodeVersion: '24' });
        await settle();
        await advanceTime(5000);
        await run;

        const starting = progressUpdates.filter((u) => u.command?.detail === 'Starting');
        expect(starting).toStrictEqual([
            {
                overall: { percent: 25, currentStep: 2, totalSteps: 4, stepName: 'Step 24' },
                command: { type: 'indeterminate', detail: 'Starting', confidence: 'synthetic' },
            },
            {
                overall: { percent: 38, currentStep: 2, totalSteps: 4, stepName: 'Step 24' },
                command: { type: 'indeterminate', detail: 'Starting', confidence: 'synthetic' },
            },
        ]);
        expect(progressUpdates.at(-1)).toStrictEqual({
            overall: { percent: 50, currentStep: 2, totalSteps: 4, stepName: 'Step 24' },
        });
    });

    it('does not announce Starting for an exact step, whose tool reports at once', async () => {
        const { onProgress, progressUpdates } = collect();
        const { progressUnifier, advanceTime } = createTestableProgressUnifier(logger);

        const run = progressUnifier.executeStep(createMockStep('Node', 'Installing', 'exact', 'fnm install 24'), 0, 1, onProgress);
        await settle();
        await advanceTime(100);
        await run;

        expect(progressUpdates.map((u) => u.command?.detail)).toStrictEqual([undefined]);
    });

    it('runs the same step through the next reporter when the strategy is unknown: synthetic', async () => {
        const { onProgress, progressUpdates } = collect();
        const { progressUnifier, advanceTime, mocks, createMockProcess } = createTestableProgressUnifier(logger);
        mocks.spawn.mockImplementation(() => {
            const process = createMockProcess();
            mocks.timers.setTimeout(() => process.triggerClose(0), 2500);
            return process;
        });
        const step = Object.assign(createMockStep('Odd', 'Running', 'synthetic', 'cmd', 10000), { progressStrategy: 'nonsense' });

        const run = progressUnifier.executeStep(step, 0, 1, onProgress);
        await settle();
        await advanceTime(3000);
        await run;

        expect(progressUpdates.map((u) => u.command?.percent)).toStrictEqual([undefined, 10, 20, 100, undefined]);
    });

    it('adds the elapsed time to a reporter detail only once the step has run longer than the threshold', async () => {
        const { onProgress, progressUpdates } = collect();
        const { progressUnifier, advanceTime, mocks, createMockProcess } = createTestableProgressUnifier(logger);
        mocks.spawn.mockImplementation(() => {
            const process = createMockProcess();
            mocks.timers.setTimeout(() => process.triggerClose(0), TIMEOUTS.ELAPSED_TIME_THRESHOLD + 1500);
            return process;
        });
        const step = createMockStep('Slow', 'Installing', 'synthetic', 'cmd', 10 * TIMEOUTS.ELAPSED_TIME_THRESHOLD);

        const run = progressUnifier.executeStep(step, 0, 1, onProgress);
        await settle();
        await advanceTime(TIMEOUTS.ELAPSED_TIME_THRESHOLD + 2000);
        await run;

        const ticks = TIMEOUTS.ELAPSED_TIME_THRESHOLD / TIMEOUTS.PROGRESS_UPDATE_INTERVAL;
        const details = progressUpdates.map((u) => u.command?.detail);
        expect(details[0]).toBe('Starting');
        expect(details[ticks]).toBe('Installing');
        expect(details[ticks + 1]).toBe('Installing (31 seconds)');
        expect(details.at(-2)).toBe('Complete (31 seconds)');
        expect(progressUpdates.at(-1)?.command).toBeUndefined();
    });

    it('runs on the real clock and timers when none are handed in', async () => {
        jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
        try {
            const { onProgress, progressUpdates } = collect();
            const { mocks, createMockProcess } = createTestableProgressUnifier(logger);
            const process = createMockProcess();
            const spawn = jest.fn(() => process) as unknown as IProcessSpawner;
            const unifier = new ProgressUnifier(logger, undefined, undefined, spawn);

            const run = unifier.executeStep(createMockStep('Fast', 'Quick', 'immediate', 'cmd', 1000), 0, 1, onProgress);
            await jest.advanceTimersByTimeAsync(300);
            await process.triggerClose(0);
            await jest.advanceTimersByTimeAsync(1000);
            await run;

            expect(mocks.timers.setTimeout).not.toHaveBeenCalled();
            expect(progressUpdates.map((u) => u.command?.percent)).toStrictEqual([undefined, 20, 100, undefined]);
        } finally {
            jest.useRealTimers();
        }
    });
});
