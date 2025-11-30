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
        executeCommand: jest.fn(),
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
        // Create mock extension context
        mockContext = {
            extensionPath: '/mock/extension/path',
            extensionUri: {
                fsPath: '/mock/extension/path',
                path: '/mock/extension/path',
            },
            subscriptions: [],
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
                options: {};
                html: string;
                onDidReceiveMessage: jest.Mock;
                postMessage: jest.Mock;
                asWebviewUri: jest.Mock;
            };
            onDidDispose: jest.Mock;
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
                options: {};
                html: string;
                onDidReceiveMessage: jest.Mock;
                postMessage: jest.Mock;
                asWebviewUri: jest.Mock;
            };
            onDidDispose: jest.Mock;
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
    });

    describe('sendMessage', () => {
        let mockWebviewView: {
            webview: {
                options: {};
                html: string;
                onDidReceiveMessage: jest.Mock;
                postMessage: jest.Mock;
                asWebviewUri: jest.Mock;
            };
            onDidDispose: jest.Mock;
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
                options: {};
                html: string;
                onDidReceiveMessage: jest.Mock;
                postMessage: jest.Mock;
                asWebviewUri: jest.Mock;
            };
            onDidDispose: jest.Mock;
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
                visible: true,
            };

            provider.resolveWebviewView(
                mockWebviewView as unknown as vscode.WebviewView,
                {} as vscode.WebviewViewResolveContext,
                { isCancellationRequested: false } as vscode.CancellationToken
            );
        });

        it('should send context update to webview', async () => {
            const context = { type: 'wizard' as const, step: 2, total: 6 };

            await provider.updateContext(context);

            expect(mockWebviewView.webview.postMessage).toHaveBeenCalledWith({
                type: 'contextUpdate',
                data: { context },
            });
        });

        it('should store wizard context locally', async () => {
            const wizardContext = { type: 'wizard' as const, step: 2, total: 6 };
            await provider.updateContext(wizardContext);

            // Clear the mock to reset call history
            mockWebviewView.webview.postMessage.mockClear();

            // Now get context should return wizard
            const messageHandler = mockWebviewView.webview.onDidReceiveMessage.mock.calls[0][0];
            await messageHandler({ type: 'getContext' });

            expect(mockWebviewView.webview.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'contextResponse',
                    data: expect.objectContaining({
                        context: { type: 'wizard', step: 2, total: 6 },
                    }),
                })
            );
        });
    });
});
