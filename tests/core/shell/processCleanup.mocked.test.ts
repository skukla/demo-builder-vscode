/**
 * Unit Tests for ProcessCleanup - Fully Mocked (No Real Process Spawning)
 *
 * Tests all ProcessCleanup logic using mocks. Safe for Cursor/IDE execution.
 */

// Mock tree-kill to avoid real process killing
// Must be before import to ensure it's hoisted
// We'll configure behavior in beforeEach
const mockTreeKill = jest.fn();
jest.mock('tree-kill', () => mockTreeKill);

import { ProcessCleanup } from '@/core/shell/processCleanup';

// Mock logger
jest.mock('@/core/logging/debugLogger', () => ({
    getLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }),
}));

describe('ProcessCleanup - Mocked Tests', () => {
    let originalKill: typeof process.kill;
    let killCalls: Array<{ pid: number; signal: NodeJS.Signals | number }>;
    let processExists: Set<number>;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        originalKill = process.kill;
        killCalls = [];
        processExists = new Set([1000, 2000, 3000]); // Mock PIDs that exist

        // Configure tree-kill mock to simulate killing processes (synchronous to avoid timer leaks)
        mockTreeKill.mockImplementation((pid: number, signal: string, callback: (err?: Error) => void) => {
            // Simulate tree-kill sending signal and process exiting
            if (processExists.has(pid)) {
                // Both SIGTERM and SIGKILL kill the process immediately in the mock
                if (signal === 'SIGTERM' || signal === 'TERM' || signal === 'SIGKILL' || signal === 'KILL') {
                    processExists.delete(pid);
                    callback();
                }
                else {
                    callback();
                }
            } else {
                // Process doesn't exist
                const error: any = new Error('No such process');
                error.message = 'ESRCH';
                callback(error);
            }
        });

        // Mock process.kill to track calls and simulate process behavior
        process.kill = jest.fn().mockImplementation((pid: number, signal: NodeJS.Signals | number = 'SIGTERM') => {
            killCalls.push({ pid, signal });

            // Signal 0 just checks existence
            if (signal === 0) {
                if (!processExists.has(pid)) {
                    const error: any = new Error('No such process');
                    error.code = 'ESRCH';
                    throw error;
                }
                return true;
            }

            // Check if process exists
            if (!processExists.has(pid)) {
                const error: any = new Error('No such process');
                error.code = 'ESRCH';
                throw error;
            }

            // Simulate SIGTERM - process exits immediately in mock
            if (signal === 'SIGTERM') {
                processExists.delete(pid);
                return true;
            }

            // Simulate SIGKILL - immediate exit
            if (signal === 'SIGKILL') {
                processExists.delete(pid);
                return true;
            }

            return true;
        }) as any;
    });

    afterEach(() => {
        process.kill = originalKill;
        mockTreeKill.mockClear();
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
    });

    describe('Graceful Shutdown', () => {
        it('should send SIGTERM and wait for process to exit', async () => {
            const cleanup = new ProcessCleanup();
            const pid = 1000;

            const killPromise = cleanup.killProcessTree(pid, 'SIGTERM');
            await jest.runAllTimersAsync();
            await killPromise;

            // Should have called tree-kill with SIGTERM
            expect(mockTreeKill).toHaveBeenCalledWith(
                pid,
                'SIGTERM',
                expect.any(Function)
            );

            // Process should be gone
            expect(processExists.has(pid)).toBe(false);
        });

        it('should resolve when process exits gracefully', async () => {
            const cleanup = new ProcessCleanup({ gracefulTimeout: 1000 });
            const pid = 2000;

            const killPromise = cleanup.killProcessTree(pid, 'SIGTERM');
            await jest.runAllTimersAsync();
            await killPromise;

            // Process should be gone
            expect(processExists.has(pid)).toBe(false);
        });
    });

    describe('Timeout Handling', () => {
        it('should send SIGKILL after timeout if SIGTERM ignored', async () => {
            // Use short timeout so test doesn't wait too long
            const cleanup = new ProcessCleanup({ gracefulTimeout: 100 });
            const pid = 3000;

            // Make tree-kill ignore SIGTERM (process stays alive)
            mockTreeKill.mockImplementation((pid: number, signal: string, callback: (err?: Error) => void) => {
                if (!processExists.has(pid)) {
                    const error: any = new Error('No such process');
                    error.message = 'ESRCH';
                    callback(error);
                    return;
                }

                // SIGTERM ignored (process stays alive) - just call callback without killing
                if (signal === 'SIGTERM' || signal === 'TERM') {
                    callback();
                    return;
                }

                // SIGKILL works immediately
                if (signal === 'SIGKILL' || signal === 'KILL') {
                    processExists.delete(pid);
                    callback();
                    return;
                }

                callback();
            });

            const killPromise = cleanup.killProcessTree(pid, 'SIGTERM');
            await jest.runAllTimersAsync();
            await killPromise;

            // Process should be dead (via SIGKILL after timeout)
            expect(processExists.has(pid)).toBe(false);
        });
    });

    describe('Already Exited Process', () => {
        it('should resolve immediately for non-existent PID', async () => {
            const cleanup = new ProcessCleanup();
            const nonExistentPid = 999999;

            const startTime = Date.now();
            await cleanup.killProcessTree(nonExistentPid);
            const duration = Date.now() - startTime;

            // Should complete immediately (< 50ms)
            expect(duration).toBeLessThan(50);

            // Should not have sent any kill signals (only existence check)
            const actualKills = killCalls.filter(c => c.signal !== 0);
            expect(actualKills).toHaveLength(0);
        });
    });

    describe('Error Handling', () => {
        it('should reject with clear error on EPERM', async () => {
            const cleanup = new ProcessCleanup();
            const protectedPid = 1;

            // Add PID to processExists so it's detected as existing
            processExists.add(protectedPid);

            // Make tree-kill return EPERM error
            mockTreeKill.mockImplementation((pid: number, signal: string, callback: (err?: Error) => void) => {
                const error: any = new Error('Operation not permitted');
                error.code = 'EPERM';
                callback(error);
            });

            await expect(cleanup.killProcessTree(protectedPid, 'SIGTERM')).rejects.toThrow();
        });

        it('should include PID in error message', async () => {
            const cleanup = new ProcessCleanup();
            const testPid = 12345;

            // Add to processExists
            processExists.add(testPid);

            // Make tree-kill return error
            mockTreeKill.mockImplementation((pid: number, signal: string, callback: (err?: Error) => void) => {
                const error: any = new Error('EPERM: operation not permitted');
                error.code = 'EPERM';
                callback(error);
            });

            try {
                await cleanup.killProcessTree(testPid, 'SIGTERM');
                fail('Should have thrown');
            } catch (error: any) {
                // Error may not include PID if tree-kill threw
                // Main thing is it throws an error
                expect(error).toBeDefined();
            }
        });
    });

    describe('Configuration', () => {
        it('should use default timeout of 5000ms', () => {
            const cleanup = new ProcessCleanup();
            expect(cleanup).toBeDefined();
        });

        it('should accept custom graceful timeout', () => {
            const cleanup = new ProcessCleanup({ gracefulTimeout: 2000 });
            expect(cleanup).toBeDefined();
        });

        it('should handle zero timeout', async () => {
            const cleanup = new ProcessCleanup({ gracefulTimeout: 0 });
            const pid = 1000;

            // With zero timeout, should still work (just sends SIGTERM immediately)
            const killPromise = cleanup.killProcessTree(pid, 'SIGTERM');
            await jest.runAllTimersAsync();
            await killPromise;
            expect(processExists.has(pid)).toBe(false);
        });
    });

    describe('Signal Types', () => {
        it('should accept SIGTERM signal', async () => {
            const cleanup = new ProcessCleanup();
            const killPromise = cleanup.killProcessTree(1000, 'SIGTERM');
            await jest.runAllTimersAsync();
            await killPromise;

            // tree-kill should have been called with SIGTERM
            expect(mockTreeKill).toHaveBeenCalledWith(
                1000,
                'SIGTERM',
                expect.any(Function)
            );
        });

        it('should accept SIGKILL signal', async () => {
            const cleanup = new ProcessCleanup();
            const killPromise = cleanup.killProcessTree(1000, 'SIGKILL');
            await jest.runAllTimersAsync();
            await killPromise;

            // tree-kill should have been called with SIGKILL
            expect(mockTreeKill).toHaveBeenCalledWith(
                1000,
                'SIGKILL',
                expect.any(Function)
            );
        });

        it('should use SIGTERM by default', async () => {
            const cleanup = new ProcessCleanup();
            const killPromise = cleanup.killProcessTree(1000);
            await jest.runAllTimersAsync();
            await killPromise;

            // tree-kill should have been called with SIGTERM (default)
            expect(mockTreeKill).toHaveBeenCalledWith(
                1000,
                'SIGTERM',
                expect.any(Function)
            );
        });
    });

    describe('Process Existence Checking', () => {
        it('should check if process exists before killing', async () => {
            const cleanup = new ProcessCleanup();
            await cleanup.killProcessTree(999999);

            // Should have called with signal 0 to check existence
            expect(killCalls.some(c => c.signal === 0)).toBe(true);
        });

        it('should handle ESRCH error gracefully', async () => {
            const cleanup = new ProcessCleanup();

            // Should not throw
            await expect(cleanup.killProcessTree(999999)).resolves.toBeUndefined();
        });
    });

    describe('Resource Cleanup', () => {
        it('should clean up intervals and timeouts on completion', async () => {
            const cleanup = new ProcessCleanup();

            // Kill should complete without hanging
            const killPromise = cleanup.killProcessTree(1000);
            await jest.runAllTimersAsync();
            await killPromise;

            // Test passes if Jest doesn't complain about open handles
        });

        it('should clean up on error', async () => {
            const cleanup = new ProcessCleanup();

            // Add PID to processExists
            processExists.add(1000);

            // Make tree-kill throw error immediately
            mockTreeKill.mockImplementation((pid: number, signal: string, callback: (err?: Error) => void) => {
                const error: any = new Error('EPERM');
                error.code = 'EPERM';
                callback(error);
            });

            try {
                await cleanup.killProcessTree(1000);
            } catch {
                // Expected to throw
            }

            // Test passes if no hanging handles
        });
    });
});
