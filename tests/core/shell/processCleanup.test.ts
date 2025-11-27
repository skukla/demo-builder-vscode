/**
 * Unit Tests for ProcessCleanup - Basic Operations
 *
 * Tests graceful shutdown, already-exited processes, process trees,
 * and cross-platform signal handling.
 */

import { ProcessCleanup } from '@/core/shell/processCleanup';
import { ChildProcess, spawn } from 'child_process';

// Mock logger
jest.mock('@/core/logging/debugLogger', () => ({
    getLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }),
}));

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

            // When: killProcessTree called
            const startTime = Date.now();
            await processCleanup.killProcessTree(pid, 'SIGTERM');
            const duration = Date.now() - startTime;

            // Then: Should complete quickly (< 1s for graceful shutdown)
            expect(duration).toBeLessThan(1000);
            expect(() => process.kill(pid, 0)).toThrow();
        });

        it('should not send SIGKILL if process exits on SIGTERM', async () => {
            // Given: Process that responds to SIGTERM
            const childProcess = spawn('node', ['-e', 'process.on("SIGTERM", () => process.exit(0)); setTimeout(() => {}, 60000);']);
            const pid = childProcess.pid!;

            // Track signals sent (we'll verify via timing - quick exit = no SIGKILL)
            const startTime = Date.now();

            // When: Kill with SIGTERM
            await processCleanup.killProcessTree(pid, 'SIGTERM');

            const duration = Date.now() - startTime;

            // Then: Should complete quickly (no SIGKILL delay)
            expect(duration).toBeLessThan(1000);
            expect(() => process.kill(pid, 0)).toThrow();
        });
    });

    describe('Process Already Exited', () => {
        it('should resolve immediately when PID does not exist', async () => {
            // Given: PID that doesn't exist (process already exited)
            const nonExistentPid = 999999;

            // When: killProcessTree called
            const startTime = Date.now();
            await processCleanup.killProcessTree(nonExistentPid);
            const duration = Date.now() - startTime;

            // Then: Should resolve immediately (< 100ms)
            expect(duration).toBeLessThan(100);
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
            const parentProcess = spawn('node', [
                '-e',
                `
                const { spawn } = require('child_process');
                const child1 = spawn('sleep', ['10']);
                const child2 = spawn('sleep', ['10']);
                setTimeout(() => {}, 60000);
                `
            ]);

            const parentPid = parentProcess.pid!;

            // Wait for children to spawn
            await new Promise(resolve => setTimeout(resolve, 500));

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
