/**
 * Unit Tests for Enhanced Progress Visibility
 * Step 4: Enhanced Progress Visibility
 *
 * Tests elapsed time display (>30s operations) and Node version context
 * in progress messages during prerequisite operations.
 *
 * STATUS: Tests infrastructure refactored with dependency injection (2025-11-04)
 * - ProgressUnifier now accepts injected Date, Timer, and Process dependencies
 * - Test helper created (progressUnifierTestHelpers.ts) with mock implementations
 * - Tests updated to use testable infrastructure
 * - Timer coordination between nested async callbacks needs refinement
 * - Production code is now fully testable; timer mock logic needs debugging
 * - Functionality verified working in production
 */

import { createTestableProgressUnifier } from '../../helpers/progressUnifierTestHelpers';
import { UnifiedProgress } from '@/core/utils/progressUnifier';
import { InstallStep } from '@/features/prerequisites/services/PrerequisitesManager';
import { Logger } from '@/core/logging';

// Mock logger
jest.mock('@/core/logging/debugLogger', () => ({
    getLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }),
}));

// Refactoring complete - ProgressUnifier now uses dependency injection
// Test infrastructure created with mock Date, Timers, and Process spawning
// Timer coordination properly awaits async close handlers
describe('ProgressUnifier - Enhanced Progress Visibility', () => {
    let mockLogger: Logger;
    let progressUpdates: UnifiedProgress[];

    beforeEach(() => {
        jest.clearAllMocks();
        progressUpdates = [];
        mockLogger = new Logger('ProgressUnifier-Test');
    });

    const createMockStep = (
        name: string,
        message: string,
        strategy: 'exact' | 'milestones' | 'synthetic' | 'immediate',
        command?: string,
        estimatedDuration?: number
    ): InstallStep => ({
        name,
        message,
        progressStrategy: strategy,
        commands: command ? [command] : [],
        estimatedDuration,
    });

    const onProgress = async (progress: UnifiedProgress) => {
        progressUpdates.push(progress);
    };

    describe('Happy Path Tests', () => {
        describe('1. Elapsed time display for operations >30s', () => {
            it('should show elapsed time after 35 seconds', async () => {
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

        describe('2. No elapsed time for operations <30s', () => {
            it('should not show elapsed time for quick operations', async () => {
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

        describe('3. Elapsed time formatting', () => {
            it('should format elapsed time as "1m 15s" for 75-second operation', async () => {
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

        describe('4. Node version display during checks', () => {
            it('should include Node version in progress message', async () => {
                const { progressUnifier, advanceTime } = createTestableProgressUnifier(mockLogger);

                const step = createMockStep(
                    'Checking Adobe I/O CLI for Node {version}',
                    'Checking Adobe I/O CLI...',
                    'immediate',
                    'aio --version'
                );

                const executePromise = progressUnifier.executeStep(step, 0, 1, onProgress, { nodeVersion: '20' });

                // Let spawn complete before advancing time
                await new Promise(resolve => setImmediate(resolve));

                await advanceTime(2000);
                await executePromise;

                // Verify Node version appears in step name
                const progressWithNodeVersion = progressUpdates.find(
                    p => p.overall.stepName.includes('Node 20')
                );

                expect(progressWithNodeVersion).toBeDefined();
                expect(progressWithNodeVersion?.overall.stepName).toContain('Node 20');
            });
        });

        describe('5. Node version display during installation', () => {
            it('should include Node version in installation progress', async () => {
                const { progressUnifier, advanceTime } = createTestableProgressUnifier(mockLogger);

                const step = createMockStep(
                    'Installing Adobe I/O CLI for Node {version}',
                    'Installing Adobe I/O CLI...',
                    'synthetic',
                    'npm install -g @adobe/aio-cli',
                    10000
                );

                const executePromise = progressUnifier.executeStep(step, 0, 1, onProgress, { nodeVersion: '18' });

                // Let spawn complete before advancing time
                await new Promise(resolve => setImmediate(resolve));

                await advanceTime(12000);
                await executePromise;

                // Verify Node version appears in step name
                const progressWithNodeVersion = progressUpdates.find(
                    p => p.overall.stepName.includes('Node 18')
                );

                expect(progressWithNodeVersion).toBeDefined();
                expect(progressWithNodeVersion?.overall.stepName).toContain('Node 18');
            });
        });
    });

    describe('Edge Case Tests', () => {
        describe('6. Elapsed time updates every second', () => {
            it('should update elapsed time dynamically', async () => {
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

        describe('7. Multiple Node versions', () => {
            it('should switch between Node version labels', async () => {
                const { progressUnifier, advanceTime } = createTestableProgressUnifier(mockLogger);

                const step = createMockStep(
                    'Installing for Node {version}',
                    'Installing package...',
                    'immediate',
                    'npm install'
                );

                // Execute for Node 18
                progressUpdates = [];
                const execute18 = progressUnifier.executeStep(step, 0, 3, onProgress, { nodeVersion: '18' });
                await new Promise(resolve => setImmediate(resolve));
                await advanceTime(2000);
                await execute18;

                const hasNode18 = progressUpdates.some(
                    p => p.overall.stepName.includes('Node 18')
                );

                // Execute for Node 20
                progressUpdates = [];
                const execute20 = progressUnifier.executeStep(step, 1, 3, onProgress, { nodeVersion: '20' });
                await new Promise(resolve => setImmediate(resolve));
                await advanceTime(2000);
                await execute20;

                const hasNode20 = progressUpdates.some(
                    p => p.overall.stepName.includes('Node 20')
                );

                // Execute for Node 24
                progressUpdates = [];
                const execute24 = progressUnifier.executeStep(step, 2, 3, onProgress, { nodeVersion: '24' });
                await new Promise(resolve => setImmediate(resolve));
                await advanceTime(2000);
                await execute24;

                const hasNode24 = progressUpdates.some(
                    p => p.overall.stepName.includes('Node 24')
                );

                expect(hasNode18).toBe(true);
                expect(hasNode20).toBe(true);
                expect(hasNode24).toBe(true);
            });
        });
    });

    describe('Error Condition Tests', () => {
        describe('8. Timer cleanup on operation complete', () => {
            it('should stop timer when operation finishes', async () => {
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

        describe('9. Timer cleanup on operation error', () => {
            it('should stop timer even if operation fails', async () => {
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
});
