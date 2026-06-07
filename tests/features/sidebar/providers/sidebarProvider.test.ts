/**
 * Tests for SidebarProvider
 *
 * Tests the WebviewViewProvider implementation for the sidebar.
 */

import * as vscode from 'vscode';
import { SidebarProvider } from '@/features/sidebar/providers/sidebarProvider';

// Mock VS Code module
jest.mock('vscode', () => ({
    Uri: {
        file: jest.fn((path: string) => ({
            fsPath: path,
            path,
            toString: () => path,
        })),
        joinPath: jest.fn((base: { path: string }, ...paths: string[]) => ({
            fsPath: [base.path, ...paths].join('/'),
            path: [base.path, ...paths].join('/'),
            toString: () => [base.path, ...paths].join('/'),
        })),
    },
    window: {
        registerWebviewViewProvider: jest.fn(),
    },
    commands: {
        executeCommand: jest.fn().mockResolvedValue(undefined),
    },
    workspace: {
        getConfiguration: jest.fn().mockReturnValue({
            get: jest.fn().mockReturnValue(true),
        }),
    },
    ColorThemeKind: {
        Light: 1,
        Dark: 2,
        HighContrast: 3,
    },
}));

describe('SidebarProvider', () => {
    let provider: SidebarProvider;
    let mockContext: vscode.ExtensionContext;
    let mockStateManager: {
        getCurrentProject: jest.Mock;
    };
    let mockLogger: {
        info: jest.Mock;
        warn: jest.Mock;
        error: jest.Mock;
        debug: jest.Mock;
    };

    beforeEach(() => {
        // Create mock extension context. globalState backs the persistent
        // update-check throttle (`lastUpdateCheck`); a no-op store is
        // enough for tests that don't exercise the throttle.
        const globalStateStore: Record<string, unknown> = {};
        mockContext = {
            extensionPath: '/mock/extension/path',
            extensionUri: {
                fsPath: '/mock/extension/path',
                path: '/mock/extension/path',
            },
            subscriptions: [],
            globalState: {
                get: jest.fn((key: string, defaultValue?: unknown) =>
                    key in globalStateStore ? globalStateStore[key] : defaultValue,
                ),
                update: jest.fn(async (key: string, value: unknown) => {
                    globalStateStore[key] = value;
                }),
            },
        } as unknown as vscode.ExtensionContext;

        // Create mock state manager
        mockStateManager = {
            getCurrentProject: jest.fn().mockResolvedValue(undefined),
        };

        // Create mock logger
        mockLogger = {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
        };

        provider = new SidebarProvider(
            mockContext,
            mockStateManager as any,
            mockLogger as any
        );
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('constructor', () => {
        it('should create provider with required dependencies', () => {
            expect(provider).toBeDefined();
            expect(provider.viewId).toBe('demoBuilder.sidebar');
        });
    });

    describe('resolveWebviewView', () => {
        let mockWebviewView: {
            webview: {
                options: Record<string, unknown>;
                html: string;
                onDidReceiveMessage: jest.Mock;
                postMessage: jest.Mock;
                asWebviewUri: jest.Mock;
            };
            onDidDispose: jest.Mock;
            onDidChangeVisibility: jest.Mock;
            visible: boolean;
        };

        beforeEach(() => {
            mockWebviewView = {
                webview: {
                    options: {},
                    html: '',
                    onDidReceiveMessage: jest.fn(() => ({ dispose: jest.fn() })),
                    postMessage: jest.fn(),
                    asWebviewUri: jest.fn((uri) => uri),
                },
                onDidDispose: jest.fn(() => ({ dispose: jest.fn() })),
                onDidChangeVisibility: jest.fn(() => ({ dispose: jest.fn() })),
                visible: true,
            };
        });

        it('should set webview options correctly', () => {
            provider.resolveWebviewView(
                mockWebviewView as unknown as vscode.WebviewView,
                {} as vscode.WebviewViewResolveContext,
                { isCancellationRequested: false } as vscode.CancellationToken
            );

            expect(mockWebviewView.webview.options).toEqual({
                enableScripts: true,
                localResourceRoots: expect.any(Array),
            });
        });

        it('should set webview HTML content', () => {
            provider.resolveWebviewView(
                mockWebviewView as unknown as vscode.WebviewView,
                {} as vscode.WebviewViewResolveContext,
                { isCancellationRequested: false } as vscode.CancellationToken
            );

            expect(mockWebviewView.webview.html).toContain('<!DOCTYPE html>');
            expect(mockWebviewView.webview.html).toContain('sidebar-bundle.js');
        });

        it('should register message handler', () => {
            provider.resolveWebviewView(
                mockWebviewView as unknown as vscode.WebviewView,
                {} as vscode.WebviewViewResolveContext,
                { isCancellationRequested: false } as vscode.CancellationToken
            );

            expect(mockWebviewView.webview.onDidReceiveMessage).toHaveBeenCalled();
        });

        it('should register dispose handler', () => {
            provider.resolveWebviewView(
                mockWebviewView as unknown as vscode.WebviewView,
                {} as vscode.WebviewViewResolveContext,
                { isCancellationRequested: false } as vscode.CancellationToken
            );

            expect(mockWebviewView.onDidDispose).toHaveBeenCalled();
        });
    });

    describe('message handling', () => {
        let mockWebviewView: {
            webview: {
                options: Record<string, unknown>;
                html: string;
                onDidReceiveMessage: jest.Mock;
                postMessage: jest.Mock;
                asWebviewUri: jest.Mock;
            };
            onDidDispose: jest.Mock;
            onDidChangeVisibility: jest.Mock;
            visible: boolean;
        };
        let messageHandler: (message: unknown) => void;

        beforeEach(() => {
            mockWebviewView = {
                webview: {
                    options: {},
                    html: '',
                    onDidReceiveMessage: jest.fn((handler) => {
                        messageHandler = handler;
                        return { dispose: jest.fn() };
                    }),
                    postMessage: jest.fn(),
                    asWebviewUri: jest.fn((uri) => uri),
                },
                onDidDispose: jest.fn(() => ({ dispose: jest.fn() })),
                onDidChangeVisibility: jest.fn(() => ({ dispose: jest.fn() })),
                visible: true,
            };

            provider.resolveWebviewView(
                mockWebviewView as unknown as vscode.WebviewView,
                {} as vscode.WebviewViewResolveContext,
                { isCancellationRequested: false } as vscode.CancellationToken
            );
        });

        it('should handle getContext message with no project', async () => {
            mockStateManager.getCurrentProject.mockResolvedValue(undefined);

            await messageHandler({ type: 'getContext' });

            expect(mockWebviewView.webview.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'contextResponse',
                    data: expect.objectContaining({
                        context: { type: 'projects' },
                    }),
                })
            );
        });

        it('should handle getContext with current project', async () => {
            const mockProject = { name: 'Test Project', path: '/test' };
            mockStateManager.getCurrentProject.mockResolvedValue(mockProject);

            await messageHandler({ type: 'getContext' });

            expect(mockWebviewView.webview.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'contextResponse',
                    data: expect.objectContaining({
                        context: { type: 'project', project: mockProject },
                    }),
                })
            );
        });

        it('should handle navigate message', async () => {
            await messageHandler({ type: 'navigate', payload: { target: 'projects' } });

            // Navigation is logged
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('navigate')
            );
        });

        it('routes openAiChat to demoBuilder.openAiExperience', async () => {
            await messageHandler({ type: 'openAiChat' });

            expect(vscode.commands.executeCommand).toHaveBeenCalledWith('demoBuilder.openAiExperience');
        });

        it('routes showPrompts to demoBuilder.showPromptsPicker', async () => {
            await messageHandler({ type: 'showPrompts' });

            expect(vscode.commands.executeCommand).toHaveBeenCalledWith('demoBuilder.showPromptsPicker');
        });
    });

    describe('sendMessage', () => {
        let mockWebviewView: {
            webview: {
                options: Record<string, unknown>;
                html: string;
                onDidReceiveMessage: jest.Mock;
                postMessage: jest.Mock;
                asWebviewUri: jest.Mock;
            };
            onDidDispose: jest.Mock;
            onDidChangeVisibility: jest.Mock;
            visible: boolean;
        };

        beforeEach(() => {
            mockWebviewView = {
                webview: {
                    options: {},
                    html: '',
                    onDidReceiveMessage: jest.fn(() => ({ dispose: jest.fn() })),
                    postMessage: jest.fn(),
                    asWebviewUri: jest.fn((uri) => uri),
                },
                onDidDispose: jest.fn(() => ({ dispose: jest.fn() })),
                onDidChangeVisibility: jest.fn(() => ({ dispose: jest.fn() })),
                visible: true,
            };

            provider.resolveWebviewView(
                mockWebviewView as unknown as vscode.WebviewView,
                {} as vscode.WebviewViewResolveContext,
                { isCancellationRequested: false } as vscode.CancellationToken
            );
        });

        it('should send message to webview', async () => {
            await provider.sendMessage('testType', { foo: 'bar' });

            expect(mockWebviewView.webview.postMessage).toHaveBeenCalledWith({
                type: 'testType',
                data: { foo: 'bar' },
            });
        });

        it('should not throw when webview is not available', async () => {
            // Create provider without resolving view
            const newProvider = new SidebarProvider(
                mockContext,
                mockStateManager as any,
                mockLogger as any
            );

            // Should not throw
            await expect(
                newProvider.sendMessage('testType', { foo: 'bar' })
            ).resolves.not.toThrow();

            // Should log warning
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('not available')
            );
        });
    });

    describe('updateContext', () => {
        let mockWebviewView: {
            webview: {
                options: Record<string, unknown>;
                html: string;
                onDidReceiveMessage: jest.Mock;
                postMessage: jest.Mock;
                asWebviewUri: jest.Mock;
            };
            onDidDispose: jest.Mock;
            onDidChangeVisibility: jest.Mock;
            visible: boolean;
        };

        beforeEach(() => {
            mockWebviewView = {
                webview: {
                    options: {},
                    html: '',
                    onDidReceiveMessage: jest.fn(() => ({ dispose: jest.fn() })),
                    postMessage: jest.fn(),
                    asWebviewUri: jest.fn((uri) => uri),
                },
                onDidDispose: jest.fn(() => ({ dispose: jest.fn() })),
                onDidChangeVisibility: jest.fn(() => ({ dispose: jest.fn() })),
                visible: true,
            };

            provider.resolveWebviewView(
                mockWebviewView as unknown as vscode.WebviewView,
                {} as vscode.WebviewViewResolveContext,
                { isCancellationRequested: false } as vscode.CancellationToken
            );
        });

        it('should send context update to webview', async () => {
            const context = { type: 'projectsList' as const };

            await provider.updateContext(context);

            expect(mockWebviewView.webview.postMessage).toHaveBeenCalledWith({
                type: 'contextUpdate',
                data: { context },
            });
        });
    });

    // ------------------------------------------------------------------------
    // Update-check throttle
    // ------------------------------------------------------------------------
    // The sidebar fires an auto-update check on first activation. Without a
    // persistent throttle, every workspace reload re-fires it, which is the
    // "we check for updates again" symptom users see when switching projects.
    // The throttle skips the auto-check when `lastUpdateCheck` (a ms
    // timestamp in globalState) is within UPDATE_CHECK_THROTTLE_MS.
    // ------------------------------------------------------------------------

    describe('update-check throttle', () => {
        const NOW = 1_700_000_000_000;
        const ONE_HOUR_MS = 60 * 60 * 1000;

        let globalStateStore: Record<string, unknown>;
        let mockWebviewView: {
            webview: {
                options: Record<string, unknown>;
                html: string;
                onDidReceiveMessage: jest.Mock;
                postMessage: jest.Mock;
                asWebviewUri: jest.Mock;
            };
            onDidDispose: jest.Mock;
            onDidChangeVisibility: jest.Mock;
            visible: boolean;
        };
        let executeCommandMock: jest.Mock;

        beforeEach(() => {
            jest.useFakeTimers();
            jest.setSystemTime(NOW);

            globalStateStore = {};
            mockContext = {
                extensionPath: '/mock/extension/path',
                extensionUri: { fsPath: '/mock/extension/path', path: '/mock/extension/path' },
                subscriptions: [],
                globalState: {
                    get: jest.fn((key: string, defaultValue?: unknown) =>
                        key in globalStateStore ? globalStateStore[key] : defaultValue,
                    ),
                    update: jest.fn(async (key: string, value: unknown) => {
                        globalStateStore[key] = value;
                    }),
                },
            } as unknown as vscode.ExtensionContext;

            provider = new SidebarProvider(
                mockContext,
                mockStateManager as any,
                mockLogger as any,
            );

            mockWebviewView = {
                webview: {
                    options: {},
                    html: '',
                    onDidReceiveMessage: jest.fn(() => ({ dispose: jest.fn() })),
                    postMessage: jest.fn(),
                    asWebviewUri: jest.fn((uri) => uri),
                },
                onDidDispose: jest.fn(() => ({ dispose: jest.fn() })),
                onDidChangeVisibility: jest.fn(() => ({ dispose: jest.fn() })),
                visible: true,
            };

            executeCommandMock = vscode.commands.executeCommand as jest.Mock;
            executeCommandMock.mockClear();
            executeCommandMock.mockResolvedValue(undefined);
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        const wasCheckCommandInvoked = (): boolean =>
            executeCommandMock.mock.calls.some(call => call[0] === 'demoBuilder.checkForUpdates');

        it('runs the update check on first activation (no prior timestamp)', () => {
            provider.resolveWebviewView(
                mockWebviewView as unknown as vscode.WebviewView,
                {} as vscode.WebviewViewResolveContext,
                { isCancellationRequested: false } as vscode.CancellationToken,
            );

            expect(wasCheckCommandInvoked()).toBe(true);
        });

        it('records the timestamp in globalState when the check runs', () => {
            provider.resolveWebviewView(
                mockWebviewView as unknown as vscode.WebviewView,
                {} as vscode.WebviewViewResolveContext,
                { isCancellationRequested: false } as vscode.CancellationToken,
            );

            const update = mockContext.globalState.update as unknown as jest.Mock;
            expect(update).toHaveBeenCalledWith('lastUpdateCheck', NOW);
        });

        it('skips the update check when the last check was within the throttle window', () => {
            globalStateStore['lastUpdateCheck'] = NOW - (30 * 60 * 1000); // 30 min ago

            provider.resolveWebviewView(
                mockWebviewView as unknown as vscode.WebviewView,
                {} as vscode.WebviewViewResolveContext,
                { isCancellationRequested: false } as vscode.CancellationToken,
            );

            expect(wasCheckCommandInvoked()).toBe(false);
        });

        it('runs the update check when the throttle window has elapsed', () => {
            globalStateStore['lastUpdateCheck'] = NOW - (ONE_HOUR_MS + 1); // just past throttle

            provider.resolveWebviewView(
                mockWebviewView as unknown as vscode.WebviewView,
                {} as vscode.WebviewViewResolveContext,
                { isCancellationRequested: false } as vscode.CancellationToken,
            );

            expect(wasCheckCommandInvoked()).toBe(true);
        });

        it('skips the check at the throttle boundary (last check exactly THROTTLE_MS ago)', () => {
            globalStateStore['lastUpdateCheck'] = NOW - ONE_HOUR_MS;

            provider.resolveWebviewView(
                mockWebviewView as unknown as vscode.WebviewView,
                {} as vscode.WebviewViewResolveContext,
                { isCancellationRequested: false } as vscode.CancellationToken,
            );

            // At exactly the boundary the check is still throttled; one
            // additional millisecond reliably crosses it.
            expect(wasCheckCommandInvoked()).toBe(false);
        });

        it('skips the check when auto-update is disabled, regardless of throttle state', () => {
            const getConfig = vscode.workspace.getConfiguration as jest.Mock;
            getConfig.mockReturnValue({ get: jest.fn().mockReturnValue(false) });

            provider.resolveWebviewView(
                mockWebviewView as unknown as vscode.WebviewView,
                {} as vscode.WebviewViewResolveContext,
                { isCancellationRequested: false } as vscode.CancellationToken,
            );

            expect(wasCheckCommandInvoked()).toBe(false);
        });

        it('rolls the timestamp back when the network call rejects (no throttle on retry)', async () => {
            const previous = NOW - (2 * ONE_HOUR_MS);
            globalStateStore['lastUpdateCheck'] = previous;
            executeCommandMock.mockImplementation((cmd: string) => {
                if (cmd === 'demoBuilder.checkForUpdates') {
                    return Promise.reject(new Error('network unreachable'));
                }
                return Promise.resolve(undefined);
            });

            provider.resolveWebviewView(
                mockWebviewView as unknown as vscode.WebviewView,
                {} as vscode.WebviewViewResolveContext,
                { isCancellationRequested: false } as vscode.CancellationToken,
            );

            // Flush the rejection so the rollback runs.
            await Promise.resolve();
            await Promise.resolve();

            expect(globalStateStore['lastUpdateCheck']).toBe(previous);
        });
    });
});
