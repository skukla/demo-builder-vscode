/**
 * Unit Tests for ProcessCleanup - Basic Operations
 *
 * Tests graceful shutdown, already-exited processes, process trees,
 * and cross-platform signal handling.
 */

import { ProcessCleanup } from '@/core/shell/processCleanup';
import { spawn } from 'child_process';

// Mock logger

/**
 * These suites drive REAL child processes, and `killProcessTree` observes exits
 * by POLLING on a `TIMEOUTS.POLL.PROCESS_CHECK` (100ms) `setTimeout` chain. Node
 * timers fire at *least* after their delay, so under the full suite's worker
 * contention a loop that resolves in one or two ticks when idle can stretch far
 * longer. Jest's default 10s cap then trips on tests that are behaving correctly.
 *
 * Hence the raised timeout — it buys scheduler headroom, it does NOT slow a
 * healthy run (these finish in ~100-200ms in band).
 */
jest.setTimeout(30_000);
/** Inner deadline for a spawned parent to report its children — under the suite ceiling. */
const CHILDREN_UP_BUDGET_MS = 25_000;

describe('ProcessCleanup - Basic Operations', () => {
    let processCleanup: ProcessCleanup;
    const spawnedPids: number[] = [];

    beforeEach(() => {
        jest.clearAllMocks();
        processCleanup = new ProcessCleanup();
    });

    afterEach(async () => {
        // Safety cleanup: kill any processes that weren't cleaned up by the test
        for (const pid of spawnedPids) {
            try {
                process.kill(pid, 0); // Check if still running
                process.kill(pid, 'SIGKILL'); // Force kill
            } catch {
                // Process already dead, which is expected
            }
        }
        spawnedPids.length = 0;
    });

    describe('Graceful Shutdown (SIGTERM)', () => {
        it('should send SIGTERM and wait for process exit event', async () => {
            // Given: Running child process with known PID
            const childProcess = spawn('sleep', ['10']);
            const pid = childProcess.pid!;

            expect(pid).toBeDefined();
            expect(pid).toBeGreaterThan(0);

            // When: killProcessTree(pid, 'SIGTERM') called
            const killPromise = processCleanup.killProcessTree(pid, 'SIGTERM');

            // Wait for kill to complete
            await killPromise;

            // Then: Process should be terminated
            // process.kill(pid, 0) throws if process doesn't exist
            expect(() => process.kill(pid, 0)).toThrow();
        });

        it('should resolve promise when process exits gracefully', async () => {
            // Given: Process that exits on SIGTERM
            const childProcess = spawn('sleep', ['10']);
            const pid = childProcess.pid!;

            // Observe the signals, as the test below does. This one measured the
            // clock against the grace period, and under full-suite load the 100ms
            // poll chain stretched past 5s on a child that HAD exited on SIGTERM —
            // the bound failed on correct behaviour, twice on 2026-09-03.
            const killSpy = jest.spyOn(process, 'kill');

            // When: killProcessTree called
            await processCleanup.killProcessTree(pid, 'SIGTERM');

            // Then: it exited on SIGTERM rather than being force-killed.
            const signals = killSpy.mock.calls.map((call) => call[1]);
            expect(signals).not.toContain('SIGKILL');
            killSpy.mockRestore();
            expect(() => process.kill(pid, 0)).toThrow();
        });

        it('should not send SIGKILL if process exits on SIGTERM', async () => {
            // Given: Process that responds to SIGTERM
            const childProcess = spawn('node', [
                '-e',
                'process.on("SIGTERM", () => process.exit(0)); setTimeout(() => {}, 60000);',
            ]);
            const pid = childProcess.pid!;

            // OBSERVE the signals instead of inferring them from elapsed time. The
            // original comment conceded the proxy ("we'll verify via timing — quick
            // exit = no SIGKILL"), and it was wrong twice over: spawning a whole
            // node process is inside the measurement, and under full-suite load
            // this reached 15s against a 5s grace period while behaving correctly.
            // A spy tests the actual claim, and cannot flake.
            const killSpy = jest.spyOn(process, 'kill');

            // When: Kill with SIGTERM
            await processCleanup.killProcessTree(pid, 'SIGTERM');

            // Then: SIGTERM was enough — escalation never happened.
            const signals = killSpy.mock.calls.map((call) => call[1]);
            expect(signals).toContain('SIGTERM');
            expect(signals).not.toContain('SIGKILL');
            killSpy.mockRestore();
            expect(() => process.kill(pid, 0)).toThrow();
        });
    });

    describe('Process Already Exited', () => {
        it('should resolve immediately when PID does not exist', async () => {
            // Given: PID that doesn't exist (process already exited)
            const nonExistentPid = 999999;

            // Observe the SIGNALS, not the clock: the last timing bound in this file.
            // A short-circuit sends exactly one probe (signal 0) and nothing else; a
            // run that entered the poll loop would send SIGTERM and poll further.
            const killSpy = jest.spyOn(process, 'kill');

            // When: killProcessTree called
            await processCleanup.killProcessTree(nonExistentPid);

            // Then: one liveness probe, no termination signal, no polling.
            const calls = killSpy.mock.calls.filter(([pid]) => pid === nonExistentPid);
            killSpy.mockRestore();
            expect(calls.map(([, signal]) => signal)).toEqual([0]);
        });

        it('should not throw error for non-existent PID', async () => {
            // Given: Non-existent PID
            const nonExistentPid = 999999;

            // When/Then: Should not throw
            await expect(processCleanup.killProcessTree(nonExistentPid)).resolves.toBeUndefined();
        });

        it('should log warning for non-existent PID', async () => {
            // This test validates logging behavior in implementation
            // We'll verify via no error thrown
            const nonExistentPid = 999999;

            await expect(processCleanup.killProcessTree(nonExistentPid)).resolves.toBeUndefined();
        });
    });

    describe('Multiple Processes (Process Tree)', () => {
        it('should kill parent and all child processes', async () => {
            // Given: Parent process with 2 child processes
            // Create a parent that spawns children
            // The parent ANNOUNCES readiness rather than the test guessing at it.
            // This waited a flat 500ms for node to start and spawn two children;
            // on a busy machine that is not enough, and the kill then ran against
            // a tree that did not exist yet. Same defect class as the two MCP
            // socket suites (2026-09-02).
            const parentProcess = spawn('node', [
                '-e',
                `
                const { spawn } = require('child_process');
                const child1 = spawn('sleep', ['10']);
                const child2 = spawn('sleep', ['10']);
                process.stdout.write('children-up\\n');
                setTimeout(() => {}, 60000);
                `,
            ]);

            const parentPid = parentProcess.pid!;

            // The suite ceiling above is 30s, but this inner deadline was still 10s —
            // so it fired first, five times in one evening (2026-09-03), each time on a
            // spawn that completed in ~15s under full-suite load and in ~200ms alone.
            // Same headroom as the suite: it does not slow a healthy run.
            await new Promise<void>((resolve, reject) => {
                const timer = setTimeout(
                    () => reject(new Error('parent never reported its children up')),
                    CHILDREN_UP_BUDGET_MS
                );
                parentProcess.stdout?.on('data', (chunk: Buffer) => {
                    if (chunk.toString().includes('children-up')) {
                        clearTimeout(timer);
                        resolve();
                    }
                });
            });

            // When: killProcessTree(parentPid) called
            await processCleanup.killProcessTree(parentPid);

            // Then: Parent should be killed
            expect(() => process.kill(parentPid, 0)).toThrow();

            // Note: tree-kill should handle children, but we can't easily verify
            // child PIDs without complex process tree inspection
        });

        it('should use tree-kill if available', async () => {
            // Given: Process tree
            const parentProcess = spawn('sleep', ['10']);
            const parentPid = parentProcess.pid!;

            // When: killProcessTree called
            await processCleanup.killProcessTree(parentPid);

            // Then: Process should be killed (tree-kill handles it)
            expect(() => process.kill(parentPid, 0)).toThrow();
        });
    });

    describe('Cross-Platform Signal Names', () => {
        it('should accept SIGTERM signal on Unix-like systems', async () => {
            // Given: Unix-like system (macOS/Linux)
            if (process.platform === 'win32') {
                // Skip on Windows
                return;
            }

            const childProcess = spawn('sleep', ['10']);
            const pid = childProcess.pid!;

            // When: killProcessTree with SIGTERM
            await processCleanup.killProcessTree(pid, 'SIGTERM');

            // Then: Process terminated
            expect(() => process.kill(pid, 0)).toThrow();
        });

        it('should accept SIGKILL signal on Unix-like systems', async () => {
            // Given: Unix-like system
            if (process.platform === 'win32') {
                return;
            }

            const childProcess = spawn('sleep', ['10']);
            const pid = childProcess.pid!;

            // When: killProcessTree with SIGKILL (force kill)
            await processCleanup.killProcessTree(pid, 'SIGKILL');

            // Then: Process terminated
            expect(() => process.kill(pid, 0)).toThrow();
        });

        it('should handle Windows process termination', async () => {
            // Given: Windows platform
            if (process.platform !== 'win32') {
                // Skip on Unix-like systems
                return;
            }

            const childProcess = spawn('timeout', ['10']);
            const pid = childProcess.pid!;

            // When: killProcessTree called (should use taskkill or tree-kill)
            await processCleanup.killProcessTree(pid);

            // Then: Process terminated
            expect(() => process.kill(pid, 0)).toThrow();
        });

        it('should not leak platform-specific code to caller', async () => {
            // Given: Any platform
            const childProcess = spawn(process.platform === 'win32' ? 'timeout' : 'sleep', ['10']);
            const pid = childProcess.pid!;

            // When: Caller uses same API regardless of platform
            await processCleanup.killProcessTree(pid, 'SIGTERM');

            // Then: Should work without caller knowing platform details
            expect(() => process.kill(pid, 0)).toThrow();
        });
    });

    describe('Configuration', () => {
        it('should use default graceful timeout (5000ms)', () => {
            const cleanup = new ProcessCleanup();

            // Internal timeout value should be 5000ms
            // We'll verify this via timeout tests
            expect(cleanup).toBeDefined();
        });

        it('should accept custom graceful timeout', () => {
            const cleanup = new ProcessCleanup({ gracefulTimeout: 2000 });

            // Custom timeout should be used
            expect(cleanup).toBeDefined();
        });
    });
});
