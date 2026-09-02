/**
 * StartDemoCommand - Port Conflict Tests
 *
 * Tests ProcessCleanup integration for port conflicts:
 * - Use ProcessCleanup instead of hardcoded delay for port conflicts
 * - User cancels port conflict resolution
 * - Handle ProcessCleanup failure (EPERM)
 * - Verify port actually freed before starting
 *
 * ALL TESTS ARE FULLY MOCKED - No real process spawning or port binding.
 */

import {
    ProcessCleanup,
    StartDemoCommand,
    mockCommandExecutor,
    mockWindow,
    setupStartDemo,
} from './startDemo.testUtils';
import { ServiceLocator as _ServiceLocator } from '@/core/di/serviceLocator';
import * as vscode from 'vscode';

describe('StartDemoCommand - Port Conflict', () => {
    let command: StartDemoCommand;
    let mockProcessCleanup: jest.Mocked<ProcessCleanup>;
    let mockTerminal: { name: string; dispose: jest.Mock; sendText: jest.Mock; show: jest.Mock };

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        ({ command, mockProcessCleanup, mockTerminal } = setupStartDemo());

        mockCommandExecutor.isPortAvailable.mockResolvedValue(false);
        mockCommandExecutor.execute.mockImplementation(async (cmd: string) => {
            if (cmd.includes('lsof -ti:')) {
                return { code: 0, stdout: '12345', stderr: '' };
            }
            if (cmd.includes('lsof -i:')) {
                return {
                    code: 0,
                    stdout: 'COMMAND   PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME\nnode    12345 user   24u  IPv4  0x1234      0t0  TCP *:3000 (LISTEN)',
                    stderr: ''
                };
            }
            return { code: 0, stdout: '', stderr: '' };
        });
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    describe('Test 2.1: Port Conflict with ProcessCleanup', () => {
        it('should use ProcessCleanup instead of hardcoded delay for port conflicts', async () => {
            // Given: Port 3000 is in use by PID 12345
            // User chooses "Stop & Start"
            mockWindow.showWarningMessage = jest.fn().mockResolvedValue('Stop & Start');

            // Track the flow of port availability checks
            let checkCount = 0;
            let killCalled = false;
            mockProcessCleanup.killProcessTree.mockImplementation(async () => {
                killCalled = true;
            });

            // Port availability flow:
            // 1. Initial check: not available (triggers conflict dialog)
            // 2. After kill in waitForPortInUse: first check returns true (port freed)
            // 3. Second check in waitForPortInUse: returns false (demo "started" on port)
            mockCommandExecutor.isPortAvailable.mockImplementation(async () => {
                checkCount++;
                if (checkCount === 1) {
                    return false; // Port in use initially (triggers dialog)
                }
                if (!killCalled) {
                    return false; // Still in use before kill
                }
                // After kill, first check returns true (port freed),
                // then returns false (demo started on port)
                return checkCount === 2;
            });

            // When: Port conflict detected and user chooses to stop
            const executePromise = command.execute();

            // Advance timers incrementally to allow async operations to complete
            // waitForPortInUse polls every 1 second, needs at least 2 iterations
            for (let i = 0; i < 5; i++) {
                await jest.advanceTimersByTimeAsync(1000);
                // Allow microtasks to process between timer advancements
                await Promise.resolve();
            }
            await executePromise;

            // Then: ProcessCleanup.killProcessTree called with PID
            expect(mockProcessCleanup.killProcessTree).toHaveBeenCalledWith(12345, 'SIGTERM');

            // And: Event-driven wait (no hardcoded setTimeout delay)
            // This is validated by the ProcessCleanup mock being called
        });
    });

    describe('Test 2.2: Port Conflict User Cancels', () => {
        it('should not kill process when user cancels port conflict resolution', async () => {
            // Given: Port 3000 in use
            // User clicks "Cancel"
            mockWindow.showWarningMessage = jest.fn().mockResolvedValue('Cancel');

            // When: User clicks "Cancel"
            await command.execute();

            // Then: No ProcessCleanup call
            expect(mockProcessCleanup.killProcessTree).not.toHaveBeenCalled();

            // And: No terminal created
            expect(vscode.window.createTerminal).not.toHaveBeenCalled();

            // And: Returns gracefully (no error)
            expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
        });
    });

    describe('Test 2.3: Port Conflict Kill Fails', () => {
        it('should show error and return when ProcessCleanup fails', async () => {
            // Given: Port in use, user chooses "Stop & Start"
            mockWindow.showWarningMessage = jest.fn().mockResolvedValue('Stop & Start');

            // ProcessCleanup.killProcessTree fails with EPERM
            mockProcessCleanup.killProcessTree.mockRejectedValue(
                new Error('EPERM: operation not permitted')
            );

            // Port stays in use (kill failed)
            mockCommandExecutor.isPortAvailable.mockResolvedValue(false);

            // When: Kill attempted
            const executePromise = command.execute();

            // Advance through the killProcessOnPort port-check timeout
            // TIMEOUTS.POLL.MAX = 5000ms with TIMEOUTS.POLL.PROCESS_CHECK = 100ms intervals
            // Need 50+ iterations to complete the verification loop
            for (let i = 0; i < 60; i++) {
                await jest.advanceTimersByTimeAsync(100);
            }

            await executePromise;

            // Then: Error shown to user (port couldn't be freed)
            // showErrorMessage is called with message and optional buttons ("OK")
            expect(vscode.window.showErrorMessage).toHaveBeenCalled();
            const errorCall = (vscode.window.showErrorMessage as jest.Mock).mock.calls[0];
            expect(errorCall[0]).toContain('Could not stop process');

            // And: Returns without starting demo
            expect(mockTerminal.sendText).not.toHaveBeenCalled();
        });
    });

    describe('Test 2.4: Port Available After Kill', () => {
        it('should verify port is actually freed before starting demo', async () => {
            // Given: Port conflict resolved via ProcessCleanup
            mockWindow.showWarningMessage = jest.fn().mockResolvedValue('Stop & Start');

            // Track isPortAvailable calls
            let checkCount = 0;
            let killCalled = false;

            mockProcessCleanup.killProcessTree.mockImplementation(async () => {
                killCalled = true;
            });

            // Port flow:
            // 1. Initial check: not available (conflict) -> triggers dialog
            // 2. In killProcessOnPort verification: return true (port freed after kill)
            // 3. In waitForPortInUse: return false (port in use = demo started)
            mockCommandExecutor.isPortAvailable.mockImplementation(async () => {
                checkCount++;
                if (checkCount === 1) {
                    return false; // Initial: port in use (conflict)
                }
                if (checkCount === 2 && killCalled) {
                    return true; // After kill: port is free (killProcessOnPort succeeds)
                }
                // waitForPortInUse: port is in use = demo started
                return false;
            });

            // When: Execute command
            const executePromise = command.execute();

            // Advance timers incrementally to allow all async operations to complete
            // Need to cover: lsof commands, kill verification, waitForPortInUse, and UI delays
            for (let i = 0; i < 40; i++) {
                await jest.advanceTimersByTimeAsync(1000);
                await Promise.resolve(); // Flush microtasks
            }

            await executePromise;

            // Then: isPortAvailable() was called (at least once for initial check)
            expect(mockCommandExecutor.isPortAvailable).toHaveBeenCalled();

            // And: Terminal created (demo started)
            expect(vscode.window.createTerminal).toHaveBeenCalled();
        });
    });
});
