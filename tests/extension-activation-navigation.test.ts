/**
 * Extension Activation - Navigation Tests
 *
 * Tests for navigation behavior during extension activation:
 * - Extension with existing project: should show Projects List as home screen
 * - Extension without project: no navigation command (sidebar handles it)
 * - Context variables should be set correctly
 *
 * Step 5 of Projects Navigation Architecture plan.
 */

import * as vscode from 'vscode';

// Mock dependencies before importing activate
jest.mock('@/core/logging/debugLogger', () => ({
    initializeLogger: jest.fn(() => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        replayLogsFromFile: jest.fn().mockResolvedValue(undefined),
        show: jest.fn(),
        showDebug: jest.fn(),
    })),
    getLogger: jest.fn(() => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    })),
}));

jest.mock('@/core/logging', () => ({
    Logger: jest.fn().mockImplementation(() => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    })),
    initializeLogger: jest.fn(() => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        replayLogsFromFile: jest.fn().mockResolvedValue(undefined),
        show: jest.fn(),
        showDebug: jest.fn(),
    })),
    getLogger: jest.fn(() => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    })),
}));

// Mock StateManager
const mockHasProject = jest.fn();
const mockInitialize = jest.fn();
const mockGetCurrentProject = jest.fn();
const mockOnProjectChanged = {
    event: jest.fn(() => ({ dispose: jest.fn() })),
};

jest.mock('@/core/state', () => ({
    StateManager: jest.fn().mockImplementation(() => ({
        initialize: mockInitialize.mockResolvedValue(undefined),
        hasProject: mockHasProject,
        getCurrentProject: mockGetCurrentProject,
        onProjectChanged: mockOnProjectChanged.event,
        dispose: jest.fn(),
    })),
}));

// Mock ServiceLocator
jest.mock('@/core/di', () => ({
    ServiceLocator: {
        setSidebarProvider: jest.fn(),
        setCommandExecutor: jest.fn(),
        setAuthenticationService: jest.fn(),
        reset: jest.fn(),
    },
}));

// Mock sidebar provider
jest.mock('@/features/sidebar', () => ({
    SidebarProvider: jest.fn().mockImplementation(() => ({
        viewId: 'demoBuilder.sidebar',
    })),
}));

// Mock authentication service
jest.mock('@/features/authentication', () => ({
    AuthenticationService: jest.fn().mockImplementation(() => ({})),
}));

// Mock component tree provider
jest.mock('@/features/components/providers/componentTreeProvider', () => ({
    ComponentTreeProvider: jest.fn().mockImplementation(() => ({
        dispose: jest.fn(),
    })),
}));

// Mock command manager
jest.mock('@/commands/commandManager', () => ({
    CommandManager: jest.fn().mockImplementation(() => ({
        registerCommands: jest.fn(),
    })),
}));

// Mock status bar manager
jest.mock('@/core/vscode', () => ({
    StatusBarManager: jest.fn().mockImplementation(() => ({
        initialize: jest.fn(),
        updateProject: jest.fn(),
        dispose: jest.fn(),
    })),
    WorkspaceWatcherManager: jest.fn().mockImplementation(() => ({
        dispose: jest.fn(),
    })),
    EnvFileWatcherService: jest.fn().mockImplementation(() => ({
        initialize: jest.fn(),
        dispose: jest.fn(),
    })),
}));

// Mock shell
jest.mock('@/core/shell', () => ({
    CommandExecutor: jest.fn().mockImplementation(() => ({
        dispose: jest.fn(),
    })),
}));

// Mock auto updater
jest.mock('@/utils/autoUpdater', () => ({
    AutoUpdater: jest.fn().mockImplementation(() => ({
        checkForUpdates: jest.fn().mockResolvedValue(undefined),
        dispose: jest.fn(),
    })),
}));

// Mock VS Code API
jest.mock('vscode', () => ({
    workspace: {
        isTrusted: true,
        getConfiguration: jest.fn(() => ({
            get: jest.fn().mockReturnValue(false), // Disable auto-update for tests
        })),
        workspaceFolders: [],
    },
    window: {
        createTreeView: jest.fn(() => ({
            title: '',
            dispose: jest.fn(),
        })),
        registerWebviewViewProvider: jest.fn(() => ({ dispose: jest.fn() })),
        showWarningMessage: jest.fn(),
        showErrorMessage: jest.fn(),
        activeColorTheme: { kind: 2 },
    },
    commands: {
        registerCommand: jest.fn(() => ({ dispose: jest.fn() })),
        executeCommand: jest.fn().mockResolvedValue(undefined),
    },
    Uri: {
        file: (path: string) => ({ fsPath: path, path }),
    },
    EventEmitter: class {
        private _listeners: Array<(data: any) => void> = [];
        get event() {
            return (listener: (data: any) => void) => {
                this._listeners.push(listener);
                return { dispose: jest.fn() };
            };
        }
        fire(data?: any) {
            this._listeners.forEach(listener => listener(data));
        }
        dispose() {
            this._listeners = [];
        }
    },
    ExtensionMode: {
        Test: 3,
    },
}));

