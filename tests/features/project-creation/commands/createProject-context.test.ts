/**
 * CreateProjectWebviewCommand Context Variables Tests
 *
 * Tests for VS Code context variable updates when wizard opens/closes.
 * Context variables enable automatic view switching via `when` clauses.
 *
 * Step 4 of Projects Navigation Architecture plan.
 */

import * as vscode from 'vscode';
import { CreateProjectWebviewCommand } from '@/features/project-creation/commands/createProject';
import { StateManager } from '@/core/state';
import { StatusBarManager } from '@/core/vscode/StatusBarManager';
import { Logger } from '@/core/logging';

// Mock dependencies
jest.mock('@/core/logging/debugLogger');
jest.mock('@/core/di', () => ({
    ServiceLocator: {
        getAuthenticationService: jest.fn(() => ({
            isAuthenticated: jest.fn(),
        })),
        getCommandExecutor: jest.fn(() => ({
            execute: jest.fn(),
        })),
        isSidebarInitialized: jest.fn(() => false),
        getSidebarProvider: jest.fn(() => ({
            updateContext: jest.fn(),
            clearWizardContext: jest.fn().mockResolvedValue(undefined),
        })),
    },
}));

jest.mock('@/features/components/handlers/componentHandler');
jest.mock('@/features/prerequisites/services/PrerequisitesManager');

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
 * Helper to create wizard command instance
 */
function createWizardCommand(): CreateProjectWebviewCommand {
    const mockContext = createMockExtensionContext();
    const mockStateManager = createMockStateManager();
    const mockStatusBar = createMockStatusBar();
    const mockLogger = createMockLogger();

    return new CreateProjectWebviewCommand(
        mockContext,
        mockStateManager,
        mockStatusBar,
        mockLogger
    );
}

describe('CreateProjectWebviewCommand - Context Variables', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockDisposeCallback = undefined;
    });

    describe('execute()', () => {
        it('should set demoBuilder.wizardActive context to true when wizard opens successfully', async () => {
            // This test verifies that when execute() succeeds (no error), setContext is called.
            // Due to the complexity of mocking all wizard dependencies, we test this
            // by verifying the code path in the implementation directly.
            // The dispose() test below proves the context variable mechanism works correctly.

            // Given: A wizard command instance with mocked internal methods to prevent errors
            const command = createWizardCommand();

            // Mock the methods that normally throw to allow execution to proceed
            (command as any).createOrRevealPanel = jest.fn().mockResolvedValue(mockPanel);
            (command as any).initializeCommunication = jest.fn().mockResolvedValue({
                on: jest.fn(),
                sendMessage: jest.fn().mockResolvedValue(undefined),
            });
            (command as any).updateSidebarWizardContext = jest.fn();

            // When: execute() is called (wizard opens)
            await command.execute();

            // Then: setContext should be called with wizardActive = true
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                'setContext',
                'demoBuilder.wizardActive',
                true
            );
        });
    });

    describe('dispose()', () => {
        it('should set demoBuilder.wizardActive context to false when wizard closes', async () => {
            // Given: A wizard command that has been executed
            const command = createWizardCommand();
            await command.execute();

            // Clear executeCommand calls from execute()
            (vscode.commands.executeCommand as jest.Mock).mockClear();

            // When: dispose() is called (wizard closes)
            command.dispose();

            // Then: setContext should be called with wizardActive = false
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                'setContext',
                'demoBuilder.wizardActive',
                false
            );
        });
    });
});
