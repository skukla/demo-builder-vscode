/**
 * StopDemoCommand - Lifecycle Tests
 *
 * Tests the complete stop lifecycle with ProcessCleanup integration:
 * - Stop demo with process running (kills process before disposing terminal)
 * - Stop demo with no process found (graceful handling)
 * - State update waits for process termination
 * - Frontend env state cleared on success
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

describe('StopDemoCommand - Lifecycle', () => {
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

    describe('Test 1.1: Stop Demo with Process Running', () => {
        it('should kill process tree before disposing terminal', async () => {
            // Given: Project exists with status 'running'
            // Frontend component running on port 3000
            // Process PID 12345 found via lsof

            // When: User executes stopDemo command
            await command.execute();

            // Then: ProcessCleanup.killProcessTree(12345) called with SIGTERM
            expect(mockProcessCleanup.killProcessTree).toHaveBeenCalledWith(12345, 'SIGTERM');

            // And: Terminal disposed after process killed
            expect(mockTerminal.dispose).toHaveBeenCalled();

            // Verify order: kill process first, then dispose terminal
            const killCallOrder = mockProcessCleanup.killProcessTree.mock.invocationCallOrder[0];
            const disposeCallOrder = mockTerminal.dispose.mock.invocationCallOrder[0];
            expect(killCallOrder).toBeLessThan(disposeCallOrder);
        });

        it('should update state to ready only after process confirmed dead', async () => {
            // Given: Process on port 3000
            // Capture status at save time (since project object is mutated in place)
            const saveStatuses: string[] = [];
            mockStateManager.saveProject.mockImplementation(async (project: any) => {
                saveStatuses.push(project.status);
            });

            // When: stopDemo completes
            await command.execute();

            // Then: State was saved with 'stopping' then 'ready'
            expect(saveStatuses).toContain('stopping');
            expect(saveStatuses).toContain('ready');

            // And: 'stopping' came before 'ready'
            const stoppingIndex = saveStatuses.indexOf('stopping');
            const readyIndex = saveStatuses.lastIndexOf('ready');
            expect(stoppingIndex).toBeLessThan(readyIndex);
        });
    });

    describe('Test 1.2: Stop Demo with No Process Found', () => {
        it('should gracefully handle no process found on port', async () => {
            // Given: lsof returns empty (no process)
            mockCommandExecutor.execute.mockResolvedValue({
                code: 1,
                stdout: '',
                stderr: 'No process found',
            });

            // When: stopDemo command executes
            await command.execute();

            // Then: ProcessCleanup.killProcessTree NOT called (no PID)
            expect(mockProcessCleanup.killProcessTree).not.toHaveBeenCalled();

            // And: Terminal still disposed (cleanup)
            expect(mockTerminal.dispose).toHaveBeenCalled();

            // And: State updated to ready
            expect(mockStateManager.saveProject).toHaveBeenCalledWith(
                expect.objectContaining({ status: 'ready' })
            );

            // And: No error shown to user
            expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
        });
    });

    describe('Test 1.3: Stop Demo Updates State After Process Exit', () => {
        it('should update state only after process termination completes', async () => {
            // Given: Track save order
            const saveStatuses: string[] = [];

            // Mock ProcessCleanup to resolve immediately (we test order, not timing)
            mockProcessCleanup.killProcessTree.mockResolvedValue(undefined);

            mockStateManager.saveProject.mockImplementation(async (project: any) => {
                saveStatuses.push(project.status);
            });

            // When: stopDemo command executes
            await command.execute();

            // Then: First save should be 'stopping' (before process cleanup)
            expect(saveStatuses[0]).toBe('stopping');

            // And: Second save should be 'ready' (after ProcessCleanup resolves)
            expect(saveStatuses[1]).toBe('ready');

            // And: ProcessCleanup was called between the two saves
            expect(mockProcessCleanup.killProcessTree).toHaveBeenCalled();
        });
    });

    describe('Test 1.4: Stop Demo Clears Frontend Env State', () => {
        it('should clear frontend env state on successful stop', async () => {
            // Given: Project has frontendEnvState set
            mockStateManager.getCurrentProject.mockResolvedValue({
                name: 'test-project',
                path: '/test/path',
                status: 'running',
                created: new Date(),
                lastModified: new Date(),
                frontendEnvState: { envVars: { TEST: 'value' }, capturedAt: new Date().toISOString() },
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

            // When: stopDemo completes successfully
            await command.execute();

            // Then: project.frontendEnvState is undefined
            expect(mockStateManager.saveProject).toHaveBeenCalledWith(
                expect.objectContaining({
                    frontendEnvState: undefined,
                })
            );

            // And: Internal command 'demoBuilder._internal.demoStopped' executed
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                'demoBuilder._internal.demoStopped'
            );
        });
    });
});
