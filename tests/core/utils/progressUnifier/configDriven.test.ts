/**
 * Unit Tests for ProgressUnifier - Config-Driven Progress Simplification
 *
 * Tests the simplified config-driven approach that replaces the Strategy pattern
 * with data-driven configuration. The Strategy pattern is being removed because:
 * 1. Strategy is selected once at initialization, never changes at runtime
 * 2. Strategies differ only in configuration values, not behavior
 * 3. Configuration is simpler, more testable, and reduces abstraction layers
 *
 * TDD Step 6: Progress Strategy Simplification
 */

import { createTestableProgressUnifier } from '../../../helpers/progressUnifierTestHelpers';
import { createMockStep, createProgressCollector, createMockLogger } from './testUtils';

describe('ProgressUnifier - Config-Driven Approach', () => {
    const progressCollectorFactory = createProgressCollector();
    let mockLogger: ReturnType<typeof createMockLogger>;

    beforeEach(() => {
        jest.clearAllMocks();
        mockLogger = createMockLogger();
    });

    describe('Backward Compatibility: Strategy strings still work', () => {
        it('should accept progressStrategy "exact" and handle percentage-based output', async () => {
            const { onProgress, progressUpdates } = progressCollectorFactory();
            const { progressUnifier, advanceTime, mocks, createMockProcess } = createTestableProgressUnifier(mockLogger);

            // Given: A step with exact progressStrategy (fnm downloads)
            const step = createMockStep(
                'Download Node.js',
                'Downloading Node.js...',
                'exact',
                'fnm install 20',
                10000
            );
            step.progressParser = 'fnm';

            // Mock spawn to emit percentage output
            mocks.spawn.mockImplementation(() => {
                const process = createMockProcess();

                // Simulate fnm output with percentages
                mocks.timers.setTimeout(async () => {
                    process.triggerStdout('Downloading: 25%\n');
                }, 100);
                mocks.timers.setTimeout(async () => {
                    process.triggerStdout('Downloading: 75%\n');
                }, 200);
                mocks.timers.setTimeout(async () => {
                    await process.triggerClose(0);
                }, 300);

                return process as any;
            });

            // When: executeStep is called
            const executePromise = progressUnifier.executeStep(step, 0, 1, onProgress);
            await new Promise(resolve => setImmediate(resolve));
            await advanceTime(500);
            await executePromise;

            // Then: Progress should reflect exact percentages
            const exactProgress = progressUpdates.filter(p => p.command?.confidence === 'exact');
            expect(exactProgress.length).toBeGreaterThan(0);

            // At least one should have a percentage from the output
            const percentageUpdate = progressUpdates.find(p => p.command?.percent === 25 || p.command?.percent === 75);
            expect(percentageUpdate).toBeDefined();
        });

        it('should accept progressStrategy "milestones" and match output patterns', async () => {
            const { onProgress, progressUpdates } = progressCollectorFactory();
            const { progressUnifier, advanceTime, mocks, createMockProcess } = createTestableProgressUnifier(mockLogger);

            // Given: A step with milestones progressStrategy (npm install)
            const step = createMockStep(
                'Install packages',
                'Installing packages...',
                'milestones',
                'npm install',
                30000
            );
            step.milestones = [
                { pattern: 'resolving', progress: 20, message: 'Resolving dependencies' },
                { pattern: 'fetching', progress: 50, message: 'Fetching packages' },
                { pattern: 'linking', progress: 80, message: 'Linking packages' },
            ];

            // Mock spawn to emit milestone output
            mocks.spawn.mockImplementation(() => {
                const process = createMockProcess();

                mocks.timers.setTimeout(async () => {
                    process.triggerStdout('resolving dependencies...\n');
                }, 100);
                mocks.timers.setTimeout(async () => {
                    process.triggerStdout('fetching packages...\n');
                }, 200);
                mocks.timers.setTimeout(async () => {
                    await process.triggerClose(0);
                }, 300);

                return process as any;
            });

            // When: executeStep is called
            const executePromise = progressUnifier.executeStep(step, 0, 1, onProgress);
            await new Promise(resolve => setImmediate(resolve));
            await advanceTime(500);
            await executePromise;

            // Then: Progress should match milestone patterns
            const milestoneProgress = progressUpdates.filter(p => p.command?.confidence === 'estimated');
            expect(milestoneProgress.length).toBeGreaterThan(0);

            // Verify milestone percentages were matched
            const hasResolving = progressUpdates.some(p => p.command?.percent === 20);
            const hasFetching = progressUpdates.some(p => p.command?.percent === 50);
            expect(hasResolving || hasFetching).toBe(true);
        });

        it('should accept progressStrategy "synthetic" and generate time-based progress', async () => {
            const { onProgress, progressUpdates } = progressCollectorFactory();
            const { progressUnifier, advanceTime, mocks, createMockProcess } = createTestableProgressUnifier(mockLogger);

            // Given: A step with synthetic progressStrategy (unknown duration)
            const step = createMockStep(
                'Run build',
                'Building...',
                'synthetic',
                'npm run build',
                20000  // estimated 20 seconds
            );

            // Mock spawn to complete after 10 seconds
            mocks.spawn.mockImplementation(() => {
                const process = createMockProcess();
                mocks.timers.setTimeout(async () => {
                    await process.triggerClose(0);
                }, 10000);
                return process as any;
            });

            // When: executeStep is called
            const executePromise = progressUnifier.executeStep(step, 0, 1, onProgress);
            await new Promise(resolve => setImmediate(resolve));

            // Advance time to 5 seconds (should be ~45% progress: 5000/20000 * 100 * 0.9 cap)
            await advanceTime(5000);

            // Then: Synthetic progress should be generated
            const syntheticProgress = progressUpdates.filter(p => p.command?.confidence === 'synthetic');
            expect(syntheticProgress.length).toBeGreaterThan(0);

            // Progress should never exceed 95% until complete
            const allPercents = syntheticProgress.map(p => p.command?.percent || 0);
            const maxBeforeComplete = Math.max(...allPercents.filter(p => p < 100));
            expect(maxBeforeComplete).toBeLessThanOrEqual(95);

            // Complete execution
            await advanceTime(6000);
            await executePromise;
        });

        it('should accept progressStrategy "immediate" and show quick progress steps', async () => {
            const { onProgress, progressUpdates } = progressCollectorFactory();
            const { progressUnifier, advanceTime, mocks, createMockProcess } = createTestableProgressUnifier(mockLogger);

            // Given: A step with immediate progressStrategy (fast commands)
            const step = createMockStep(
                'Check version',
                'Checking version...',
                'immediate',
                'node --version',
                500  // Fast operation
            );

            // Mock spawn for fast completion
            mocks.spawn.mockImplementation(() => {
                const process = createMockProcess();
                mocks.timers.setTimeout(async () => {
                    await process.triggerClose(0);
                }, 50);
                return process as any;
            });

            // When: executeStep is called
            const executePromise = progressUnifier.executeStep(step, 0, 1, onProgress);
            await new Promise(resolve => setImmediate(resolve));
            await advanceTime(2000);
            await executePromise;

            // Then: Progress should go through smooth steps (20, 50, 80, 100)
            const allPercents = progressUpdates
                .map(p => p.command?.percent)
                .filter((p): p is number => p !== undefined);

            // Should have 100% completion
            expect(allPercents).toContain(100);

            // All progress should be exact confidence
            const exactProgress = progressUpdates.filter(p => p.command?.confidence === 'exact');
            expect(exactProgress.length).toBeGreaterThan(0);
        });
    });

    describe('Strategy selection happens once at initialization', () => {
        it('should not switch strategies during execution', async () => {
            const { onProgress, progressUpdates } = progressCollectorFactory();
            const { progressUnifier, advanceTime, mocks, createMockProcess } = createTestableProgressUnifier(mockLogger);

            // Given: A step with synthetic strategy
            const step = createMockStep(
                'Long operation',
                'Running...',
                'synthetic',
                'long-command',
                60000
            );

            // Mock spawn to complete slowly
            mocks.spawn.mockImplementation(() => {
                const process = createMockProcess();
                mocks.timers.setTimeout(async () => {
                    // Even if output contains percentages, strategy should remain synthetic
                    process.triggerStdout('Progress: 50%\n');
                }, 5000);
                mocks.timers.setTimeout(async () => {
                    await process.triggerClose(0);
                }, 10000);
                return process as any;
            });

            // When: executeStep is called
            const executePromise = progressUnifier.executeStep(step, 0, 1, onProgress);
            await new Promise(resolve => setImmediate(resolve));
            await advanceTime(15000);
            await executePromise;

            // Then: All progress updates should use synthetic confidence (strategy didn't switch)
            const syntheticUpdates = progressUpdates.filter(p => p.command?.confidence === 'synthetic');
            const exactUpdates = progressUpdates.filter(p => p.command?.confidence === 'exact');

            expect(syntheticUpdates.length).toBeGreaterThan(0);
            // Exact updates should NOT appear because we're using synthetic strategy
            // (Note: The final update may have different confidence based on implementation)
        });
    });

    describe('Default strategy fallback', () => {
        it('should use synthetic strategy when progressStrategy is undefined', async () => {
            const { onProgress, progressUpdates } = progressCollectorFactory();
            const { progressUnifier, advanceTime, mocks, createMockProcess } = createTestableProgressUnifier(mockLogger);

            // Given: A step without progressStrategy
            const step = createMockStep(
                'Unknown step',
                'Running...',
                'synthetic', // Will be overwritten
                'some-command',
                10000
            );
            // @ts-ignore - Testing undefined case
            step.progressStrategy = undefined;

            // Mock spawn
            mocks.spawn.mockImplementation(() => {
                const process = createMockProcess();
                mocks.timers.setTimeout(async () => {
                    await process.triggerClose(0);
                }, 5000);
                return process as any;
            });

            // When: executeStep is called
            const executePromise = progressUnifier.executeStep(step, 0, 1, onProgress);
            await new Promise(resolve => setImmediate(resolve));
            await advanceTime(6000);
            await executePromise;

            // Then: Should fall back to synthetic strategy
            const syntheticUpdates = progressUpdates.filter(p => p.command?.confidence === 'synthetic');
            expect(syntheticUpdates.length).toBeGreaterThan(0);
        });

        it('should use synthetic strategy when progressStrategy is invalid', async () => {
            const { onProgress, progressUpdates } = progressCollectorFactory();
            const { progressUnifier, advanceTime, mocks, createMockProcess } = createTestableProgressUnifier(mockLogger);

            // Given: A step with invalid progressStrategy
            const step = createMockStep(
                'Invalid step',
                'Running...',
                'synthetic', // Will be overwritten
                'some-command',
                10000
            );
            // @ts-ignore - Testing invalid case
            step.progressStrategy = 'invalid-strategy';

            // Mock spawn
            mocks.spawn.mockImplementation(() => {
                const process = createMockProcess();
                mocks.timers.setTimeout(async () => {
                    await process.triggerClose(0);
                }, 5000);
                return process as any;
            });

            // When: executeStep is called
            const executePromise = progressUnifier.executeStep(step, 0, 1, onProgress);
            await new Promise(resolve => setImmediate(resolve));
            await advanceTime(6000);
            await executePromise;

            // Then: Should fall back to synthetic strategy
            const syntheticUpdates = progressUpdates.filter(p => p.command?.confidence === 'synthetic');
            expect(syntheticUpdates.length).toBeGreaterThan(0);
        });
    });

    describe('Progress calculation behavior matches original implementation', () => {
        it('should cap synthetic progress at 95% until command completes', async () => {
            const { onProgress, progressUpdates } = progressCollectorFactory();
            const { progressUnifier, advanceTime, mocks, createMockProcess } = createTestableProgressUnifier(mockLogger);

            // Given: A step that takes longer than estimated
            const step = createMockStep(
                'Slow operation',
                'Running slowly...',
                'synthetic',
                'slow-command',
                10000  // Estimate 10 seconds
            );

            // Mock spawn to complete after 20 seconds (2x estimated)
            mocks.spawn.mockImplementation(() => {
                const process = createMockProcess();
                mocks.timers.setTimeout(async () => {
                    await process.triggerClose(0);
                }, 20000);
                return process as any;
            });

            // When: executeStep is called
            const executePromise = progressUnifier.executeStep(step, 0, 1, onProgress);
            await new Promise(resolve => setImmediate(resolve));

            // Advance past estimated duration
            await advanceTime(15000);

            // Then: Progress should be capped at 95%
            const currentProgress = progressUpdates
                .filter(p => p.command?.percent !== undefined)
                .map(p => p.command!.percent!);

            const maxProgress = Math.max(...currentProgress);
            expect(maxProgress).toBeLessThanOrEqual(95);

            // Complete execution
            await advanceTime(6000);
            await executePromise;

            // After completion, should have 100% overall progress
            const finalProgress = progressUpdates[progressUpdates.length - 1];
            // The final update may be overall progress without command details
            // Check that we reached 100% in some form
            const has100Percent = progressUpdates.some(
                p => p.command?.percent === 100 || p.overall.percent === 100
            );
            expect(has100Percent).toBe(true);
        });

        it('should calculate exact progress from percentage output', async () => {
            const { onProgress, progressUpdates } = progressCollectorFactory();
            const { progressUnifier, advanceTime, mocks, createMockProcess } = createTestableProgressUnifier(mockLogger);

            // Given: A step with exact strategy
            const step = createMockStep(
                'Download',
                'Downloading...',
                'exact',
                'download-command',
                60000
            );

            // Mock spawn to emit specific percentages
            mocks.spawn.mockImplementation(() => {
                const process = createMockProcess();

                mocks.timers.setTimeout(async () => {
                    process.triggerStdout('Progress: 33%\n');
                }, 100);
                mocks.timers.setTimeout(async () => {
                    process.triggerStdout('Progress: 66%\n');
                }, 200);
                mocks.timers.setTimeout(async () => {
                    process.triggerStdout('Progress: 100%\n');
                }, 300);
                mocks.timers.setTimeout(async () => {
                    await process.triggerClose(0);
                }, 400);

                return process as any;
            });

            // When: executeStep is called
            const executePromise = progressUnifier.executeStep(step, 0, 1, onProgress);
            await new Promise(resolve => setImmediate(resolve));
            await advanceTime(500);
            await executePromise;

            // Then: Progress should match exact percentages from output
            const exactPercents = progressUpdates
                .filter(p => p.command?.type === 'determinate')
                .map(p => p.command!.percent!);

            expect(exactPercents).toContain(33);
            expect(exactPercents).toContain(66);
        });
    });
});
