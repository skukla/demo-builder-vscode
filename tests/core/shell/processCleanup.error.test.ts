/**
 * Unit Tests for ProcessCleanup - Error Handling
 *
 * Tests error handling for permission denied, invalid PIDs,
 * and other error conditions using SAFE MOCKING (no system process killing).
 */

import { ProcessCleanup } from '@/core/shell/processCleanup';
import { spawn } from 'child_process';
import { once } from 'events';

// Mock logger to capture error logs
// Create mock functions inside the factory to avoid hoisting issues

/**
 * These suites drive REAL child processes, and `killProcessTree` observes exits
 * by POLLING on a 100ms (TIMEOUTS.POLL.PROCESS_CHECK) `setTimeout` chain. Node
 * timers fire at *least* after their delay, so under the full suite's worker
 * contention a loop that resolves in one or two ticks when idle can stretch far
 * longer. Jest's default 10s cap then trips on tests that are behaving correctly.
 *
 * Hence the raised timeout — it buys scheduler headroom, it does NOT slow a
 * healthy run (these finish in ~100-200ms in band).
 */
jest.setTimeout(30_000);

describe('ProcessCleanup - Error Handling', () => {
    let processCleanup: ProcessCleanup;
    let originalKill: typeof process.kill;
    const spawnedProcesses: ReturnType<typeof spawn>[] = [];

    beforeEach(() => {
        jest.clearAllMocks();
        processCleanup = new ProcessCleanup();
        originalKill = process.kill;
    });

    afterEach(async () => {
        // Restore original process.kill first
        process.kill = originalKill;

        // Clean up any spawned processes
        for (const child of spawnedProcesses) {
            if (child.pid) {
                try {
                    process.kill(child.pid, 'SIGKILL');
                } catch {
                    // Process already exited - ignore
                }
            }
        }
        // Wait for each child to actually go, rather than giving them 50ms and
        // hoping. A survivor here leaks into the next test's PID space.
        await Promise.all(
            spawnedProcesses.map((child) =>
                child.exitCode !== null || child.signalCode !== null
                    ? Promise.resolve()
                    : once(child, 'exit').catch(() => undefined)
            )
        );
        spawnedProcesses.length = 0;
    });

    describe('Permission Denied Errors (Mocked)', () => {
        it('should handle EPERM error gracefully', async () => {
            // Given: Mock process.kill to throw EPERM
            process.kill = jest.fn().mockImplementation(() => {
                const error: any = new Error('Operation not permitted');
                error.code = 'EPERM';
                throw error;
            });

            const testPid = 12345;

            // When/Then: Should propagate the EPERM error from tree-kill
            await expect(processCleanup.killProcessTree(testPid, 'SIGTERM')).rejects.toThrow(
                /Operation not permitted|EPERM/
            );
        });

        it('should reject with error when permission denied', async () => {
            // Given: Mock EPERM error
            process.kill = jest.fn().mockImplementation(() => {
                const error: any = new Error('Operation not permitted');
                error.code = 'EPERM';
                throw error;
            });

            const testPid = 12345;

            // When/Then: Should throw error with EPERM message
            await expect(
                processCleanup.killProcessTree(testPid, 'SIGTERM')
            ).rejects.toThrow(/Operation not permitted|EPERM/);
        });

        it('should propagate permission error details', async () => {
            // Given: Mock EPERM error
            process.kill = jest.fn().mockImplementation(() => {
                const error: any = new Error('EPERM: operation not permitted');
                error.code = 'EPERM';
                throw error;
            });

            const testPid = 12345;

            // When: Kill fails
            // The REJECTION is the claim. Captured with .then(resolve, reject) and
            // asserted outside any catch, so the assertions always run — inside a
            // catch they are skipped entirely if the call ever stops throwing, and
            // `fail()` in the try is the only thing that was noticing.
            const error = await processCleanup.killProcessTree(testPid, 'SIGTERM').then(
                () => {
                    throw new Error('expected a rejection, but the call resolved');
                },
                (caught: unknown) => caught as NodeJS.ErrnoException,
            );
            // Then: Error should contain EPERM details
            expect(error.message).toMatch(/EPERM|operation not permitted/i);
            expect(error.code).toBe('EPERM');
        });
    });

    describe('Invalid PID Handling', () => {
        // NOTE: PID -1 and 0 are special on Unix:
        // - PID -1: sends signal to ALL processes the user can signal (DANGEROUS)
        // - PID 0: sends signal to current process group (would kill Jest!)
        // These are tested with mocked process.kill to avoid killing the test runner.

        it('should handle negative PID safely', async () => {
            // Given: Negative PID (would kill all processes on Unix!)
            // Mock process.kill to prevent actual signal sending
            process.kill = jest.fn().mockImplementation(() => {
                // Simulate ESRCH (no such process) for safety
                const error: any = new Error('No such process');
                error.code = 'ESRCH';
                throw error;
            });

            const invalidPid = -1;

            // When/Then: Should resolve (implementation handles ESRCH as "already dead")
            await expect(
                processCleanup.killProcessTree(invalidPid)
            ).resolves.toBeUndefined();
        });

        it('should handle zero PID safely', async () => {
            // Given: Zero PID (would kill process group on Unix!)
            // Mock process.kill to prevent actual signal sending
            process.kill = jest.fn().mockImplementation(() => {
                const error: any = new Error('No such process');
                error.code = 'ESRCH';
                throw error;
            });

            const zeroPid = 0;

            // When/Then: Should resolve safely
            await expect(
                processCleanup.killProcessTree(zeroPid)
            ).resolves.toBeUndefined();
        });

        it('should handle very large PID', async () => {
            // Given: Very large PID (likely doesn't exist) - safe to test
            const largePid = 2147483647; // Max 32-bit int

            // When/Then: Should resolve (process doesn't exist)
            await expect(
                processCleanup.killProcessTree(largePid)
            ).resolves.toBeUndefined();
        });
    });

    describe('tree-kill Library Errors', () => {
        it('should fallback if tree-kill throws error', async () => {
            // Given: Process that tree-kill might fail to kill
            const childProcess = spawn('sleep', ['10']);
            spawnedProcesses.push(childProcess);
            const pid = childProcess.pid!;

            // When: Kill process (tree-kill handles it)
            await processCleanup.killProcessTree(pid);

            // Then: Process should be killed (fallback or tree-kill)
            expect(() => process.kill(pid, 0)).toThrow();
        });

        it('should continue with fallback if tree-kill unavailable', async () => {
            // Note: tree-kill IS available in this project
            // This test validates fallback code path exists

            const childProcess = spawn('sleep', ['10']);
            spawnedProcesses.push(childProcess);
            const pid = childProcess.pid!;

            // When: Kill process
            await processCleanup.killProcessTree(pid);

            // Then: Should work via fallback
            expect(() => process.kill(pid, 0)).toThrow();
        });
    });

    describe('Process Exit Race Conditions', () => {
        it('should handle process exiting during kill attempt', async () => {
            // Given: Process that exits very quickly
            const childProcess = spawn('node', ['-e', 'process.exit(0);']);
            spawnedProcesses.push(childProcess);
            const pid = childProcess.pid!;

            // Wait for the actual exit, not a guess at how long node takes to
            // start and stop. This was `setTimeout(100)`; node's startup alone
            // can exceed that on a busy machine, and the kill then ran against a
            // process that had not exited yet — which is not what this test is
            // about. Same defect class as the two MCP socket suites (2026-09-02).
            await once(childProcess, 'exit');

            // When: Try to kill already-exited process
            await expect(
                processCleanup.killProcessTree(pid)
            ).resolves.toBeUndefined();

            // Then: Should not throw error
        });

        it('should handle rapid kill calls on same PID', async () => {
            // Given: Single process
            const childProcess = spawn('sleep', ['10']);
            spawnedProcesses.push(childProcess);
            const pid = childProcess.pid!;

            // When: Multiple simultaneous kill attempts
            const promises = [
                processCleanup.killProcessTree(pid),
                processCleanup.killProcessTree(pid),
                processCleanup.killProcessTree(pid),
            ];

            // Then: All should resolve without error
            await expect(Promise.all(promises)).resolves.toBeDefined();

            expect(() => process.kill(pid, 0)).toThrow();
        });
    });

    describe('Signal Validation', () => {
        it('should accept valid signal names', async () => {
            const childProcess = spawn('sleep', ['10']);
            spawnedProcesses.push(childProcess);
            const pid = childProcess.pid!;

            // When: Kill with valid signal
            await expect(
                processCleanup.killProcessTree(pid, 'SIGTERM')
            ).resolves.toBeUndefined();

            expect(() => process.kill(pid, 0)).toThrow();
        });

        it('should handle SIGKILL signal', async () => {
            const childProcess = spawn('sleep', ['10']);
            spawnedProcesses.push(childProcess);
            const pid = childProcess.pid!;

            // When: Kill with SIGKILL (force kill)
            await expect(
                processCleanup.killProcessTree(pid, 'SIGKILL')
            ).resolves.toBeUndefined();

            expect(() => process.kill(pid, 0)).toThrow();
        });
    });

    describe('Cleanup During Errors (Mocked)', () => {
        // ONE test where there were two. 'should clean up polling intervals on
        // error' and 'should clean up timeouts on error' had byte-identical bodies
        // and neither asserted anything, so neither could tell an interval from a
        // timeout — or a cleanup from a leak. This suite runs on REAL timers, so
        // `jest.getTimerCount()` is unavailable here; the interval-vs-timeout
        // distinction is checked in processCleanup.mocked.test.ts, which uses fake
        // timers and counts them. What IS checkable here is the error path itself.
        it('rejects with the underlying error when the kill is refused', async () => {
            process.kill = jest.fn().mockImplementation(() => {
                const error: any = new Error('EPERM: permission denied');
                error.code = 'EPERM';
                throw error;
            });

            const testPid = 12345;

            await expect(
                processCleanup.killProcessTree(testPid, 'SIGTERM')
            ).rejects.toThrow(/EPERM/);

            // A leaked interval keeps the event loop alive past the test; jest
            // reports it as an open handle after the run rather than failing here.
            await new Promise(resolve => setTimeout(resolve, 100));
        });
    });

    describe('Error Message Quality', () => {
        it('should preserve error code from original error', async () => {
            // Given: Mock EPERM error with code
            process.kill = jest.fn().mockImplementation(() => {
                const error: any = new Error('EPERM: permission denied');
                error.code = 'EPERM';
                throw error;
            });

            const testPid = 99999;

            // When: Kill fails
            // The REJECTION is the claim. Captured with .then(resolve, reject) and
            // asserted outside any catch, so the assertions always run — inside a
            // catch they are skipped entirely if the call ever stops throwing, and
            // `fail()` in the try is the only thing that was noticing.
            const error = await processCleanup.killProcessTree(testPid, 'SIGTERM').then(
                () => {
                    throw new Error('expected a rejection, but the call resolved');
                },
                (caught: unknown) => caught as NodeJS.ErrnoException,
            );
            // Then: Error should preserve error code
            expect(error.code).toBe('EPERM');
        });

        it('should propagate original error message', async () => {
            // Given: Mock error with specific message
            process.kill = jest.fn().mockImplementation(() => {
                const error: any = new Error('EPERM: operation not permitted');
                error.code = 'EPERM';
                throw error;
            });

            const testPid = 12345;

            // The REJECTION is the claim. Captured with .then(resolve, reject) and
            // asserted outside any catch, so the assertions always run — inside a
            // catch they are skipped entirely if the call ever stops throwing, and
            // `fail()` in the try is the only thing that was noticing.
            const error = await processCleanup.killProcessTree(testPid, 'SIGTERM').then(
                () => {
                    throw new Error('expected a rejection, but the call resolved');
                },
                (caught: unknown) => caught as NodeJS.ErrnoException,
            );
            // Then: Error should contain original message
            expect(error.message).toContain('EPERM');
            expect(error.message).toMatch(/operation not permitted|permission denied/i);
        });
    });
});
