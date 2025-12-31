/**
 * StartDemoCommand - Lifecycle Tests
 *
 * Tests the complete start lifecycle with startup verification:
 * - Start demo waits for port to be in use before setting status to 'running'
 * - Graceful timeout if demo doesn't start within 30 seconds
 * - Early exit if demo already running
 * - Handles no project gracefully
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

describe('StartDemoCommand - Lifecycle', () => {
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

        // Setup mock CommandExecutor
        mockCommandExecutor.isPortAvailable.mockResolvedValue(true);
        mockCommandExecutor.execute.mockResolvedValue({
            code: 0,
            stdout: '',
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

        // Mock state manager with valid project
        mockStateManager = {
            getCurrentProject: jest.fn().mockResolvedValue({
                name: 'test-project',
                path: '/test/path',
                status: 'ready',
                created: new Date(),
                lastModified: new Date(),
                componentInstances: {
                    'headless': {
                        id: 'headless',
                        name: 'CitiSignal Frontend',
                        type: 'frontend',
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

    describe('Test 1.1: Start Demo Waits for Port', () => {
        it('should set status to running only after port is in use', async () => {
            // Given: Project exists with status 'ready'
            // Port 3000 is available initially, then becomes in use after polling
            let portCheckCount = 0;
            mockCommandExecutor.isPortAvailable.mockImplementation(async () => {
                portCheckCount++;
                // First 2 calls: port available (demo starting)
                // 3rd call: port in use (demo started)
                return portCheckCount < 3;
            });

            // Track status changes
            const statusChanges: string[] = [];
            mockStateManager.saveProject.mockImplementation(async (project: any) => {
                statusChanges.push(project.status);
            });

            // When: User executes startDemo command
            const executePromise = command.execute();

            // Advance timers to allow port polling
            await jest.advanceTimersByTimeAsync(3000);
            await executePromise;

            // Then: Status was set to 'starting' first
            expect(statusChanges).toContain('starting');

            // And: Status was set to 'running' after port detected in use
            expect(statusChanges).toContain('running');

            // And: waitForPortInUse was called (multiple isPortAvailable calls)
            expect(portCheckCount).toBeGreaterThanOrEqual(2);
        });
    });

    describe('Test 1.2: Start Demo Timeout on Slow Startup', () => {
        it('should show warning after startup timeout if demo does not start', async () => {
            // Given: Port never becomes in use (demo fails to start)
            mockCommandExecutor.isPortAvailable.mockResolvedValue(true); // Always available = never started

            // When: startDemo command waits for port
            const executePromise = command.execute();

            // Advance timers past the 30 second timeout
            await jest.advanceTimersByTimeAsync(35000);
            await executePromise;

            // Then: Warning shown to user after timeout
            expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
                expect.stringContaining('timed out'),
                expect.anything()
            );

            // And: No crash or hang (command completed)
            // If we get here without timeout, test passes
        });
    });

    describe('Test 1.3: Start Demo Already Running', () => {
        it('should show info message and exit early if demo already running', async () => {
            // Given: Project status is 'running'
            mockStateManager.getCurrentProject.mockResolvedValue({
                name: 'test-project',
                path: '/test/path',
                status: 'running',
                created: new Date(),
                lastModified: new Date(),
                componentInstances: {
                    'headless': {
                        id: 'headless',
                        name: 'CitiSignal Frontend',
                        type: 'frontend',
                        status: 'running',
                        path: '/test/path/frontend',
                        port: 3000,
                    },
                },
            });

            // When: startDemo called
            await command.execute();

            // Then: Shows info message "Demo is already running"
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                expect.stringContaining('already running'),
                expect.anything()
            );

            // And: No terminal created
            expect(vscode.window.createTerminal).not.toHaveBeenCalled();

            // And: No state changes (saveProject not called)
            expect(mockStateManager.saveProject).not.toHaveBeenCalled();
        });
    });

    describe('Test 1.4: Start Demo No Project', () => {
        it('should show warning with option to create project when no project exists', async () => {
            // Given: No project in state
            mockStateManager.getCurrentProject.mockResolvedValue(undefined);

            // Mock showInformationMessage to return 'Cancel' (user doesn't create project)
            (vscode.window as any).showInformationMessage = jest.fn().mockResolvedValue('Cancel');

            // When: startDemo called
            await command.execute();

            // Then: Shows warning message
            expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
                expect.stringContaining('No project'),
                expect.anything()
            );

            // And: Shows option to create project
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                expect.stringContaining('No Demo Builder project'),
                'Create Project',
                'Cancel'
            );

            // And: No errors thrown (test completes without exception)
        });

        it('should execute createProject command when user chooses to create', async () => {
            // Given: No project in state
            mockStateManager.getCurrentProject.mockResolvedValue(undefined);

            // Mock showInformationMessage to return 'Create Project'
            (vscode.window as any).showInformationMessage = jest.fn().mockResolvedValue('Create Project');

            // When: startDemo called and user chooses 'Create Project'
            await command.execute();

            // Then: createProject command executed
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith('demoBuilder.createProject');
        });
    });
});
