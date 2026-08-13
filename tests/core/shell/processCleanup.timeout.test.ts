/**
 * Unit Tests for ProcessCleanup - Timeout Behavior
 *
 * Tests SIGTERM → SIGKILL fallback when processes don't respond
 * to graceful shutdown signals.
 */

import { ProcessCleanup } from '@/core/shell/processCleanup';
import { spawn } from 'child_process';

// Mock logger
jest.mock('@/core/logging/debugLogger', () => ({
    getLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }),
}));

/**
 * These suites drive REAL child processes: node spawn + a 5s graceful-shutdown
 * window + a 100ms poll chain. Jest's 10s default is under that on a loaded
 * machine, so a correctly-behaving test times out. Raised for headroom, not
 * slack — a healthy run finishes far below it.
 *
 * Do NOT add a per-test timeout argument (`it(..., 10000)`). A per-test value
 * OVERRIDES this one even when it is lower, which is how four 10s/15s caps
 * survived this line being raised and kept the budget at 10s regardless. The
 * whole suite then took 9.6s solo — no headroom at all — and under full-suite
 * load on 2026-08-10 it timed out while passing in isolation.
 *
 * Do NOT assert on measured wall-clock here either (`expect(duration)
 * .toBeLessThan(n)`). This suite drives REAL processes, so any upper bound on
 * elapsed time asserts machine speed, not behaviour — four such bounds lived
 * here and were the single most reliable failure in the repo whenever a second
 * jest run shared the box (measured 2026-08-13: 0 failures in 10 solo runs,
 * 5 of 6 concurrent runs failed on `duration < 2000` reading up to 12,793 ms).
 *
 * The timing CLAIMS are still covered, deterministically, with fake timers:
 *   - SIGKILL after the graceful window  → processCleanup.mocked.test.ts
 *     ('should send SIGKILL after timeout if SIGTERM ignored')
 *   - zero timeout skips the wait        → processCleanup.mocked.test.ts
 *     ('should handle zero timeout')
 *   - early return when a process exits  → processCleanup-coverage.test.ts
 *     ('should resolve immediately when process exits after initial signal')
 *   - polling detects exit               → processCleanup-coverage.test.ts
 *     ('should poll after force-kill in tree-kill path')
 *
 * What is left here is the claim only a real process can make: it actually
 * dies. "Did not hang" is enforced by the suite timeout above.
 */
jest.setTimeout(30_000);

