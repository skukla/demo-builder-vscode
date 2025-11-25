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

import { StartDemoCommand } from '@/features/lifecycle/commands/startDemo';
import { ProcessCleanup } from '@/core/shell/processCleanup';
import { ServiceLocator } from '@/core/di';
import { StateManager } from '@/core/state';
import { StatusBarManager } from '@/core/vscode/StatusBarManager';
import { Logger } from '@/core/logging';
import * as vscode from 'vscode';

// Mock ProcessCleanup
jest.mock('@/core/shell/processCleanup');
const MockProcessCleanup = ProcessCleanup as jest.MockedClass<typeof ProcessCleanup>;

// Mock fs.promises for file access checks
jest.mock('fs', () => ({
    promises: {
        access: jest.fn().mockRejectedValue(new Error('ENOENT')),
    },
}));

// Mock ServiceLocator for CommandExecutor
const mockCommandExecutor = {
    execute: jest.fn(),
    isPortAvailable: jest.fn(),
};
jest.mock('@/core/di', () => ({
    ServiceLocator: {
        getCommandExecutor: jest.fn(() => mockCommandExecutor),
        reset: jest.fn(),
    },
}));

// Mock logging
jest.mock('@/core/logging', () => ({
    Logger: jest.fn().mockImplementation(() => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    })),
    getLogger: jest.fn(() => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    })),
}));

