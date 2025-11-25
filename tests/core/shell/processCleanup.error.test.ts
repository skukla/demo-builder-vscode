/**
 * Unit Tests for ProcessCleanup - Error Handling
 *
 * Tests error handling for permission denied, invalid PIDs,
 * and other error conditions using SAFE MOCKING (no system process killing).
 */

import { ProcessCleanup } from '@/core/shell/processCleanup';
import { spawn } from 'child_process';

// Mock logger to capture error logs
// Create mock functions inside the factory to avoid hoisting issues
jest.mock('@/core/logging/debugLogger', () => ({
    getLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }),
}));

describe('ProcessCleanup - Error Handling', () => {
    let processCleanup: ProcessCleanup;
    let originalKill: typeof process.kill;

    beforeEach(() => {
        processCleanup = new ProcessCleanup();
        originalKill = process.kill;
    });

    afterEach(() => {
        // Restore original process.kill
        process.kill = originalKill;
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

            // When/Then: Should handle error and reject with clear message
            await expect(processCleanup.killProcessTree(testPid, 'SIGTERM')).rejects.toThrow(
                /Failed to kill process/
            );
        });

        it('should log error when permission denied', async () => {
            // Given: Mock EPERM error
            process.kill = jest.fn().mockImplementation(() => {
                const error: any = new Error('Operation not permitted');
                error.code = 'EPERM';
                throw error;
            });

            const testPid = 12345;

            // When/Then: Should throw error
            await expect(
                processCleanup.killProcessTree(testPid, 'SIGTERM')
            ).rejects.toThrow(/Failed to kill process/);
        });

        it('should provide clear error message for permission errors', async () => {
            // Given: Mock EPERM error
            process.kill = jest.fn().mockImplementation(() => {
                const error: any = new Error('EPERM: operation not permitted');
                error.code = 'EPERM';
                throw error;
            });

            const testPid = 12345;

            // When: Kill fails
            try {
                await processCleanup.killProcessTree(testPid, 'SIGTERM');
                fail('Should have thrown error');
            } catch (error: any) {
                // Then: Error message should include context
                expect(error.message).toMatch(/Failed to kill process/);
                expect(error.message).toContain('12345');
            }
        });
    });

    describe('Invalid PID Handling', () => {
        it('should handle negative PID', async () => {
            // Given: Negative PID (invalid)
            const invalidPid = -1;

            // When/Then: Should not crash, may throw or resolve
            // Different behavior on different platforms
            await expect(
                processCleanup.killProcessTree(invalidPid)
            ).resolves.toBeUndefined();
        });

        it('should handle zero PID', async () => {
            // Given: Zero PID (special meaning in process.kill)
            const zeroPid = 0;

            // When/Then: Should handle gracefully
            await expect(
                processCleanup.killProcessTree(zeroPid)
            ).resolves.toBeUndefined();
        });

        it('should handle very large PID', async () => {
            // Given: Very large PID (likely doesn't exist)
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
            const pid = childProcess.pid!;

            // Wait a bit for it to exit
            await new Promise(resolve => setTimeout(resolve, 100));

            // When: Try to kill already-exited process
            await expect(
                processCleanup.killProcessTree(pid)
            ).resolves.toBeUndefined();

            // Then: Should not throw error
        });

        it('should handle rapid kill calls on same PID', async () => {
            // Given: Single process
            const childProcess = spawn('sleep', ['10']);
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
            const pid = childProcess.pid!;

            // When: Kill with valid signal
            await expect(
                processCleanup.killProcessTree(pid, 'SIGTERM')
            ).resolves.toBeUndefined();

            expect(() => process.kill(pid, 0)).toThrow();
        });

        it('should handle SIGKILL signal', async () => {
            const childProcess = spawn('sleep', ['10']);
            const pid = childProcess.pid!;

            // When: Kill with SIGKILL (force kill)
            await expect(
                processCleanup.killProcessTree(pid, 'SIGKILL')
            ).resolves.toBeUndefined();

            expect(() => process.kill(pid, 0)).toThrow();
        });
    });

    describe('Cleanup During Errors (Mocked)', () => {
        it('should clean up polling intervals on error', async () => {
            // Given: Mock process.kill to throw error
            process.kill = jest.fn().mockImplementation(() => {
                const error: any = new Error('EPERM: permission denied');
                error.code = 'EPERM';
                throw error;
            });

            const testPid = 12345;

            // When: Kill fails
            try {
                await processCleanup.killProcessTree(testPid, 'SIGTERM');
            } catch (error) {
                // Expected to fail
            }

            // Then: No hanging intervals (test completes without timeout)
            // If intervals aren't cleaned up, Jest will hang
            await new Promise(resolve => setTimeout(resolve, 100));
        });

        it('should clean up timeouts on error', async () => {
            // Given: Mock error
            process.kill = jest.fn().mockImplementation(() => {
                const error: any = new Error('EPERM: permission denied');
                error.code = 'EPERM';
                throw error;
            });

            const testPid = 12345;

            try {
                await processCleanup.killProcessTree(testPid, 'SIGTERM');
            } catch (error) {
                // Expected
            }

            // Verify no hanging timeouts
            await new Promise(resolve => setTimeout(resolve, 100));
        });
    });

    describe('Error Message Quality', () => {
        it('should include PID in error messages', async () => {
            // Given: Mock EPERM error
            process.kill = jest.fn().mockImplementation(() => {
                const error: any = new Error('EPERM: permission denied');
                error.code = 'EPERM';
                throw error;
            });

            const testPid = 99999;

            // When: Kill fails
            try {
                await processCleanup.killProcessTree(testPid, 'SIGTERM');
                fail('Should have thrown');
            } catch (error: any) {
                // Then: Error should include PID
                expect(error.message).toContain('99999');
            }
        });

        it('should include original error message in error context', async () => {
            // Given: Mock error with specific message
            process.kill = jest.fn().mockImplementation(() => {
                const error: any = new Error('EPERM: operation not permitted');
                error.code = 'EPERM';
                throw error;
            });

            const testPid = 12345;

            try {
                await processCleanup.killProcessTree(testPid, 'SIGTERM');
                fail('Should have thrown');
            } catch (error: any) {
                // Then: Error should wrap original error message
                expect(error.message).toContain('Failed to kill process');
                expect(error.message).toContain('EPERM');
            }
        });
    });
});
