/**
 * CreateProjectWebviewCommand - Configuration Change Listener Tests
 *
 * Tests that changes to demoBuilder.blockLibraries.custom settings
 * are propagated to the webview via a message.
 *
 * Regression test for: custom block libraries removed from settings
 * not reflected in block library selection modal.
 */

import * as vscode from 'vscode';
import { CreateProjectWebviewCommand } from '@/features/project-creation/commands/createProject';
import { StateManager } from '@/core/state';
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

// Mock WebviewPanelManager to prevent singleton panel reuse between tests
jest.mock('@/core/base/webviewPanelManager', () => ({
    WebviewPanelManager: {
        getActivePanel: jest.fn(),
        registerPanel: jest.fn(),
        unregisterPanel: jest.fn(),
        getActiveCommunicationManager: jest.fn(),
        registerCommunicationManager: jest.fn(),
        unregisterCommunicationManager: jest.fn(),
        startWebviewTransition: jest.fn().mockResolvedValue(undefined),
        endWebviewTransition: jest.fn(),
        isWebviewTransitionInProgress: jest.fn().mockReturnValue(false),
        setDisposalCallback: jest.fn(),
        getDisposalCallback: jest.fn(),
        getActivePanelCount: jest.fn().mockReturnValue(0),
        disposeAllActivePanels: jest.fn(),
    },
}));

// Capture the onDidChangeConfiguration callback
let configChangeCallback: ((e: vscode.ConfigurationChangeEvent) => void) | undefined;
const mockConfigListenerDispose = jest.fn();

// Mock communication manager — define mocks inside factory to avoid @swc/jest hoisting TDZ
jest.mock('@/core/communication', () => {
    const mockComm = {
        on: jest.fn(),
        onStreaming: jest.fn(),
        sendMessage: jest.fn().mockResolvedValue(undefined),
        request: jest.fn().mockResolvedValue({}),
        dispose: jest.fn(),
        incrementStateVersion: jest.fn(),
        getStateVersion: jest.fn().mockReturnValue(1),
    };
    return {
        createWebviewCommunication: jest.fn().mockResolvedValue(mockComm),
        _mockComm: mockComm,
    };
});
const { _mockComm } = require('@/core/communication') as { _mockComm: { sendMessage: jest.Mock } };
const mockSendMessage = _mockComm.sendMessage;

// Mock loading HTML utility
jest.mock('@/core/utils/loadingHTML', () => ({
    setLoadingState: jest.fn().mockResolvedValue(undefined),
}));

// Mock panel creation
let mockPanel: Record<string, unknown>;
let mockDisposeCallback: (() => void) | undefined;