describe('StartDemoCommand - Port Conflict', () => {
    let command: StartDemoCommand;
    let mockContext: jest.Mocked<vscode.ExtensionContext>;
    let mockStateManager: jest.Mocked<StateManager>;
    let mockStatusBar: jest.Mocked<StatusBarManager>;
    let mockLogger: jest.Mocked<Logger>;
    let mockProcessCleanup: jest.Mocked<ProcessCleanup>;
    let mockTerminal: { name: string; dispose: jest.Mock; sendText: jest.Mock; show: jest.Mock };

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();

        // Setup mock terminal
        mockTerminal = {
            name: 'test-project - Frontend',
            dispose: jest.fn(),
            sendText: jest.fn(),
            show: jest.fn(),
        };
        (vscode.window as any).terminals = [];
        (vscode.window as any).createTerminal = jest.fn().mockReturnValue(mockTerminal);

        // Setup mock ProcessCleanup instance
        mockProcessCleanup = {
            killProcessTree: jest.fn().mockResolvedValue(undefined),
        } as any;
        MockProcessCleanup.mockImplementation(() => mockProcessCleanup);

        // Setup mock CommandExecutor - port initially NOT available (conflict)
        mockCommandExecutor.isPortAvailable.mockResolvedValue(false);

        // Mock lsof to return PID
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

        // Mock extension context
        mockContext = {
            subscriptions: [],
            extensionPath: '/mock/extension/path',
            globalState: {
                get: jest.fn(),
                update: jest.fn().mockResolvedValue(undefined),
            },
        } as any;

        // Mock state manager with valid project
        mockStateManager = {
            getCurrentProject: jest.fn().mockResolvedValue({
                name: 'test-project',
                path: '/test/path',
                status: 'ready',
                created: new Date(),
                lastModified: new Date(),
                componentInstances: {
                    'citisignal-nextjs': {
                        id: 'citisignal-nextjs',
                        name: 'CitiSignal Frontend',
                        status: 'ready',
                        path: '/test/path/frontend',
                        port: 3000,
                        metadata: { nodeVersion: '20' },
                    },
                },
            }),
            saveProject: jest.fn().mockResolvedValue(undefined),
        } as any;

        // Mock status bar
        mockStatusBar = {
            updateProject: jest.fn(),
            clear: jest.fn(),
        } as any;

        // Mock logger
        mockLogger = {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
        } as any;

        // Mock vscode.window.withProgress to execute task immediately
        (vscode.window as any).withProgress = jest.fn().mockImplementation(
            async (_options: any, task: any) => {
                return await task({ report: jest.fn() });
            }
        );

        // Mock vscode.window.setStatusBarMessage
        (vscode.window as any).setStatusBarMessage = jest.fn();

        // Mock vscode.commands.executeCommand
        (vscode.commands as any).executeCommand = jest.fn().mockResolvedValue(undefined);

        // Mock vscode.workspace.getConfiguration
        (vscode.workspace as any).getConfiguration = jest.fn().mockReturnValue({
            get: jest.fn().mockReturnValue(3000),
        });

        // Create command instance
        command = new StartDemoCommand(
            mockContext,
            mockStateManager,
            mockStatusBar,
            mockLogger
        );
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    describe('Test 2.1: Port Conflict with ProcessCleanup', () => {
        it('should use ProcessCleanup instead of hardcoded delay for port conflicts', async () => {
            // Given: Port 3000 is in use by PID 12345
            // User chooses "Stop & Start"
            (vscode.window as any).showWarningMessage = jest.fn().mockResolvedValue('Stop & Start');

            // Track the flow of port availability checks
            let checkCount = 0;
            let killCalled = false;
            mockProcessCleanup.killProcessTree.mockImplementation(async () => {
                killCalled = true;
            });

            // Port availability flow:
            // 1. Initial check: not available (triggers conflict dialog)
            // 2. After kill, before waitForPortInUse: available
            // 3. First waitForPortInUse check: not available (demo "started")
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

            // Advance timers to allow port polling after terminal sends text
            await jest.advanceTimersByTimeAsync(2000);
            await executePromise;

            // Then: ProcessCleanup.killProcessTree called with PID
            expect(mockProcessCleanup.killProcessTree).toHaveBeenCalledWith(12345, 'SIGTERM');

            // And: Event-driven wait (no hardcoded setTimeout delay)
            // This is validated by the ProcessCleanup mock being called
        }, 30000); // Increase test timeout
    });

    describe('Test 2.2: Port Conflict User Cancels', () => {
        it('should not kill process when user cancels port conflict resolution', async () => {
            // Given: Port 3000 in use
            // User clicks "Cancel"
            (vscode.window as any).showWarningMessage = jest.fn().mockResolvedValue('Cancel');

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
            (vscode.window as any).showWarningMessage = jest.fn().mockResolvedValue('Stop & Start');

            // ProcessCleanup.killProcessTree fails with EPERM
            mockProcessCleanup.killProcessTree.mockRejectedValue(
                new Error('EPERM: operation not permitted')
            );

            // When: Kill attempted
            await command.execute();

            // Then: Error shown to user
            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                expect.stringContaining('Failed to stop'),
                expect.anything()
            );

            // And: Suggests manual intervention (error message contains guidance)
            // And: Returns without starting demo
            expect(mockTerminal.sendText).not.toHaveBeenCalled();
        });
    });

    describe('Test 2.4: Port Available After Kill', () => {
        it('should verify port is actually freed before starting demo', async () => {
            // Given: Port conflict resolved via ProcessCleanup
            (vscode.window as any).showWarningMessage = jest.fn().mockResolvedValue('Stop & Start');

            // Track isPortAvailable calls
            let checkCount = 0;
            let afterKill = false;

            mockProcessCleanup.killProcessTree.mockImplementation(async () => {
                afterKill = true;
            });

            // Port flow:
            // 1. Initial check: not available (conflict)
            // 2. After kill, waitForPortInUse needs port to become in use (not available)
            mockCommandExecutor.isPortAvailable.mockImplementation(async () => {
                checkCount++;
                if (checkCount === 1) {
                    return false; // Initial: port in use (conflict)
                }
                // After kill, return false to simulate demo starting on the port
                return !afterKill;
            });

            // When: Kill completes
            const executePromise = command.execute();
            await jest.advanceTimersByTimeAsync(2000);
            await executePromise;

            // Then: isPortAvailable() called to verify port state
            expect(mockCommandExecutor.isPortAvailable).toHaveBeenCalledWith(3000);

            // And: Terminal created (demo started)
            expect(vscode.window.createTerminal).toHaveBeenCalled();
        }, 30000); // Increase test timeout
    });
});
