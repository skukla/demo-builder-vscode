/**
 * Unit Tests for ProgressUnifier - Progress Tracking Strategies
 *
 * Tests elapsed time display, formatting, and dynamic updates for
 * progress tracking during long-running operations.
 */

import { createTestableProgressUnifier } from '../../../helpers/progressUnifierTestHelpers';
import { createMockStep, createProgressCollector, createMockLogger } from './testUtils';

describe('ProgressUnifier - Progress Tracking Strategies', () => {
    const progressCollectorFactory = createProgressCollector();
    let mockLogger: ReturnType<typeof createMockLogger>;

    beforeEach(() => {
        jest.clearAllMocks();
        mockLogger = createMockLogger();
    });

    describe('Elapsed time display for operations >30s', () => {
        it('should show elapsed time after 35 seconds', async () => {
            const { onProgress, progressUpdates } = progressCollectorFactory();
            const { progressUnifier, advanceTime, mocks, createMockProcess } = createTestableProgressUnifier(mockLogger);

            const step = createMockStep(
                'Installing Adobe I/O CLI',
                'Installing Adobe I/O CLI...',
                'synthetic',
                'npm install -g @adobe/aio-cli',
                60000
            );

            // Mock spawn to delay completion
            mocks.spawn.mockImplementation((command, args, options) => {
                const process = createMockProcess();
                // Complete after 40 seconds
                mocks.timers.setTimeout(async () => {
                    await process.triggerClose(0);
                }, 40000);
                return process as any;
            });

            // Start execution (don't await yet)
            const executePromise = progressUnifier.executeStep(step, 0, 1, onProgress);

            // Let spawn complete before advancing time
            await new Promise(resolve => setImmediate(resolve));

            // Fast-forward time to 35 seconds (triggers progress intervals)
            await advanceTime(35000);

            // Complete execution
            await advanceTime(5000); // Reach 40s to complete
            await executePromise;

            // Verify elapsed time is shown in detail
            const progressWith35s = progressUpdates.find(
                p => p.command?.detail?.includes('(35s)')
            );

            expect(progressWith35s).toBeDefined();
            expect(progressWith35s?.command?.detail).toMatch(/\(35s\)/);
        }, 10000);
    });

    describe('No elapsed time for operations <30s', () => {
        it('should not show elapsed time for quick operations', async () => {
            const { onProgress, progressUpdates } = progressCollectorFactory();
            const { progressUnifier, advanceTime } = createTestableProgressUnifier(mockLogger);

            const step = createMockStep(
                'Checking Node.js',
                'Checking Node.js...',
                'immediate',
                'node --version',
                500
            );

            const executePromise = progressUnifier.executeStep(step, 0, 1, onProgress);

            // Let spawn complete before advancing time
            await new Promise(resolve => setImmediate(resolve));

            // Advance time by 2 seconds (quick operation)
            await advanceTime(2000);
            await executePromise;

            // Verify no elapsed time is shown in any progress updates
            const progressWithElapsedTime = progressUpdates.find(
                p => p.command?.detail?.match(/\(\d+s\)/)
            );

            expect(progressWithElapsedTime).toBeUndefined();
        });
    });

    describe('Elapsed time formatting', () => {
        it('should format elapsed time as "1m 15s" for 75-second operation', async () => {
            const { onProgress, progressUpdates } = progressCollectorFactory();
            const { progressUnifier, advanceTime, mocks, createMockProcess } = createTestableProgressUnifier(mockLogger);

            const step = createMockStep(
                'Installing Package',
                'Installing Package...',
                'synthetic',
                'npm install',
                120000
            );

            // Mock spawn to delay completion
            mocks.spawn.mockImplementation((command, args, options) => {
                const process = createMockProcess();
                // Complete after 80 seconds
                mocks.timers.setTimeout(async () => {
                    await process.triggerClose(0);
                }, 80000);
                return process as any;
            });

            // Start execution
            const executePromise = progressUnifier.executeStep(step, 0, 1, onProgress);

            // Let spawn complete before advancing time
            await new Promise(resolve => setImmediate(resolve));

            // Fast-forward time to 75 seconds (1m 15s)
            await advanceTime(75000);

            // Complete execution
            await advanceTime(5000);
            await executePromise;

            // Verify "1m 15s" format in detail
            const progressWithElapsedTime = progressUpdates.find(
                p => p.command?.detail?.includes('(1m 15s)')
            );

            expect(progressWithElapsedTime).toBeDefined();
            expect(progressWithElapsedTime?.command?.detail).toMatch(/\(1m 15s\)/);
        }, 10000);
    });

    describe('Elapsed time updates every second', () => {
        it('should update elapsed time dynamically', async () => {
            const { onProgress, progressUpdates } = progressCollectorFactory();
            const { progressUnifier, advanceTime, mocks, createMockProcess } = createTestableProgressUnifier(mockLogger);

            const step = createMockStep(
                'Long Operation',
                'Running long operation...',
                'synthetic',
                'long-command',
                60000
            );

            // Mock spawn to delay completion
            mocks.spawn.mockImplementation((command, args, options) => {
                const process = createMockProcess();
                // Complete after 35 seconds
                mocks.timers.setTimeout(async () => {
                    await process.triggerClose(0);
                }, 35000);
                return process as any;
            });

            // Start execution
            const executePromise = progressUnifier.executeStep(step, 0, 1, onProgress);

            // Let spawn complete before advancing time
            await new Promise(resolve => setImmediate(resolve));

            // Fast-forward to 31 seconds (just past threshold)
            await advanceTime(31000);

            const updates31s = progressUpdates.filter(
                p => p.command?.detail?.includes('(31s)')
            );

            // Fast-forward to 32 seconds
            await advanceTime(1000);

            const updates32s = progressUpdates.filter(
                p => p.command?.detail?.includes('(32s)')
            );

            // Complete execution (need to reach 35s total: 31 + 1 + 3 = 35)
            await advanceTime(3000);
            await executePromise;

            // Verify timer updates each second
            expect(updates31s.length).toBeGreaterThan(0);
            expect(updates32s.length).toBeGreaterThan(0);
        }, 10000);
    });
});
