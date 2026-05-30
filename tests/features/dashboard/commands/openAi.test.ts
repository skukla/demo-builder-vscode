/**
 * ShowAiCommand Tests
 *
 * Tests for the prompt library webview command.
 * Mirrors the ConfigureProjectWebviewCommand test pattern.
 */

import * as vscode from 'vscode';
import { ShowAiCommand } from '@/features/dashboard/commands/openAi';
import { BaseWebviewCommand } from '@/core/base';
import { StateManager } from '@/core/state';
import type { Logger } from '@/types/logger';
import type { Project } from '@/types';

// Mock VS Code API
jest.mock('vscode');

// Mock dependencies
jest.mock('@/core/state');

// Mock logger
jest.mock('@/core/logging', () => ({
    getLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }),
    Logger: jest.fn().mockImplementation(() => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    })),
}));

// Mock the AI handler map so we can verify wiring
jest.mock('@/features/dashboard/handlers/aiHandlers', () => ({
    aiHandlers: {
        'verify-ai-setup': jest.fn(),
        'inspect-mcp': jest.fn(),
        'regenerate-ai-files': jest.fn(),
        'openInClaude': jest.fn(),
    },
}));

describe('ShowAiCommand', () => {
    let command: ShowAiCommand;
    let mockContext: vscode.ExtensionContext;
    let mockStateManager: jest.Mocked<StateManager>;
    let mockLogger: Logger;
    let mockPanel: vscode.WebviewPanel;
    let mockWebview: vscode.Webview;

    beforeEach(() => {
        jest.clearAllMocks();

        mockWebview = {
            asWebviewUri: jest.fn((uri: vscode.Uri) => ({
                toString: () => `vscode-webview://authority${uri.fsPath}`,
                fsPath: uri.fsPath,
            } as vscode.Uri)),
            cspSource: 'vscode-webview:',
            postMessage: jest.fn(),
            onDidReceiveMessage: jest.fn(),
        } as unknown as vscode.Webview;

        mockPanel = {
            webview: mockWebview,
            dispose: jest.fn(),
            onDidDispose: jest.fn(),
            reveal: jest.fn(),
        } as unknown as vscode.WebviewPanel;

        mockContext = {
            subscriptions: [],
            extensionPath: '/test/extension/path',
            extensionUri: vscode.Uri.file('/test/extension/path'),
            globalState: {
                get: jest.fn(),
                update: jest.fn(),
            },
        } as unknown as vscode.ExtensionContext;

        mockStateManager = {
            getCurrentProject: jest.fn().mockResolvedValue({
                name: 'Test Project',
                path: '/test/project',
            } as Project),
        } as unknown as jest.Mocked<StateManager>;

        mockLogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        } as unknown as Logger;

        command = new ShowAiCommand(
            mockContext,
            mockStateManager as unknown as StateManager,
            mockLogger,
        );

        (vscode.window.createWebviewPanel as jest.Mock) = jest.fn().mockReturnValue(mockPanel);

        (vscode.window.activeColorTheme as unknown) = {
            kind: vscode.ColorThemeKind.Dark,
        };
    });

    describe('class identity', () => {
        it('is a BaseWebviewCommand subclass', () => {
            expect(command).toBeInstanceOf(BaseWebviewCommand);
        });
    });

    describe('webview metadata', () => {
        it('getWebviewId returns demoBuilder.openAi', () => {
            expect((command as unknown as { getWebviewId(): string }).getWebviewId())
                .toBe('demoBuilder.openAi');
        });

        it('getWebviewTitle returns "Prompt Library"', () => {
            expect((command as unknown as { getWebviewTitle(): string }).getWebviewTitle())
                .toBe('Prompt Library');
        });
    });

    describe('loading state', () => {
        it('uses a "prompt library" loading message', () => {
            expect((command as unknown as { getLoadingMessage(): string }).getLoadingMessage())
                .toMatch(/prompt library/i);
        });
    });

    describe('getInitialData', () => {
        it('includes the current project', async () => {
            const data = await (command as unknown as { getInitialData(): Promise<{ project: Project }> })
                .getInitialData();

            expect(data.project).toBeDefined();
            expect(data.project.name).toBe('Test Project');
        });

        it('includes the theme', async () => {
            const data = await (command as unknown as { getInitialData(): Promise<{ theme: string }> })
                .getInitialData();

            expect(['dark', 'light']).toContain(data.theme);
        });
    });

    describe('execute', () => {
        it('warns and returns when no current project exists', async () => {
            mockStateManager.getCurrentProject = jest.fn().mockResolvedValue(null);
            const showWarningMessage = jest.fn().mockResolvedValue(undefined);
            (vscode.window.showWarningMessage as jest.Mock) = showWarningMessage;

            await command.execute();

            expect(showWarningMessage).toHaveBeenCalled();
            // createWebviewPanel must not be called when no project exists
            expect(vscode.window.createWebviewPanel).not.toHaveBeenCalled();
        });
    });

    describe('initializeMessageHandlers', () => {
        it('registers a streaming handler for every aiHandlers message type', () => {
            const onStreaming = jest.fn();
            const on = jest.fn();
            const mockComm = { onStreaming, on } as unknown as Parameters<
                (typeof command)['initializeMessageHandlers']
            >[0];

            (command as unknown as {
                initializeMessageHandlers(c: typeof mockComm): void;
            }).initializeMessageHandlers(mockComm);

            const calledTypes = onStreaming.mock.calls.map(call => call[0]);
            expect(calledTypes).toEqual(
                expect.arrayContaining([
                    'verify-ai-setup',
                    'inspect-mcp',
                    'regenerate-ai-files',
                    'openInClaude',
                ]),
            );
            expect(calledTypes).toHaveLength(4);
        });

        it('registers a cancel handler (footer Close) that disposes the panel', async () => {
            const onStreaming = jest.fn();
            const on = jest.fn();
            const mockComm = { onStreaming, on } as unknown as Parameters<
                (typeof command)['initializeMessageHandlers']
            >[0];
            (command as unknown as { panel: vscode.WebviewPanel }).panel = mockPanel;

            (command as unknown as {
                initializeMessageHandlers(c: typeof mockComm): void;
            }).initializeMessageHandlers(mockComm);

            const cancelReg = on.mock.calls.find(call => call[0] === 'cancel');
            expect(cancelReg).toBeDefined();

            await (cancelReg![1] as () => unknown)();
            expect(mockPanel.dispose).toHaveBeenCalled();
        });
    });

    describe('surface-change subscription', () => {
        it('pushes surface-changed to the webview when demoBuilder.ai.surface changes', () => {
            let capturedCallback: ((e: vscode.ConfigurationChangeEvent) => void) | null = null;
            const dispose = jest.fn();
            (vscode.workspace as unknown as { onDidChangeConfiguration: jest.Mock })
                .onDidChangeConfiguration = jest.fn((cb: (e: vscode.ConfigurationChangeEvent) => void) => {
                    capturedCallback = cb;
                    return { dispose };
                });

            const sendMessageSpy = jest
                .spyOn(command as unknown as { sendMessage: (t: string) => Promise<void> }, 'sendMessage')
                .mockResolvedValue(undefined);

            (command as unknown as { subscribeToSurfaceChanges(): void })
                .subscribeToSurfaceChanges();

            expect(capturedCallback).not.toBeNull();

            // Unrelated config change → no push
            const unrelatedEvent = {
                affectsConfiguration: (key: string) => key === 'demoBuilder.someOther',
            } as vscode.ConfigurationChangeEvent;
            capturedCallback!(unrelatedEvent);
            expect(sendMessageSpy).not.toHaveBeenCalled();

            // Surface change → push
            const surfaceEvent = {
                affectsConfiguration: (key: string) => key === 'demoBuilder.ai.surface',
            } as vscode.ConfigurationChangeEvent;
            capturedCallback!(surfaceEvent);
            expect(sendMessageSpy).toHaveBeenCalledWith('surface-changed');
        });
    });

    describe('webview content', () => {
        it('loads the aiOverview-bundle.js feature bundle', async () => {
            (command as unknown as { panel: vscode.WebviewPanel }).panel = mockPanel;

            const html = await (command as unknown as { getWebviewContent(): Promise<string> })
                .getWebviewContent();

            expect(html).toContain('aiOverview-bundle.js');
        });

        it('sets the document title to "Prompt Library"', async () => {
            (command as unknown as { panel: vscode.WebviewPanel }).panel = mockPanel;
            const html = await (command as unknown as { getWebviewContent(): Promise<string> })
                .getWebviewContent();

            expect(html).toContain('<title>Prompt Library</title>');
        });
    });
});
