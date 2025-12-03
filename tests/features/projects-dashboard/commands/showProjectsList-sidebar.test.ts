/**
 * ShowProjectsListCommand Sidebar Integration Tests
 *
 * Tests verifying that Projects List properly updates sidebar context during lifecycle.
 * When Projects List opens, it sets context and notifies sidebar provider.
 *
 * Test Strategy: Verify sidebar-related calls are made correctly.
 */

import * as vscode from 'vscode';
import { ShowProjectsListCommand } from '@/features/projects-dashboard/commands/showProjectsList';
import { StateManager } from '@/core/state';
import { StatusBarManager } from '@/core/vscode/StatusBarManager';
import { Logger } from '@/core/logging';

// Mock dependencies
jest.mock('@/core/logging/debugLogger');

// Track sidebar provider method calls
const mockSetShowingProjectsList = jest.fn().mockResolvedValue(undefined);
let mockIsSidebarInitializedReturn = true;

jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: {
        isSidebarInitialized: jest.fn(() => mockIsSidebarInitializedReturn),
        getSidebarProvider: jest.fn(() => ({
            setShowingProjectsList: mockSetShowingProjectsList,
        })),
    },
}));

// Import after mock setup
import { ServiceLocator } from '@/core/di/serviceLocator';

// Mock communication manager
jest.mock('@/core/communication', () => ({
    createWebviewCommunication: jest.fn().mockResolvedValue({
        on: jest.fn(),
        onStreaming: jest.fn(),
        sendMessage: jest.fn().mockResolvedValue(undefined),
        request: jest.fn().mockResolvedValue({}),
        dispose: jest.fn(),
        incrementStateVersion: jest.fn(),
        getStateVersion: jest.fn().mockReturnValue(1),
    }),
}));

// Mock loading HTML utility
jest.mock('@/core/utils/loadingHTML', () => ({
    setLoadingState: jest.fn().mockResolvedValue(undefined),
}));

// Mock panel creation
let mockPanel: any;
let mockDisposeCallback: (() => void) | undefined;

