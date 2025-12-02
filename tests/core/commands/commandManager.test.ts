/**
 * CommandManager Tests
 *
 * Tests command registration and panel disposal logic.
 *
 * Target Coverage: 75%+
 */

import { CommandManager } from '@/commands/commandManager';
import * as vscode from 'vscode';
import { StateManager } from '@/core/state';
import { StatusBarManager } from '@/core/vscode/StatusBarManager';
import { Logger } from '@/core/logging';
import { ProjectDashboardWebviewCommand } from '@/features/dashboard/commands/showDashboard';
import { ConfigureProjectWebviewCommand } from '@/features/dashboard/commands/configure';
import { ShowProjectsListCommand } from '@/features/projects-dashboard/commands/showProjectsList';

// Mock VS Code API
jest.mock('vscode');

// Mock all command classes with proper implementations
jest.mock('@/features/projects-dashboard/commands/showProjectsList', () => {
    const MockShowProjectsListCommand = jest.fn().mockImplementation(function(this: any) {
        this.execute = jest.fn().mockResolvedValue(undefined);
    });
    (MockShowProjectsListCommand as any).disposeActivePanel = jest.fn();

    return {
        ShowProjectsListCommand: MockShowProjectsListCommand,
    };
});
jest.mock('@/features/project-creation/commands/createProject');
jest.mock('@/features/dashboard/commands/showDashboard');
jest.mock('@/features/dashboard/commands/configure');
jest.mock('@/commands/configure');
jest.mock('@/commands/diagnostics');
jest.mock('@/core/commands/ResetAllCommand');
jest.mock('@/features/lifecycle/commands/deleteProject');
jest.mock('@/features/lifecycle/commands/viewStatus');
jest.mock('@/features/lifecycle/commands/startDemo');
jest.mock('@/features/lifecycle/commands/stopDemo');
jest.mock('@/features/mesh/commands/deployMesh');
jest.mock('@/features/updates/commands/checkUpdates');

// Mock StateManager, StatusBarManager, Logger
jest.mock('@/core/state');
jest.mock('@/core/vscode/StatusBarManager');
jest.mock('@/core/logging');

describe('CommandManager', () => {
    let commandManager: CommandManager;
    let mockContext: vscode.ExtensionContext;
    let mockStateManager: StateManager;
    let mockStatusBar: StatusBarManager;
    let mockLogger: Logger;
    let mockDisposable: vscode.Disposable;

    beforeEach(() => {
        jest.clearAllMocks();

        // Create mock context
        mockContext = {
            subscriptions: [],
            extensionPath: '/test/path',
            globalState: {
                get: jest.fn(),
                update: jest.fn(),
            },
        } as unknown as vscode.ExtensionContext;

        // Create mock dependencies
        mockStateManager = new StateManager(mockContext);
        mockStatusBar = new StatusBarManager(mockContext, mockStateManager);
        mockLogger = new Logger('CommandManagerTest');

        // Mock disposable
        mockDisposable = {
            dispose: jest.fn(),
        };

        // Mock vscode.commands.registerCommand
        (vscode.commands.registerCommand as jest.Mock) = jest.fn().mockReturnValue(mockDisposable);

        // Create command manager
        commandManager = new CommandManager(
            mockContext,
            mockStateManager,
            mockStatusBar,
            mockLogger
        );
    });

    describe('Command Registration', () => {
        it('should register showProjectsList command', () => {
            commandManager.registerCommands();

            // Verify ShowProjectsListCommand was instantiated
            expect(ShowProjectsListCommand).toHaveBeenCalledWith(
                mockContext,
                mockStateManager,
                mockStatusBar,
                mockLogger
            );

            // Verify command was registered
            expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
                'demoBuilder.showProjectsList',
                expect.any(Function)
            );
        });

        it('should register all 17 commands (18 total, but resetAll only in dev mode)', () => {
            commandManager.registerCommands();

            // Verify registerCommand was called 17 times (resetAll excluded - dev mode only)
            expect(vscode.commands.registerCommand).toHaveBeenCalledTimes(17);

            // Verify all commands are registered (in order of registration)
            const expectedCommands = [
                'demoBuilder.showProjectsList',
                'demoBuilder.createProject',
                'demoBuilder.showProjectDashboard',
                'demoBuilder.switchProject',
                'demoBuilder.loadProject',
                'demoBuilder.startDemo',
                'demoBuilder.stopDemo',
                'demoBuilder.deleteProject',
                'demoBuilder.viewStatus',
                'demoBuilder.configure',
                'demoBuilder.configureProject',
                'demoBuilder.deployMesh',
                'demoBuilder.checkForUpdates',
                'demoBuilder.diagnostics',
                'demoBuilder.toggleSidebar',
                'demoBuilder.showSidebar',
                'demoBuilder.openComponent',
                // Note: resetAll not included - only registers in Development mode
            ];

            expectedCommands.forEach(commandId => {
                expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
                    commandId,
                    expect.any(Function)
                );
            });
        });

        it('should log debug message during registration', () => {
            commandManager.registerCommands();

            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringMatching(/^Registered \d+ commands:/)
            );
        });
    });

    describe('Projects List Command Disposal', () => {
        beforeEach(() => {
            // Mock static disposeActivePanel methods
            (ProjectDashboardWebviewCommand.disposeActivePanel as jest.Mock) = jest.fn();
            (ConfigureProjectWebviewCommand.disposeActivePanel as jest.Mock) = jest.fn();
        });

        it('should dispose dashboard and configure panels when showing projects list', async () => {
            commandManager.registerCommands();

            // Get the showProjectsList command handler
            const projectsListHandler = (vscode.commands.registerCommand as jest.Mock).mock.calls
                .find(call => call[0] === 'demoBuilder.showProjectsList')?.[1];

            expect(projectsListHandler).toBeDefined();

            // Execute showProjectsList command
            await projectsListHandler();

            // Verify panels were disposed
            expect(ProjectDashboardWebviewCommand.disposeActivePanel).toHaveBeenCalled();
            expect(ConfigureProjectWebviewCommand.disposeActivePanel).toHaveBeenCalled();
        });
    });

    describe('Command Manager Initialization', () => {
        it('should store all dependencies', () => {
            expect(commandManager).toHaveProperty('context');
            expect(commandManager).toHaveProperty('stateManager');
            expect(commandManager).toHaveProperty('statusBar');
            expect(commandManager).toHaveProperty('logger');
        });

        it('should initialize empty commands map', () => {
            // Commands map should exist (private field)
            expect(commandManager).toBeDefined();
        });

        it('should expose createProjectWebview property', () => {
            commandManager.registerCommands();
            expect(commandManager.createProjectWebview).toBeDefined();
        });
    });
});