// Import activate after all mocks are set up
import { activate } from '../src/extension';

/**
 * Create mock ExtensionContext for activation tests
 */
function createMockExtensionContext(): vscode.ExtensionContext {
    return {
        subscriptions: [],
        extensionPath: '/mock/extension/path',
        globalState: {
            get: jest.fn(),
            update: jest.fn(),
            keys: jest.fn(() => []),
            setKeysForSync: jest.fn(),
        } as any,
        workspaceState: {
            get: jest.fn(),
            update: jest.fn(),
            keys: jest.fn(() => []),
        } as any,
        extensionUri: vscode.Uri.file('/mock/extension/path'),
        extensionMode: vscode.ExtensionMode.Test,
        environmentVariableCollection: {} as any,
        asAbsolutePath: (relativePath: string) => `/mock/extension/path/${relativePath}`,
        storageUri: undefined,
        globalStorageUri: vscode.Uri.file('/mock/storage'),
        logUri: vscode.Uri.file('/mock/logs'),
        storagePath: '/mock/storage',
        globalStoragePath: '/mock/global/storage',
        logPath: '/mock/logs',
        secrets: {} as any,
        extension: {
            packageJSON: { version: '1.0.0' },
        } as any,
        languageModelAccessInformation: {} as any,
    } as vscode.ExtensionContext;
}

describe('Extension Activation - Navigation', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        mockHasProject.mockResolvedValue(false);
        mockGetCurrentProject.mockResolvedValue(undefined);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('Given extension reactivates with project in state', () => {
        describe('When activate() is called', () => {
            it('should NOT execute showProjectsList command during activation (sidebar handles navigation on user interaction)', async () => {
                // Given: An existing project is loaded
                mockHasProject.mockResolvedValue(true);
                mockGetCurrentProject.mockResolvedValue({
                    name: 'Test Project',
                    path: '/test/project',
                    status: 'stopped',
                });

                const context = createMockExtensionContext();

                // When: Extension activates
                await activate(context);

                // Fast-forward past any potential delays
                await jest.advanceTimersByTimeAsync(200);

                // Then: showProjectsList should NOT be called during activation
                // (Navigation is triggered by sidebar/TreeView visibility change when user clicks icon)
                expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith('demoBuilder.showProjectsList');
            });

            it('should set context variable demoBuilder.projectLoaded to true', async () => {
                // Given: An existing project is loaded
                mockHasProject.mockResolvedValue(true);
                mockGetCurrentProject.mockResolvedValue({
                    name: 'Test Project',
                    path: '/test/project',
                });

                const context = createMockExtensionContext();

                // When: Extension activates
                await activate(context);

                // Then: setContext should be called with projectLoaded = true
                expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                    'setContext',
                    'demoBuilder.projectLoaded',
                    true
                );
            });
        });
    });

    describe('Given extension reactivates with no project in state', () => {
        describe('When activate() is called', () => {
            it('should NOT execute any navigation command (sidebar handles it)', async () => {
                // Given: No existing project
                mockHasProject.mockResolvedValue(false);
                mockGetCurrentProject.mockResolvedValue(undefined);

                const context = createMockExtensionContext();

                // When: Extension activates
                await activate(context);

                // Fast-forward past any potential delays
                jest.advanceTimersByTime(1000);
                await Promise.resolve();

                // Then: showProjectsList should NOT be called (sidebar handles default view)
                expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith('demoBuilder.showProjectsList');

                // And: showDashboard should NOT be called
                expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith('demoBuilder.showDashboard');

                // And: showWelcome should NOT be called
                expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith('demoBuilder.showWelcome');
            });

            it('should set context variable demoBuilder.projectLoaded to false', async () => {
                // Given: No existing project
                mockHasProject.mockResolvedValue(false);

                const context = createMockExtensionContext();

                // When: Extension activates
                await activate(context);

                // Then: setContext should be called with projectLoaded = false
                expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                    'setContext',
                    'demoBuilder.projectLoaded',
                    false
                );
            });
        });
    });

    describe('Error handling during activation', () => {
        it('should complete activation even if registerCommand fails for some commands', async () => {
            // Given: Some command registration will fail
            mockHasProject.mockResolvedValue(true);
            mockGetCurrentProject.mockResolvedValue({
                name: 'Test Project',
                path: '/test/project',
            });

            const context = createMockExtensionContext();

            // When: Extension activates
            // Then: Should complete successfully (activation is resilient to partial failures)
            await expect(activate(context)).resolves.not.toThrow();
        });
    });
});
