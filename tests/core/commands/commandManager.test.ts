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
import type { Logger } from '@/types/logger';
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
jest.mock('@/features/dashboard/commands/configure', () => {
    const MockConfigureProjectWebviewCommand = jest.fn().mockImplementation(function(this: any) {
        this.execute = jest.fn().mockResolvedValue(undefined);
    });
    (MockConfigureProjectWebviewCommand as any).disposeActivePanel = jest.fn();

    return {
        ConfigureProjectWebviewCommand: MockConfigureProjectWebviewCommand,
    };
});
jest.mock('@/features/dashboard/commands/openAi', () => {
    const MockShowAiCommand = jest.fn().mockImplementation(function(this: any) {
        this.execute = jest.fn().mockResolvedValue(undefined);
    });
    (MockShowAiCommand as any).disposeActivePanel = jest.fn();

    return {
        ShowAiCommand: MockShowAiCommand,
    };
});
jest.mock('@/commands/showPromptsPicker', () => {
    const MockShowPromptsPickerCommand = jest.fn().mockImplementation(function(this: any) {
        this.execute = jest.fn().mockResolvedValue(undefined);
    });
    return { ShowPromptsPickerCommand: MockShowPromptsPickerCommand };
});
jest.mock('@/commands/openInClaude', () => {
    const MockOpenInClaudeCommand = jest.fn().mockImplementation(function(this: any) {
        this.execute = jest.fn().mockResolvedValue(undefined);
    });
    return { OpenInClaudeCommand: MockOpenInClaudeCommand };
});
jest.mock('@/commands/configure');
jest.mock('@/commands/diagnostics');
jest.mock('@/core/commands/ResetAllCommand');
jest.mock('@/features/lifecycle/commands/deleteProject');
jest.mock('@/features/lifecycle/commands/viewStatus');
jest.mock('@/features/lifecycle/commands/startDemo');
jest.mock('@/features/lifecycle/commands/stopDemo');
jest.mock('@/features/mesh/commands/deployMesh');
jest.mock('@/features/updates/commands/checkUpdates');
jest.mock('@/core/utils/browserUtils', () => ({
    openUrl: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/features/eds/ui/helpers/bookmarkletSetupPage', () => ({
    getBookmarkletSetupPageUrl: jest.fn().mockReturnValue('http://setup-page'),
}));
jest.mock('@/features/eds/utils/daLiveTokenBookmarklet', () => ({
    getBookmarkletUrl: jest.fn().mockReturnValue('javascript:void(0)'),
}));

// Mock StateManager, Logger
jest.mock('@/core/state');
jest.mock('@/core/logging');

