/**
 * Unit Tests for ProgressUnifier - Timer Cleanup
 *
 * Tests proper cleanup of timers and intervals on operation completion
 * or error, preventing memory leaks and zombie timers.
 */

import { createTestableProgressUnifier } from '../../../helpers/progressUnifierTestHelpers';
import { createMockStep, createProgressCollector, createMockLogger } from './testUtils';

describe('ProgressUnifier - Timer Cleanup', () => {
    const progressCollectorFactory = createProgressCollector();
    let mockLogger: ReturnType<typeof createMockLogger>;

    beforeEach(() => {
        jest.clearAllMocks();
        mockLogger = createMockLogger();
    });

    describe('Timer cleanup on operation complete', () => {
        it('should stop timer when operation finishes', async () => {
            const { onProgress, progressUpdates } = progressCollectorFactory();
            const { progressUnifier, advanceTime, getActiveTimers, mocks, createMockProcess } = createTestableProgressUnifier(mockLogger);

            const step = createMockStep(
                'Quick Install',
                'Installing package...',
                'synthetic',
                'npm install',
                5000
            );

            // Mock spawn to complete quickly
            mocks.spawn.mockImplementation((command, args, options) => {
                const process = createMockProcess();
                mocks.timers.setTimeout(async () => {
                    await process.triggerClose(0);
                }, 1000);
                return process as any;
            });

            // Execute step
            const executePromise = progressUnifier.executeStep(step, 0, 1, onProgress);
            await new Promise(resolve => setImmediate(resolve));
            await advanceTime(2000);
            await executePromise;

            // Record number of progress updates
            const updatesBeforeWait = progressUpdates.length;

            // Fast-forward time significantly
            await advanceTime(60000); // 1 minute later

            // Verify no new progress updates after completion
            // (Timer should be stopped)
            const updatesAfterWait = progressUpdates.length;

            // Should not have many more updates (timer stopped)
            expect(updatesAfterWait - updatesBeforeWait).toBeLessThan(5);

            // Verify no active timers
            expect(getActiveTimers().length).toBe(0);
        });
    });

    describe('Timer cleanup on operation error', () => {
        it('should stop timer even if operation fails', async () => {
            const { onProgress, progressUpdates } = progressCollectorFactory();
            const { progressUnifier, advanceTime, getActiveTimers, mocks, createMockProcess } = createTestableProgressUnifier(mockLogger);

            const step = createMockStep(
                'Failing Command',
                'Running command...',
                'synthetic',
                'non-existent-command',
                5000
            );

            // Mock spawn to fail
            mocks.spawn.mockImplementation((command, args, options) => {
                const process = createMockProcess();
                mocks.timers.setTimeout(async () => {
                    await process.triggerClose(1); // Exit code 1 (failure)
                }, 1000);
                return process as any;
            });

            // Execute step (will fail because command doesn't exist)
            const executePromise = progressUnifier.executeStep(step, 0, 1, onProgress);
            // Attach catch handler immediately to prevent unhandled rejection detection
            executePromise.catch(() => {});

            await new Promise(resolve => setImmediate(resolve));

            try {
                await advanceTime(2000);
                await executePromise;
            } catch (error) {
                // Expected to fail
            }

            // Record number of progress updates
            const updatesBeforeWait = progressUpdates.length;

            // Fast-forward time
            await advanceTime(60000);

            // Verify timer stopped (no excessive new updates)
            const updatesAfterWait = progressUpdates.length;
            expect(updatesAfterWait - updatesBeforeWait).toBeLessThan(5);

            // Verify no active timers
            expect(getActiveTimers().length).toBe(0);
        });
    });
});