jest.mock('vscode', () => ({
    window: {
        createWebviewPanel: jest.fn(() => {
            mockPanel = {
                webview: {
                    html: '',
                    postMessage: jest.fn().mockResolvedValue(true),
                    onDidReceiveMessage: jest.fn(() => ({ dispose: jest.fn() })),
                    asWebviewUri: jest.fn((uri: any) => uri),
                    cspSource: 'vscode-webview://test',
                },
                onDidDispose: jest.fn((callback) => {
                    mockDisposeCallback = callback;
                    return { dispose: jest.fn() };
                }),
                onDidChangeViewState: jest.fn(() => ({ dispose: jest.fn() })),
                dispose: jest.fn(() => {
                    if (mockDisposeCallback) {
                        mockDisposeCallback();
                    }
                }),
                reveal: jest.fn(),
                visible: true,
            };
            return mockPanel;
        }),
        onDidChangeActiveColorTheme: jest.fn(() => ({
            dispose: jest.fn(),
        })),
        setStatusBarMessage: jest.fn(),
        withProgress: jest.fn((options, task) => task({ report: jest.fn() })),
        activeColorTheme: {
            kind: 2, // Dark theme
        },
        showErrorMessage: jest.fn().mockResolvedValue(undefined),
        showInformationMessage: jest.fn().mockResolvedValue(undefined),
        showWarningMessage: jest.fn().mockResolvedValue(undefined),
        createStatusBarItem: jest.fn(() => ({
            text: '',
            tooltip: '',
            command: '',
            show: jest.fn(),
            hide: jest.fn(),
            dispose: jest.fn(),
        })),
    },
    ViewColumn: {
        One: 1,
    },
    Uri: {
        file: (path: string) => ({ fsPath: path, path }),
    },
    ColorThemeKind: {
        Dark: 2,
        Light: 1,
    },
    commands: {
        registerCommand: jest.fn(() => ({ dispose: jest.fn() })),
        executeCommand: jest.fn().mockResolvedValue(undefined),
    },
    StatusBarAlignment: {
        Left: 1,
        Right: 2,
    },
    languages: {
        createDiagnosticCollection: jest.fn(() => ({
            set: jest.fn(),
            clear: jest.fn(),
            delete: jest.fn(),
            dispose: jest.fn(),
        })),
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

/**
 * Create mock ExtensionContext
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
        extension: {} as any,
        languageModelAccessInformation: {} as any,
    } as vscode.ExtensionContext;
}

/**
 * Create mock StateManager
 */
function createMockStateManager(): StateManager {
    return {
        getState: jest.fn(),
        setState: jest.fn(),
        clearState: jest.fn(),
        getCurrentProject: jest.fn().mockResolvedValue(undefined),
        hasProject: jest.fn().mockResolvedValue(false),
        getAllProjects: jest.fn().mockResolvedValue([]),
        loadProjectFromPath: jest.fn().mockResolvedValue(null),
    } as any;
}

/**
 * Create mock StatusBarManager
 */
function createMockStatusBar(): StatusBarManager {
    return {
        showLoading: jest.fn(),
        showSuccess: jest.fn(),
        showError: jest.fn(),
        showIdle: jest.fn(),
    } as any;
}

/**
 * Create mock Logger
 */
function createMockLogger(): Logger {
    return {
        info: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    } as any;
}

/**
 * Helper to create ShowProjectsListCommand instance
 */
function createCommand(): ShowProjectsListCommand {
    const mockContext = createMockExtensionContext();
    const mockStateManager = createMockStateManager();
    const mockStatusBar = createMockStatusBar();
    const mockLogger = createMockLogger();

    return new ShowProjectsListCommand(
        mockContext,
        mockStateManager,
        mockStatusBar,
        mockLogger
    );
}

describe('ShowProjectsListCommand - Sidebar Integration', () => {
    beforeEach(() => {
        // Clear call history
        mockSetShowingProjectsList.mockClear();
        (vscode.commands.executeCommand as jest.Mock).mockClear();
        (ServiceLocator.isSidebarInitialized as jest.Mock).mockClear();
        (ServiceLocator.getSidebarProvider as jest.Mock).mockClear();
        mockDisposeCallback = undefined;
        // Reset default mock behavior
        mockIsSidebarInitializedReturn = true;
    });

    describe('execute() - Projects List opens', () => {
        it('should call setContext for demoBuilder.showingProjectsList when Projects List opens', async () => {
            // Given: A Projects List command instance with mocked internal methods
            const command = createCommand();

            (command as any).createOrRevealPanel = jest.fn().mockResolvedValue(mockPanel);
            (command as any).initializeCommunication = jest.fn().mockResolvedValue({
                on: jest.fn(),
                sendMessage: jest.fn().mockResolvedValue(undefined),
            });
            (command as any).refreshProjectsList = jest.fn().mockResolvedValue(undefined);

            // When: execute() is called (Projects List opens)
            await command.execute();

            // Then: setContext should be called with demoBuilder.showingProjectsList = true
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                'setContext',
                'demoBuilder.showingProjectsList',
                true
            );
        });

        it('should call sidebarProvider.setShowingProjectsList when sidebar is initialized', async () => {
            // Given: A Projects List command instance with mocked internal methods
            const command = createCommand();

            (command as any).createOrRevealPanel = jest.fn().mockResolvedValue(mockPanel);
            (command as any).initializeCommunication = jest.fn().mockResolvedValue({
                on: jest.fn(),
                sendMessage: jest.fn().mockResolvedValue(undefined),
            });
            (command as any).refreshProjectsList = jest.fn().mockResolvedValue(undefined);

            // When: execute() is called (Projects List opens)
            await command.execute();

            // Then: sidebarProvider.setShowingProjectsList should be called with true
            expect(ServiceLocator.isSidebarInitialized).toHaveBeenCalled();
            expect(ServiceLocator.getSidebarProvider).toHaveBeenCalled();
            expect(mockSetShowingProjectsList).toHaveBeenCalledWith(true);
        });

        it('should create panel successfully (core functionality)', async () => {
            // Given: A Projects List command instance
            const command = createCommand();

            (command as any).createOrRevealPanel = jest.fn().mockResolvedValue(mockPanel);
            (command as any).initializeCommunication = jest.fn().mockResolvedValue({
                on: jest.fn(),
                sendMessage: jest.fn().mockResolvedValue(undefined),
            });
            (command as any).refreshProjectsList = jest.fn().mockResolvedValue(undefined);

            // When: execute() is called
            await command.execute();

            // Then: Panel should be created
            expect((command as any).createOrRevealPanel).toHaveBeenCalled();
        });

        it('should refresh projects list after panel creation', async () => {
            // Given: A Projects List command instance with mocked internal methods
            const command = createCommand();

            const callOrder: string[] = [];
            (command as any).createOrRevealPanel = jest.fn().mockImplementation(async () => {
                callOrder.push('createOrRevealPanel');
                return mockPanel;
            });
            (command as any).initializeCommunication = jest.fn().mockImplementation(async () => {
                callOrder.push('initializeCommunication');
                return {
                    on: jest.fn(),
                    sendMessage: jest.fn().mockResolvedValue(undefined),
                };
            });
            (command as any).refreshProjectsList = jest.fn().mockImplementation(async () => {
                callOrder.push('refreshProjectsList');
            });

            // When: execute() is called
            await command.execute();

            // Then: refreshProjectsList should be called after panel creation
            const panelIndex = callOrder.indexOf('createOrRevealPanel');
            const refreshIndex = callOrder.indexOf('refreshProjectsList');

            expect(panelIndex).toBeGreaterThanOrEqual(0);
            expect(refreshIndex).toBeGreaterThan(panelIndex);
        });
    });

    describe('ServiceLocator integration', () => {
        it('should check if sidebar is initialized before updating', async () => {
            // Given: A Projects List command instance
            const command = createCommand();

            (command as any).createOrRevealPanel = jest.fn().mockResolvedValue(mockPanel);
            (command as any).initializeCommunication = jest.fn().mockResolvedValue({
                on: jest.fn(),
                sendMessage: jest.fn().mockResolvedValue(undefined),
            });
            (command as any).refreshProjectsList = jest.fn().mockResolvedValue(undefined);

            // When: execute() is called
            await command.execute();

            // Then: ServiceLocator.isSidebarInitialized should be called
            expect(ServiceLocator.isSidebarInitialized).toHaveBeenCalled();
        });

        it('should not call getSidebarProvider when sidebar is not initialized', async () => {
            // Given: Sidebar is NOT initialized
            mockIsSidebarInitializedReturn = false;

            const command = createCommand();

            (command as any).createOrRevealPanel = jest.fn().mockResolvedValue(mockPanel);
            (command as any).initializeCommunication = jest.fn().mockResolvedValue({
                on: jest.fn(),
                sendMessage: jest.fn().mockResolvedValue(undefined),
            });
            (command as any).refreshProjectsList = jest.fn().mockResolvedValue(undefined);

            // When: execute() is called
            await command.execute();

            // Then: getSidebarProvider should NOT be called
            expect(ServiceLocator.getSidebarProvider).not.toHaveBeenCalled();
            expect(mockSetShowingProjectsList).not.toHaveBeenCalled();
        });
    });
});
