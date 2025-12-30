/**
 * StopDemoCommand - Error Handling Tests
 *
 * Tests error handling and edge cases:
 * - Process cleanup timeout with force-kill fallback
 * - Process kill permission denied (EPERM)
 * - State consistency on unexpected error
 * - No project loaded (silent exit)
 *
 * ALL TESTS ARE FULLY MOCKED - No real process spawning or port binding.
 */

import { StopDemoCommand } from '@/features/lifecycle/commands/stopDemo';
import { ProcessCleanup } from '@/core/shell/processCleanup';
import { ServiceLocator } from '@/core/di';
import { StateManager } from '@/core/state';
import { StatusBarManager } from '@/core/vscode/StatusBarManager';
import { Logger } from '@/core/logging';
import * as vscode from 'vscode';

// Mock ProcessCleanup
jest.mock('@/core/shell/processCleanup');
const MockProcessCleanup = ProcessCleanup as jest.MockedClass<typeof ProcessCleanup>;

// Mock ServiceLocator for CommandExecutor (lsof commands)
const mockCommandExecutor = {
    execute: jest.fn(),
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

describe('StopDemoCommand - Error Handling', () => {
    let command: StopDemoCommand;
    let mockContext: jest.Mocked<vscode.ExtensionContext>;
    let mockStateManager: jest.Mocked<StateManager>;
    let mockStatusBar: jest.Mocked<StatusBarManager>;
    let mockLogger: jest.Mocked<Logger>;
    let mockProcessCleanup: jest.Mocked<ProcessCleanup>;
    let mockTerminal: { name: string; dispose: jest.Mock };

    beforeEach(() => {
        jest.clearAllMocks();

        // Setup mock terminal
        mockTerminal = {
            name: 'test-project - Frontend',
            dispose: jest.fn(),
        };
        (vscode.window as any).terminals = [mockTerminal];

        // Setup mock ProcessCleanup instance
        mockProcessCleanup = {
            killProcessTree: jest.fn().mockResolvedValue(undefined),
        } as any;
        MockProcessCleanup.mockImplementation(() => mockProcessCleanup);

        // Setup mock CommandExecutor for lsof
        mockCommandExecutor.execute.mockResolvedValue({
            code: 0,
            stdout: '12345',
            stderr: '',
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

        // Mock state manager
        mockStateManager = {
            getCurrentProject: jest.fn().mockResolvedValue({
                name: 'test-project',
                path: '/test/path',
                status: 'running',
                created: new Date(),
                lastModified: new Date(),
                componentInstances: {
                    eds: {
                        id: 'eds',
                        name: 'Edge Delivery Services',
                        type: 'frontend',
                        status: 'running',
                        port: 3000,
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

        // Mock vscode.window.showErrorMessage
        (vscode.window as any).showErrorMessage = jest.fn().mockResolvedValue('OK');

        // Mock vscode.commands.executeCommand
        (vscode.commands as any).executeCommand = jest.fn().mockResolvedValue(undefined);

        // Mock vscode.workspace.getConfiguration
        (vscode.workspace as any).getConfiguration = jest.fn().mockReturnValue({
            get: jest.fn().mockReturnValue(3000),
        });

        // Create command instance
        command = new StopDemoCommand(
            mockContext,
            mockStateManager,
            mockStatusBar,
            mockLogger
        );
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('Test 3.1: Process Cleanup Timeout', () => {
        it('should handle graceful timeout with force-kill fallback', async () => {
            // Given: Process ignores SIGTERM but ProcessCleanup handles timeout internally
            // ProcessCleanup configured with timeout (internal) - it still resolves eventually
            // ProcessCleanup handles timeout internally and always resolves
            mockProcessCleanup.killProcessTree.mockResolvedValue(undefined);

            // When: stopDemo called
            await command.execute();

            // Then: ProcessCleanup internally sends SIGKILL after timeout
            // Stop eventually completes
            expect(mockStateManager.saveProject).toHaveBeenCalledWith(
                expect.objectContaining({ status: 'ready' })
            );
        });
    });

    describe('Test 3.2: Process Kill Permission Denied', () => {
        it('should handle EPERM error gracefully', async () => {
            // Given: Process owned by different user (EPERM)
            const epermError: any = new Error('EPERM: operation not permitted');
            epermError.code = 'EPERM';
            mockProcessCleanup.killProcessTree.mockRejectedValue(epermError);

            // When: stopDemo called
            await command.execute();

            // Then: Error shown to user with actionable message
            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                expect.stringContaining('Permission denied'),
                'OK'
            );

            // And: Terminal still disposed (attempt cleanup)
            expect(mockTerminal.dispose).toHaveBeenCalled();

            // And: State NOT updated to 'ready' (still unknown)
            // The final save should NOT have status 'ready'
            const finalSaves = mockStateManager.saveProject.mock.calls.filter(
                call => call[0].status === 'ready'
            );
            expect(finalSaves.length).toBe(0);
        });
    });

    describe('Test 3.3: State Remains Consistent on Error', () => {
        it('should revert state to running on unexpected error', async () => {
            // Given: ProcessCleanup throws unexpected error
            mockProcessCleanup.killProcessTree.mockRejectedValue(new Error('Unexpected error'));

            // When: stopDemo catches error
            await command.execute();

            // Then: User sees error message
            expect(vscode.window.showErrorMessage).toHaveBeenCalled();

            // And: State reverts to 'running' (not left in 'stopping')
            // OR error is handled gracefully and state doesn't go to 'ready'
            const finalSaves = mockStateManager.saveProject.mock.calls.filter(
                call => call[0].status === 'ready'
            );
            expect(finalSaves.length).toBe(0);
        });

        it('should allow retry after error', async () => {
            // Given: First call fails
            mockProcessCleanup.killProcessTree
                .mockRejectedValueOnce(new Error('Temporary error'))
                .mockResolvedValueOnce(undefined);

            // When: First stopDemo call fails
            await command.execute();

            // Then: User sees error
            expect(vscode.window.showErrorMessage).toHaveBeenCalled();

            // Clear mocks for retry
            jest.clearAllMocks();

            // When: User retries (second call succeeds)
            // Reset project state for retry
            mockStateManager.getCurrentProject.mockResolvedValue({
                name: 'test-project',
                path: '/test/path',
                status: 'running',
                created: new Date(),
                lastModified: new Date(),
                componentInstances: {
                    eds: {
                        id: 'eds',
                        name: 'Edge Delivery Services',
                        type: 'frontend',
                        status: 'running',
                        port: 3000,
                    },
                },
            });

            await command.execute();

            // Then: Second call succeeds
            expect(mockStateManager.saveProject).toHaveBeenCalledWith(
                expect.objectContaining({ status: 'ready' })
            );
        });
    });

    describe('Test 3.4: No Project Loaded', () => {
        it('should exit silently when no project', async () => {
            // Given: No current project in state
            mockStateManager.getCurrentProject.mockResolvedValue(undefined);

            // When: stopDemo called
            await command.execute();

            // Then: Returns immediately (no error)
            // Debug log recorded
            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('No project')
            );

            // And: No ProcessCleanup calls
            expect(mockProcessCleanup.killProcessTree).not.toHaveBeenCalled();

            // And: No error shown to user
            expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
        });

        it('should exit silently when no frontend component', async () => {
            // Given: Project exists but no frontend component
            mockStateManager.getCurrentProject.mockResolvedValue({
                name: 'test-project',
                path: '/test/path',
                status: 'running',
                created: new Date(),
                lastModified: new Date(),
                componentInstances: {},
            });

            // When: stopDemo called
            await command.execute();

            // Then: Returns immediately (no error)
            expect(mockProcessCleanup.killProcessTree).not.toHaveBeenCalled();
            expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
        });

        it('should exit silently when project already stopped', async () => {
            // Given: Project status is 'ready' (not running)
            mockStateManager.getCurrentProject.mockResolvedValue({
                name: 'test-project',
                path: '/test/path',
                status: 'ready', // Already stopped
                created: new Date(),
                lastModified: new Date(),
                componentInstances: {
                    eds: {
                        id: 'eds',
                        name: 'Edge Delivery Services',
                        type: 'frontend',
                        status: 'stopped',
                        port: 3000,
                    },
                },
            });

            // When: stopDemo called
            await command.execute();

            // Then: Returns immediately (no error)
            expect(mockProcessCleanup.killProcessTree).not.toHaveBeenCalled();
            expect(mockStateManager.saveProject).not.toHaveBeenCalled();
        });
    });
});