jest.mock('vscode', () => {
    // Store the configuration mock so we can update it between tests
    let customLibraries: string[] = ['https://github.com/owner/repo'];

    return {
        window: {
            createWebviewPanel: jest.fn(() => {
                mockPanel = {
                    webview: {
                        html: '',
                        postMessage: jest.fn().mockResolvedValue(true),
                        onDidReceiveMessage: jest.fn(() => ({ dispose: jest.fn() })),
                        asWebviewUri: jest.fn((uri: unknown) => uri),
                        cspSource: 'vscode-webview://test',
                    },
                    onDidDispose: jest.fn((callback: () => void) => {
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
                    active: true,
                };
                return mockPanel;
            }),
            onDidChangeActiveColorTheme: jest.fn(() => ({ dispose: jest.fn() })),
            setStatusBarMessage: jest.fn(),
            withProgress: jest.fn((_options: unknown, task: (p: { report: jest.Mock }) => unknown) =>
                task({ report: jest.fn() }),
            ),
            activeColorTheme: { kind: 2 },
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
        workspace: {
            getConfiguration: jest.fn(() => ({
                get: jest.fn((key: string, defaultValue: unknown) => {
                    if (key === 'blockLibraries.custom') return customLibraries;
                    if (key === 'blockLibraries.defaults') return ['isle5'];
                    return defaultValue;
                }),
                update: jest.fn(),
            })),
            workspaceFolders: [{ uri: { fsPath: '/mock/workspace' } }],
            onDidChangeConfiguration: jest.fn((callback: (e: vscode.ConfigurationChangeEvent) => void) => {
                configChangeCallback = callback;
                return { dispose: mockConfigListenerDispose };
            }),
        },
        commands: {
            registerCommand: jest.fn(() => ({ dispose: jest.fn() })),
            executeCommand: jest.fn().mockResolvedValue(undefined),
        },
        Uri: {
            file: jest.fn((p: string) => ({ fsPath: p, scheme: 'file' })),
            joinPath: jest.fn((_base: unknown, ...parts: string[]) => ({
                fsPath: `/mock/extension/path/${parts.join('/')}`,
                scheme: 'file',
            })),
        },
        ViewColumn: { One: 1 },
        ColorThemeKind: { Dark: 2, Light: 1 },
        ExtensionMode: { Test: 3 },
        ConfigurationTarget: { Global: 1, Workspace: 2 },
        StatusBarAlignment: { Left: 1, Right: 2 },
        languages: {
            createDiagnosticCollection: jest.fn(() => ({
                set: jest.fn(),
                clear: jest.fn(),
                delete: jest.fn(),
                dispose: jest.fn(),
            })),
        },
        EventEmitter: class {
            private _listeners: Array<(data: unknown) => void> = [];
            get event() {
                return (listener: (data: unknown) => void) => {
                    this._listeners.push(listener);
                    return { dispose: jest.fn() };
                };
            }
            fire(data?: unknown) {
                this._listeners.forEach(listener => listener(data));
            }
            dispose() {
                this._listeners = [];
            }
        },
        // Expose setter for tests to change custom libraries
        _test: {
            setCustomLibraries: (libs: string[]) => { customLibraries = libs; },
        },
    };
}, { virtual: true });

describe('CreateProjectWebviewCommand - Config Change Listener', () => {
    let command: CreateProjectWebviewCommand;
    let mockContext: vscode.ExtensionContext;
    let mockStateManager: jest.Mocked<StateManager>;
    let mockLogger: jest.Mocked<Logger>;

    beforeEach(() => {
        jest.clearAllMocks();
        configChangeCallback = undefined;

        mockContext = {
            subscriptions: [],
            extensionPath: '/mock/extension/path',
            globalState: {
                get: jest.fn(),
                update: jest.fn(),
                keys: jest.fn(() => []),
                setKeysForSync: jest.fn(),
            },
            workspaceState: {
                get: jest.fn(),
                update: jest.fn(),
                keys: jest.fn(() => []),
            },
            extensionUri: vscode.Uri.file('/mock/extension/path'),
            extensionMode: vscode.ExtensionMode.Test,
            asAbsolutePath: (relativePath: string) => `/mock/extension/path/${relativePath}`,
            secrets: {},
        } as unknown as vscode.ExtensionContext;

        mockStateManager = {
            getAllProjects: jest.fn().mockResolvedValue([]),
            getCurrentProject: jest.fn().mockResolvedValue(null),
            setState: jest.fn(),
            getState: jest.fn(),
        } as unknown as jest.Mocked<StateManager>;

        mockLogger = {
            info: jest.fn(),
            debug: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
        } as unknown as jest.Mocked<Logger>;

        command = new CreateProjectWebviewCommand(
            mockContext,
            mockStateManager,
            mockLogger,
        );
    });

    it('should register onDidChangeConfiguration listener during message handler initialization', async () => {
        // Given: The command is executed and the panel is created
        await command.execute();

        // Then: onDidChangeConfiguration should have been called to register a listener
        expect(vscode.workspace.onDidChangeConfiguration).toHaveBeenCalled();
    });

    it('should send updated custom block library defaults when settings change', async () => {
        // Given: The command is executed
        await command.execute();

        // And: We have a config change callback registered
        expect(configChangeCallback).toBeDefined();

        // When: The demoBuilder.blockLibraries.custom setting changes
        const mockEvent: vscode.ConfigurationChangeEvent = {
            affectsConfiguration: (section: string) =>
                section === 'demoBuilder.blockLibraries.custom',
        };
        configChangeCallback!(mockEvent);

        // Then: Should send a customBlockLibraryDefaultsUpdated message to webview
        expect(mockSendMessage).toHaveBeenCalledWith(
            'customBlockLibraryDefaultsUpdated',
            expect.objectContaining({
                customBlockLibraryDefaults: expect.any(Array),
            }),
        );
    });

    it('should NOT send update when unrelated settings change', async () => {
        // Given: The command is executed
        await command.execute();
        mockSendMessage.mockClear();

        // When: An unrelated setting changes
        const mockEvent: vscode.ConfigurationChangeEvent = {
            affectsConfiguration: (section: string) =>
                section === 'demoBuilder.someOtherSetting',
        };
        configChangeCallback!(mockEvent);

        // Then: Should NOT send customBlockLibraryDefaultsUpdated
        expect(mockSendMessage).not.toHaveBeenCalledWith(
            'customBlockLibraryDefaultsUpdated',
            expect.anything(),
        );
    });

    it('should also send update when blockLibraries.defaults setting changes', async () => {
        // Given: The command is executed
        await command.execute();
        mockSendMessage.mockClear();

        // When: The blockLibraries.defaults setting changes
        const mockEvent: vscode.ConfigurationChangeEvent = {
            affectsConfiguration: (section: string) =>
                section === 'demoBuilder.blockLibraries.defaults',
        };
        configChangeCallback!(mockEvent);

        // Then: Should send a blockLibraryDefaultsUpdated message
        expect(mockSendMessage).toHaveBeenCalledWith(
            'blockLibraryDefaultsUpdated',
            expect.objectContaining({
                blockLibraryDefaults: expect.any(Array),
            }),
        );
    });
});
