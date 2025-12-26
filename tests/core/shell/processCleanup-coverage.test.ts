/**
 * Unit Tests for ProcessCleanup - Coverage Gap Remediation
 *
 * Tests uncovered paths in processCleanup.ts:
 * 1. killWithTimeout fallback when tree-kill unavailable
 * 2. processExists returning true on EPERM
 * 3. ESRCH handling during force-kill timeout
 * 4. Skip force-kill timeout when signal is SIGKILL
 * 5. Force-kill polling in tree-kill path
 *
 * Uses fake timers and mocking for deterministic behavior.
 */

// Mock tree-kill BEFORE importing ProcessCleanup
const mockTreeKill = jest.fn();
jest.mock('tree-kill', () => mockTreeKill);

// Mock logger to avoid side effects
jest.mock('@/core/logging/debugLogger', () => ({
    getLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }),
}));

import { ProcessCleanup } from '@/core/shell/processCleanup';

describe('ProcessCleanup - Coverage Gaps', () => {
    let originalKill: typeof process.kill;
    let processCleanup: ProcessCleanup;
    let processExistsSet: Set<number>;
    let killCalls: Array<{ pid: number; signal: NodeJS.Signals | number }>;

    beforeEach(() => {
        jest.useFakeTimers();
        jest.clearAllMocks();

        originalKill = process.kill;
        processExistsSet = new Set([1000, 2000, 3000]);
        killCalls = [];

        processCleanup = new ProcessCleanup({ gracefulTimeout: 5000 });
    });

    afterEach(() => {
        // Run only pending timers to clean up, then clear
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
        process.kill = originalKill;
    });

    // ============================================================
    // killWithTimeout Fallback Path Tests (4 tests)
    // ============================================================
    describe('killWithTimeout Fallback Path', () => {
        beforeEach(() => {
            // Set up process.kill mock
            process.kill = jest.fn().mockImplementation((pid: number, signal: NodeJS.Signals | number = 'SIGTERM') => {
                killCalls.push({ pid, signal });

                if (signal === 0) {
                    // Signal 0 checks existence
                    if (!processExistsSet.has(pid)) {
                        const error: any = new Error('No such process');
                        error.code = 'ESRCH';
                        throw error;
                    }
                    return true;
                }

                if (!processExistsSet.has(pid)) {
                    const error: any = new Error('No such process');
                    error.code = 'ESRCH';
                    throw error;
                }

                // SIGTERM/SIGKILL kills the process
                if (signal === 'SIGTERM' || signal === 'SIGKILL') {
                    processExistsSet.delete(pid);
                }

                return true;
            }) as any;

            // Create fresh instance and spy on isTreeKillAvailable to return false
            processCleanup = new ProcessCleanup({ gracefulTimeout: 5000 });
            jest.spyOn(processCleanup as any, 'isTreeKillAvailable').mockReturnValue(false);
        });

        it('should use killWithTimeout when tree-kill unavailable', async () => {
            // Given: tree-kill is unavailable (mocked via spy)
            const pid = 1000;

            // When: killProcessTree is called
            const promise = processCleanup.killProcessTree(pid, 'SIGTERM');

            // Advance timers to allow polling (100ms check interval)
            jest.advanceTimersByTime(200);

            // Then: should complete using killWithTimeout
            await promise;

            // Verify process.kill was called with SIGTERM (not tree-kill)
            expect(killCalls.some(c => c.signal === 'SIGTERM')).toBe(true);
            expect(processExistsSet.has(pid)).toBe(false);
        });

        it('should resolve immediately when process exits after initial signal', async () => {
            // Given: tree-kill unavailable and process that exits immediately after signal
            const pid = 2000;

            // When: killProcessTree is called
            const promise = processCleanup.killProcessTree(pid, 'SIGTERM');

            // Process exits immediately after SIGTERM (no need to advance much)
            jest.advanceTimersByTime(50);

            // Then: should resolve
            await promise;
            expect(processExistsSet.has(pid)).toBe(false);
        });

        it('should handle ESRCH during force-kill timeout', async () => {
            // Given: tree-kill unavailable and process that ignores SIGTERM
            // but exits before SIGKILL is sent
            const pid = 1000;
            let sigTermSent = false;

            process.kill = jest.fn().mockImplementation((p: number, sig: NodeJS.Signals | number) => {
                killCalls.push({ pid: p, signal: sig });

                if (sig === 0) {
                    // After SIGTERM sent and timeout passed, process is gone
                    if (sigTermSent && killCalls.filter(c => c.signal === 0).length > 30) {
                        const error: any = new Error('ESRCH');
                        error.code = 'ESRCH';
                        throw error;
                    }
                    return true;
                }

                if (sig === 'SIGTERM') {
                    sigTermSent = true;
                    // Process ignores SIGTERM (stays alive)
                    return true;
                }

                if (sig === 'SIGKILL') {
                    // Process exited before we could SIGKILL
                    const error: any = new Error('ESRCH');
                    error.code = 'ESRCH';
                    throw error;
                }

                return true;
            }) as any;

            // Create fresh instance with short graceful timeout
            processCleanup = new ProcessCleanup({ gracefulTimeout: 1000 });
            jest.spyOn(processCleanup as any, 'isTreeKillAvailable').mockReturnValue(false);

            // When: killProcessTree is called
            const promise = processCleanup.killProcessTree(pid, 'SIGTERM');

            // Advance past graceful timeout to trigger force-kill
            jest.advanceTimersByTime(1100);

            // Then: should resolve without error (ESRCH during SIGKILL is handled)
            await promise;
        });

        it('should skip force-kill timeout when signal is SIGKILL', async () => {
            // Given: tree-kill unavailable and SIGKILL requested directly
            const pid = 3000;

            // When: killProcessTree is called with SIGKILL directly
            const promise = processCleanup.killProcessTree(pid, 'SIGKILL');

            // Advance timers minimally
            jest.advanceTimersByTime(200);

            // Then: should complete without waiting for graceful timeout
            await promise;

            // Verify SIGKILL was sent (not waiting for SIGTERM timeout)
            expect(killCalls.some(c => c.signal === 'SIGKILL')).toBe(true);
            expect(processExistsSet.has(pid)).toBe(false);
        });
    });

    // ============================================================
    // Error Handling Tests (2 tests)
    // ============================================================
    describe('Error Handling', () => {
        beforeEach(() => {
            // Create fresh instance
            processCleanup = new ProcessCleanup({ gracefulTimeout: 5000 });
            // Disable tree-kill for this suite
            jest.spyOn(processCleanup as any, 'isTreeKillAvailable').mockReturnValue(false);
        });

        it('should handle EPERM error during initial signal in killWithTimeout', async () => {
            // Given: process exists but throws EPERM when trying to kill
            const pid = 1000;

            process.kill = jest.fn().mockImplementation((p: number, sig: NodeJS.Signals | number) => {
                if (sig === 0) {
                    // Process exists
                    return true;
                }

                // EPERM when sending actual signal
                const error: any = new Error('Operation not permitted');
                error.code = 'EPERM';
                throw error;
            }) as any;

            // When/Then: should reject with error
            await expect(processCleanup.killProcessTree(pid, 'SIGTERM')).rejects.toThrow(
                /Failed to kill process/
            );
        });

        it('should return true for processExists when EPERM thrown on signal 0', async () => {
            // Given: process exists but we don't have permission to check it
            // (EPERM on signal 0 means process exists but we can't access it)
            const pid = 1000;
            let attemptedKill = false;

            process.kill = jest.fn().mockImplementation((p: number, sig: NodeJS.Signals | number) => {
                if (sig === 0) {
                    // EPERM on existence check - process exists but no permission
                    const error: any = new Error('Operation not permitted');
                    error.code = 'EPERM';
                    throw error;
                }

                // Attempting actual kill - this proves processExists returned true
                attemptedKill = true;
                const error: any = new Error('Operation not permitted');
                error.code = 'EPERM';
                throw error;
            }) as any;

            // When: killProcessTree is called
            try {
                await processCleanup.killProcessTree(pid, 'SIGTERM');
            } catch {
                // Expected - EPERM on actual kill
            }

            // Then: should have attempted to kill
            // (meaning processExists returned true despite EPERM)
            expect(attemptedKill).toBe(true);
        });
    });

    // ============================================================
    // Tree-Kill Force-Kill Path Tests (2 tests)
    // ============================================================
    describe('Tree-Kill Force-Kill Path', () => {
        beforeEach(() => {
            mockTreeKill.mockClear();

            // Create fresh instance (tree-kill available by default)
            processCleanup = new ProcessCleanup({ gracefulTimeout: 1000 });
        });

        it('should poll after force-kill in tree-kill path', async () => {
            // This test verifies lines 194-199: final poll after SIGKILL in tree-kill path
            // Given: Process that ignores SIGTERM but dies to SIGKILL
            const pid = 1000;

            // Configure tree-kill to succeed (signal sent)
            mockTreeKill.mockImplementation((p: number, sig: string, cb: (err?: Error) => void) => {
                // Callback immediately - signal sent but we poll for exit
                cb();
            });

            // Process stays alive initially, then dies to SIGKILL
            let sigKillSent = false;
            process.kill = jest.fn().mockImplementation((p: number, sig: NodeJS.Signals | number) => {
                if (sig === 0) {
                    // After SIGKILL, process is gone
                    if (sigKillSent) {
                        const error: any = new Error('ESRCH');
                        error.code = 'ESRCH';
                        throw error;
                    }
                    // Still alive
                    return true;
                }

                if (sig === 'SIGKILL') {
                    sigKillSent = true;
                    return true;
                }

                return true;
            }) as any;

            // When: killProcessTree is called
            const promise = processCleanup.killProcessTree(pid, 'SIGTERM');

            // Advance past graceful timeout (1000ms) + polling time
            jest.advanceTimersByTime(1200);

            // Then: should complete with force-kill
            await promise;

            // Verify force-kill was triggered
            expect(sigKillSent).toBe(true);
        });

        it('should handle ESRCH during tree-kill force-kill', async () => {
            // This test verifies lines 187-191: ESRCH handling during force-kill
            // Given: Process exits between SIGTERM timeout and SIGKILL
            const pid = 2000;

            mockTreeKill.mockImplementation((p: number, sig: string, cb: (err?: Error) => void) => {
                cb(); // Signal sent successfully
            });

            // Process stays alive through SIGTERM, but exits before SIGKILL lands
            let pollCount = 0;
            process.kill = jest.fn().mockImplementation((p: number, sig: NodeJS.Signals | number) => {
                if (sig === 0) {
                    pollCount++;
                    // After several polls during timeout, process exits on its own
                    if (pollCount > 10) {
                        const error: any = new Error('ESRCH');
                        error.code = 'ESRCH';
                        throw error;
                    }
                    return true;
                }

                if (sig === 'SIGKILL') {
                    // Process already gone
                    const error: any = new Error('ESRCH');
                    error.code = 'ESRCH';
                    throw error;
                }

                return true;
            }) as any;

            // When: killProcessTree is called
            const promise = processCleanup.killProcessTree(pid, 'SIGTERM');

            // Advance time to allow polling and timeout
            jest.advanceTimersByTime(1500);

            // Then: should resolve without error (ESRCH is handled gracefully)
            await promise;
        });
    });
});
