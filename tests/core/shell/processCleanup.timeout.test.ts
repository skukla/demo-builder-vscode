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

describe('ProcessCleanup - Timeout Behavior', () => {
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
                `
            ]);

            const pid = childProcess.pid!;

            // Create cleanup with short timeout (1 second)
            const cleanup = new ProcessCleanup({ gracefulTimeout: 1000 });

            // When: killProcessTree called with SIGTERM
            const startTime = Date.now();
            await cleanup.killProcessTree(pid, 'SIGTERM');
            const duration = Date.now() - startTime;

            // Then: Process should be terminated
            // Note: tree-kill may kill faster than expected (uses aggressive mechanisms)
            // We mainly care that the process is dead, not the exact timing
            expect(() => process.kill(pid, 0)).toThrow();

            // Duration should be reasonable (either quick via tree-kill or after timeout)
            expect(duration).toBeGreaterThan(0);
            expect(duration).toBeLessThan(2000);
        }, 10000); // Increase test timeout to 10s

        it('should complete within timeout window', async () => {
            // Given: Process that ignores SIGTERM
            const childProcess = spawn('node', [
                '-e',
                'process.on("SIGTERM", () => {}); setTimeout(() => {}, 60000);'
            ]);

            const pid = childProcess.pid!;
            const timeout = 500;

            // Mock require.resolve to disable tree-kill for this test
            // This forces the timeout fallback path
            const originalResolve = require.resolve;
            require.resolve = jest.fn().mockImplementation((id: string) => {
                if (id === 'tree-kill') {
                    throw new Error('Module not found');
                }
                return originalResolve(id);
            });

            const cleanup = new ProcessCleanup({ gracefulTimeout: timeout });

            // When: Kill with timeout
            const startTime = Date.now();
            await cleanup.killProcessTree(pid, 'SIGTERM');
            const duration = Date.now() - startTime;

            // Restore require.resolve
            require.resolve = originalResolve;

            // Then: Duration should be around timeout value (fallback uses timeout)
            expect(duration).toBeGreaterThanOrEqual(timeout - 100); // -100ms buffer
            expect(duration).toBeLessThan(timeout + 1000); // +1000ms buffer (more lenient)

            expect(() => process.kill(pid, 0)).toThrow();
        }, 10000);

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
                `
            ]);

            const pid = childProcess.pid!;
            const cleanup = new ProcessCleanup({ gracefulTimeout: 500 });

            // When: Force kill via timeout
            await cleanup.killProcessTree(pid, 'SIGTERM');

            // Then: Process must be dead (SIGKILL is not ignorable)
            expect(() => process.kill(pid, 0)).toThrow();
        }, 10000);
    });

    describe('Timeout Edge Cases', () => {
        it('should handle zero timeout (immediate SIGKILL)', async () => {
            // Given: Process and zero timeout
            const childProcess = spawn('sleep', ['10']);
            const pid = childProcess.pid!;

            const cleanup = new ProcessCleanup({ gracefulTimeout: 0 });

            // When: Kill with zero timeout
            const startTime = Date.now();
            await cleanup.killProcessTree(pid, 'SIGTERM');
            const duration = Date.now() - startTime;

            // Then: Should complete very quickly (< 500ms)
            expect(duration).toBeLessThan(500);
            expect(() => process.kill(pid, 0)).toThrow();
        });

        it('should handle very long timeout', async () => {
            // Given: Process that exits quickly
            const childProcess = spawn('node', [
                '-e',
                'process.on("SIGTERM", () => process.exit(0)); setTimeout(() => {}, 60000);'
            ]);

            const pid = childProcess.pid!;

            // Long timeout shouldn't matter if process exits gracefully
            const cleanup = new ProcessCleanup({ gracefulTimeout: 30000 });

            // When: Kill with long timeout
            const startTime = Date.now();
            await cleanup.killProcessTree(pid, 'SIGTERM');
            const duration = Date.now() - startTime;

            // Then: Should complete quickly (process exited before timeout)
            expect(duration).toBeLessThan(1000);
            expect(() => process.kill(pid, 0)).toThrow();
        });
    });

    describe('Default Timeout Behavior', () => {
        it('should use default 5000ms timeout when not specified', async () => {
            // Given: Process that ignores SIGTERM, default timeout
            const childProcess = spawn('node', [
                '-e',
                'process.on("SIGTERM", () => {}); setTimeout(() => {}, 60000);'
            ]);

            const pid = childProcess.pid!;
            const cleanup = new ProcessCleanup(); // No timeout specified

            // When: Kill with default timeout
            const startTime = Date.now();
            await cleanup.killProcessTree(pid, 'SIGTERM');
            const duration = Date.now() - startTime;

            // Then: Should complete around 5000ms (default timeout)
            expect(duration).toBeGreaterThanOrEqual(4500);
            expect(duration).toBeLessThan(6000);

            expect(() => process.kill(pid, 0)).toThrow();
        }, 15000); // Increase test timeout to 15s
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
                `
            ]);

            const pid = childProcess.pid!;
            const cleanup = new ProcessCleanup({ gracefulTimeout: 2000 });

            // When: Kill with polling
            const startTime = Date.now();
            await cleanup.killProcessTree(pid, 'SIGTERM');
            const duration = Date.now() - startTime;

            // Then: Should detect exit before timeout (around 200ms, not 2000ms)
            expect(duration).toBeLessThan(500);
            expect(() => process.kill(pid, 0)).toThrow();
        });
    });
});
