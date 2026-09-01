/**
 * ShowProjectsListCommand Sidebar Integration Tests
 *
 * Tests verifying that Projects List properly updates sidebar context during lifecycle.
 * When Projects List opens, it sets context and notifies sidebar provider.
 *
 * Test Strategy: Verify sidebar-related calls are made correctly.
 */

import {
    ShowProjectsListCommand,
} from './showProjectsList.testUtils';
import * as vscode from 'vscode';

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
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

// Mock communication manager
jest.mock('@/core/communication/webviewCommunicationManager', () => ({
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
/**
 * The canonical `vscode.ExtensionContext` fake (ADR-016).
 *
 * This file hand-rolled its own: twenty-one members, four of them `{} as any` for
 * interfaces it never used (`environmentVariableCollection`, `secrets`,
 * `extension`, `languageModelAccessInformation`). Each of those casts was a
 * standing claim that an empty object is a `SecretStorage`, which the shared
 * builder makes without lying by supplying the methods.
 */


/**
 * Create mock Logger
 */

/**
 * The five members this suite REPLACES on the command under test.
 *
 * `createOrRevealPanel` and `initializeCommunication` are protected on
 * `BaseWebviewCommand`; `refreshProjectsList` and `refreshConfig` are private on
 * `ShowProjectsListCommand`. Stubbing them is deliberate — these tests exercise the
 * sidebar's dispose/refresh wiring, not panel creation — but it means reaching past
 * the class's own boundary, and TypeScript is right to object.
 *
 * The seam is named ONCE here instead of `as any` twenty times at the call sites.
 * `as any` would also switch off checking of everything else in each of those
 * statements; this cast says exactly what is being reached for and nothing more, so
 * a typo in one of the five names still fails the build.
 */
interface CommandInternals {
    createOrRevealPanel: jest.Mock;
    initializeCommunication: jest.Mock;
    refreshProjectsList: jest.Mock;
    refreshConfig: jest.Mock;
    communicationManager: unknown;
}

/** Reach the stubbed internals of the command under test. */
function internals(command: ShowProjectsListCommand): CommandInternals {
    return command as unknown as CommandInternals;
}

/**
 * Helper to create ShowProjectsListCommand instance
 */
function createCommand(): ShowProjectsListCommand {
    const mockContext = createMockExtensionContext();
    const mockStateManager = createMockStateManager();
    const mockLogger = createMockLogger();

    return new ShowProjectsListCommand(
        mockContext,
        mockStateManager,
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

            internals(command).createOrRevealPanel = jest.fn().mockResolvedValue(mockPanel);
            internals(command).initializeCommunication = jest.fn().mockResolvedValue({
                on: jest.fn(),
                sendMessage: jest.fn().mockResolvedValue(undefined),
            });
            internals(command).refreshProjectsList = jest.fn().mockResolvedValue(undefined);

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

            internals(command).createOrRevealPanel = jest.fn().mockResolvedValue(mockPanel);
            internals(command).initializeCommunication = jest.fn().mockResolvedValue({
                on: jest.fn(),
                sendMessage: jest.fn().mockResolvedValue(undefined),
            });
            internals(command).refreshProjectsList = jest.fn().mockResolvedValue(undefined);

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

            internals(command).createOrRevealPanel = jest.fn().mockResolvedValue(mockPanel);
            internals(command).initializeCommunication = jest.fn().mockResolvedValue({
                on: jest.fn(),
                sendMessage: jest.fn().mockResolvedValue(undefined),
            });
            internals(command).refreshProjectsList = jest.fn().mockResolvedValue(undefined);

            // When: execute() is called
            await command.execute();

            // Then: Panel should be created
            expect(internals(command).createOrRevealPanel).toHaveBeenCalled();
        });

        it('should refresh projects list when revealing existing panel', async () => {
            // Given: A Projects List command instance with EXISTING communicationManager
            // (simulates revealing an existing panel, not creating a new one)
            const command = createCommand();

            // Set communicationManager to simulate existing panel
            const mockCommunicationManager = {
                on: jest.fn(),
                sendMessage: jest.fn().mockResolvedValue(undefined),
            };
            internals(command).communicationManager = mockCommunicationManager;

            const callOrder: string[] = [];
            internals(command).createOrRevealPanel = jest.fn().mockImplementation(async () => {
                callOrder.push('createOrRevealPanel');
                return mockPanel;
            });
            internals(command).refreshProjectsList = jest.fn().mockImplementation(async () => {
                callOrder.push('refreshProjectsList');
            });
            internals(command).refreshConfig = jest.fn().mockResolvedValue(undefined);

            // When: execute() is called
            await command.execute();

            // Then: refreshProjectsList should be called after panel reveal
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

            internals(command).createOrRevealPanel = jest.fn().mockResolvedValue(mockPanel);
            internals(command).initializeCommunication = jest.fn().mockResolvedValue({
                on: jest.fn(),
                sendMessage: jest.fn().mockResolvedValue(undefined),
            });
            internals(command).refreshProjectsList = jest.fn().mockResolvedValue(undefined);

            // When: execute() is called
            await command.execute();

            // Then: ServiceLocator.isSidebarInitialized should be called
            expect(ServiceLocator.isSidebarInitialized).toHaveBeenCalled();
        });

        it('should not call getSidebarProvider when sidebar is not initialized', async () => {
            // Given: Sidebar is NOT initialized
            mockIsSidebarInitializedReturn = false;

            const command = createCommand();

            internals(command).createOrRevealPanel = jest.fn().mockResolvedValue(mockPanel);
            internals(command).initializeCommunication = jest.fn().mockResolvedValue({
                on: jest.fn(),
                sendMessage: jest.fn().mockResolvedValue(undefined),
            });
            internals(command).refreshProjectsList = jest.fn().mockResolvedValue(undefined);

            // When: execute() is called
            await command.execute();

            // Then: getSidebarProvider should NOT be called
            expect(ServiceLocator.getSidebarProvider).not.toHaveBeenCalled();
            expect(mockSetShowingProjectsList).not.toHaveBeenCalled();
        });
    });
});