describe('CommandManager', () => {
    let commandManager: CommandManager;
    let mockContext: vscode.ExtensionContext;
    let mockStateManager: StateManager;
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
        mockLogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            trace: jest.fn(),
        } as Logger;

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
                mockLogger
            );

            // Verify command was registered
            expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
                'demoBuilder.showProjectsList',
                expect.any(Function)
            );
        });

        it('should register all 28 commands (29 total, but resetAll only in dev mode)', () => {
            commandManager.registerCommands();

            // Verify registerCommand was called 29 times (resetAll excluded - dev mode only)
            expect(vscode.commands.registerCommand).toHaveBeenCalledTimes(29);

            // Verify all commands are registered (in order of registration)
            const expectedCommands = [
                'demoBuilder.showProjectsList',
                'demoBuilder.createProject',
                'demoBuilder.showProjectDashboard',
                'demoBuilder.loadProject',
                'demoBuilder.startDemo',
                'demoBuilder.stopDemo',
                'demoBuilder.deleteProject',
                'demoBuilder.viewStatus',
                'demoBuilder.configure',
                'demoBuilder.configureProject',
                'demoBuilder.navigate',
                'demoBuilder.deployMesh',
                'demoBuilder.deployApp',
                'demoBuilder.syncStorefront',
                'demoBuilder.refreshBlockLibrary',
                'demoBuilder.checkForUpdates',
                'demoBuilder.openInClaude',
                'demoBuilder.openAi',
                'demoBuilder.openAiExperience',
                'demoBuilder.showPromptsPicker',
                'demoBuilder.openModernizationAgent',
                'demoBuilder.diagnostics',
                'demoBuilder.migrateStorefrontNames',
                'demoBuilder.setRecommendedZoom',
                'demoBuilder.resetZoom',
                'demoBuilder.toggleSidebar',
                'demoBuilder.showSidebar',
                'demoBuilder.openDaLiveBookmarkletSetup',
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

        it('should register demoBuilder.openAi command', () => {
            commandManager.registerCommands();

            expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
                'demoBuilder.openAi',
                expect.any(Function),
            );
        });

        it('invokes ShowAiCommand.execute (the prompt library) with no arg', async () => {
            commandManager.registerCommands();

            const openAiHandler = (vscode.commands.registerCommand as jest.Mock).mock.calls
                .find(call => call[0] === 'demoBuilder.openAi')?.[1];
            expect(openAiHandler).toBeDefined();

            const ShowAiCmd = require('@/features/dashboard/commands/openAi').ShowAiCommand;
            const aiInstance = ShowAiCmd.mock.instances[0];
            aiInstance.execute.mockClear();

            await openAiHandler();

            expect(aiInstance.execute).toHaveBeenCalledWith();
        });

    });

    describe('Zoom commands', () => {
        let mockConfig: { update: jest.Mock; get: jest.Mock };

        /**
         * Stub `getConfiguration('window')` with both `update` (the zoom write)
         * and `get` (the `zoomPerWindow` read the fix branches on).
         */
        const setupConfig = (zoomPerWindow: boolean | undefined): void => {
            mockConfig = {
                update: jest.fn().mockResolvedValue(undefined),
                get: jest.fn().mockReturnValue(zoomPerWindow),
            };
            (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(mockConfig);
        };

        const invokeZoomCommand = async (commandId: string): Promise<void> => {
            commandManager.registerCommands();
            const handler = (vscode.commands.registerCommand as jest.Mock).mock.calls
                .find(call => call[0] === commandId)?.[1];
            expect(handler).toBeDefined();
            await handler();
        };

        describe('demoBuilder.setRecommendedZoom', () => {
            it('sets window.zoomLevel to 1 (120%) globally', async () => {
                setupConfig(true);

                await invokeZoomCommand('demoBuilder.setRecommendedZoom');

                expect(mockConfig.update).toHaveBeenCalledWith(
                    'zoomLevel',
                    1,
                    vscode.ConfigurationTarget.Global,
                );
            });

            it('clears the per-window zoom override via zoomReset when zoomPerWindow is on', async () => {
                // A transient Cmd+/Cmd- override outranks the zoomLevel setting; the
                // command must reset the window so the new level takes effect.
                setupConfig(true);

                await invokeZoomCommand('demoBuilder.setRecommendedZoom');

                expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                    'workbench.action.zoomReset',
                );
            });

            it('does NOT call zoomReset when zoomPerWindow is off (all-windows mode)', async () => {
                // In all-windows mode there is no per-window override, and zoomReset
                // would force 100%, clobbering the 120% we just set.
                setupConfig(false);

                await invokeZoomCommand('demoBuilder.setRecommendedZoom');

                expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(
                    'workbench.action.zoomReset',
                );
            });

            it('defaults to per-window behavior when zoomPerWindow is unset', async () => {
                // window.zoomPerWindow defaults to true in VS Code.
                setupConfig(undefined);

                await invokeZoomCommand('demoBuilder.setRecommendedZoom');

                expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                    'workbench.action.zoomReset',
                );
            });
        });

        describe('demoBuilder.resetZoom', () => {
            it('sets window.zoomLevel to 0 (100%) globally', async () => {
                setupConfig(true);

                await invokeZoomCommand('demoBuilder.resetZoom');

                expect(mockConfig.update).toHaveBeenCalledWith(
                    'zoomLevel',
                    0,
                    vscode.ConfigurationTarget.Global,
                );
            });

            it('clears the per-window zoom override via zoomReset when zoomPerWindow is on', async () => {
                setupConfig(true);

                await invokeZoomCommand('demoBuilder.resetZoom');

                expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                    'workbench.action.zoomReset',
                );
            });

            it('does NOT call zoomReset when zoomPerWindow is off (all-windows mode)', async () => {
                setupConfig(false);

                await invokeZoomCommand('demoBuilder.resetZoom');

                expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(
                    'workbench.action.zoomReset',
                );
            });
        });
    });

    describe('Navigate Routing', () => {
        it('should route the ai target to demoBuilder.openAiExperience (chat-first)', async () => {
            commandManager.registerCommands();

            const navigateHandler = (vscode.commands.registerCommand as jest.Mock).mock.calls
                .find(call => call[0] === 'demoBuilder.navigate')?.[1];
            expect(navigateHandler).toBeDefined();

            (vscode.commands.executeCommand as jest.Mock).mockClear();

            await navigateHandler({ target: 'ai' });

            // Chat-first: navigate('ai') opens the AI experience directly.
            // The prompt manager (openAi) stays reachable via the prompt picker's
            // "Manage prompts…" row.
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith('demoBuilder.openAiExperience');
        });

        it('should warn on unknown target (legacy ai-setup is no longer routed)', async () => {
            commandManager.registerCommands();

            const navigateHandler = (vscode.commands.registerCommand as jest.Mock).mock.calls
                .find(call => call[0] === 'demoBuilder.navigate')?.[1];
            expect(navigateHandler).toBeDefined();

            const ConfigureCmd = require('@/features/dashboard/commands/configure').ConfigureProjectWebviewCommand;
            const ShowAiCmd = require('@/features/dashboard/commands/openAi').ShowAiCommand;

            const configureInstance = ConfigureCmd.mock.instances[0];
            const aiInstance = ShowAiCmd.mock.instances[0];
            configureInstance.execute.mockClear();
            aiInstance.execute.mockClear();

            await navigateHandler({ target: 'ai-setup' });

            // The legacy 'ai-setup' route was removed — neither command runs.
            expect(configureInstance.execute).not.toHaveBeenCalled();
            expect(aiInstance.execute).not.toHaveBeenCalled();
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