describe('ProcessCleanup - Timeout Behavior', () => {
    const spawnedPids: number[] = [];

    beforeEach(() => {
        jest.clearAllMocks();
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

    describe('Graceful Timeout (SIGTERM → SIGKILL)', () => {
        it('should send SIGKILL after timeout when process ignores SIGTERM', async () => {
            // Given: Process that ignores SIGTERM
            const childProcess = spawn('node', [
                '-e',
                `
                // Ignore SIGTERM
                process.on('SIGTERM', () => {
                    console.log('SIGTERM received, ignoring...');
                });
                setTimeout(() => {}, 60000);
                `,
            ]);

            const pid = childProcess.pid!;
            spawnedPids.push(pid);

            // Create cleanup with short timeout (1 second)
            const cleanup = new ProcessCleanup({ gracefulTimeout: 1000 });

            // When: killProcessTree called with SIGTERM
            await cleanup.killProcessTree(pid, 'SIGTERM');

            // Then: Process should be terminated. tree-kill may kill faster than
            // the graceful window; all we assert is that the process is gone.
            expect(() => process.kill(pid, 0)).toThrow();
        });

        it('should kill process that ignores SIGTERM', async () => {
            // Given: Process that ignores SIGTERM
            const childProcess = spawn('node', [
                '-e',
                'process.on("SIGTERM", () => {}); setTimeout(() => {}, 60000);',
            ]);

            const pid = childProcess.pid!;
            spawnedPids.push(pid);

            const cleanup = new ProcessCleanup({ gracefulTimeout: 2000 });

            // When: Kill with tree-kill
            await cleanup.killProcessTree(pid, 'SIGTERM');

            // Then: Process should be dead
            expect(() => process.kill(pid, 0)).toThrow();
        });

        it('should force kill even stubborn processes', async () => {
            // Given: Process that tries to resist termination
            const childProcess = spawn('node', [
                '-e',
                `
                process.on('SIGTERM', () => {
                    console.log('Not exiting!');
                });
                process.on('exit', () => {
                    console.log('Process exiting');
                });
                setInterval(() => {}, 1000);
                `,
            ]);

            const pid = childProcess.pid!;
            spawnedPids.push(pid);
            const cleanup = new ProcessCleanup({ gracefulTimeout: 500 });

            // When: Force kill via timeout
            await cleanup.killProcessTree(pid, 'SIGTERM');

            // Then: Process must be dead (SIGKILL is not ignorable)
            expect(() => process.kill(pid, 0)).toThrow();
        });
    });

    describe('Timeout Edge Cases', () => {
        it('should handle zero timeout (immediate SIGKILL)', async () => {
            // Given: Process and zero timeout
            const childProcess = spawn('sleep', ['10']);
            const pid = childProcess.pid!;
            spawnedPids.push(pid);

            const cleanup = new ProcessCleanup({ gracefulTimeout: 0 });

            // When: Kill with zero timeout
            await cleanup.killProcessTree(pid, 'SIGTERM');

            // Then: Process is dead. That a zero timeout skips the graceful wait
            // is asserted with fake timers in processCleanup.mocked.test.ts.
            expect(() => process.kill(pid, 0)).toThrow();
        });

        it('should handle very long timeout', async () => {
            // Given: Process that exits quickly
            const childProcess = spawn('node', [
                '-e',
                'process.on("SIGTERM", () => process.exit(0)); setTimeout(() => {}, 60000);',
            ]);

            const pid = childProcess.pid!;
            spawnedPids.push(pid);

            // Long timeout shouldn't matter if process exits gracefully
            const cleanup = new ProcessCleanup({ gracefulTimeout: 30000 });

            // When: Kill with long timeout
            await cleanup.killProcessTree(pid, 'SIGTERM');

            // Then: Process is dead. The "returned early rather than waiting the
            // full 30s window" claim is enforced by the 30s suite timeout above —
            // waiting the window out would fail this test by timing out.
            expect(() => process.kill(pid, 0)).toThrow();
        });
    });

    describe('Default Timeout Behavior', () => {
        it('should kill process with default settings', async () => {
            // Given: Process that ignores SIGTERM
            const childProcess = spawn('node', [
                '-e',
                'process.on("SIGTERM", () => {}); setTimeout(() => {}, 60000);',
            ]);

            const pid = childProcess.pid!;
            spawnedPids.push(pid);
            const cleanup = new ProcessCleanup(); // Default settings

            // When: Kill with default settings
            await cleanup.killProcessTree(pid, 'SIGTERM');

            // Then: Process should be dead (tree-kill handles it efficiently)
            expect(() => process.kill(pid, 0)).toThrow();
        });
    });

    describe('Polling Interval', () => {
        it('should poll for process exit during timeout window', async () => {
            // Given: Process that exits after 200ms
            const childProcess = spawn('node', [
                '-e',
                `
                process.on('SIGTERM', () => {
                    setTimeout(() => process.exit(0), 200);
                });
                setTimeout(() => {}, 60000);
                `,
            ]);

            const pid = childProcess.pid!;
            spawnedPids.push(pid);
            const cleanup = new ProcessCleanup({ gracefulTimeout: 2000 });

            // When: Kill with polling
            await cleanup.killProcessTree(pid, 'SIGTERM');

            // Then: Process is dead. That polling detects the exit rather than
            // waiting out the graceful window is asserted with fake timers in
            // processCleanup-coverage.test.ts.
            expect(() => process.kill(pid, 0)).toThrow();
        });
    });
});
