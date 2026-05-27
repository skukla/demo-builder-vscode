/**
 * ShowAiCommand Tests
 *
 * Tests for the new standalone AI surface webview command.
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
        'register-global-mcp': jest.fn(),
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

        it('getWebviewTitle returns "AI"', () => {
            expect((command as unknown as { getWebviewTitle(): string }).getWebviewTitle())
                .toBe('AI');
        });
    });

    describe('loading state', () => {
        type Loadable = { getLoadingMessage(): string; getMinLoadingMs(): number; editPromptId?: string };

        it('uses an "AI overview" loading message in manage mode', () => {
            const c = command as unknown as Loadable;
            c.editPromptId = undefined;
            expect(c.getLoadingMessage()).toMatch(/AI overview/i);
        });

        it('does NOT mislabel the loading message as "AI overview" in edit mode', () => {
            const c = command as unknown as Loadable;
            c.editPromptId = 'prompt-123';
            expect(c.getLoadingMessage()).not.toMatch(/AI overview/i);
        });

        it('skips the artificial loading floor (getMinLoadingMs === 0)', () => {
            expect((command as unknown as Loadable).getMinLoadingMs()).toBe(0);
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

    describe('deep-link to edit a prompt', () => {
        /**
         * Stub the heavy lifecycle methods so we can observe how `execute`
         * threads `editPromptId` into initial data (fresh open) vs pushes an
         * `open-edit-prompt` message (already-open panel).
         */
        function stubLifecycle(): { sendMessage: jest.SpyInstance } {
            jest
                .spyOn(command as unknown as { createOrRevealPanel(): Promise<unknown> }, 'createOrRevealPanel')
                .mockResolvedValue(mockPanel);
            jest
                .spyOn(command as unknown as { initializeCommunication(): Promise<unknown> }, 'initializeCommunication')
                .mockResolvedValue(undefined);
            jest
                .spyOn(command as unknown as { subscribeToSurfaceChanges(): void }, 'subscribeToSurfaceChanges')
                .mockImplementation(() => undefined);
            const sendMessage = jest
                .spyOn(command as unknown as { sendMessage: (t: string, d?: unknown) => Promise<void> }, 'sendMessage')
                .mockResolvedValue(undefined);
            return { sendMessage };
        }

        it('includes editPromptId in initial data on a fresh open', async () => {
            stubLifecycle();

            await command.execute({ editPromptId: 'prompt-123' });

            const data = await (command as unknown as {
                getInitialData(): Promise<{ editPromptId?: string }>;
            }).getInitialData();
            expect(data.editPromptId).toBe('prompt-123');
        });

        it('does NOT push open-edit-prompt on a fresh open (initial data carries it)', async () => {
            const { sendMessage } = stubLifecycle();

            await command.execute({ editPromptId: 'prompt-123' });

            const openEditCalls = sendMessage.mock.calls.filter(c => c[0] === 'open-edit-prompt');
            expect(openEditCalls).toHaveLength(0);
        });

        it('pushes open-edit-prompt when the panel is already open', async () => {
            const { sendMessage } = stubLifecycle();
            // Simulate an already-open panel: comm manager present before execute.
            (command as unknown as { communicationManager: unknown }).communicationManager = {
                sendMessage: jest.fn(),
            };

            await command.execute({ editPromptId: 'prompt-456' });

            expect(sendMessage).toHaveBeenCalledWith('open-edit-prompt', { promptId: 'prompt-456' });
        });

        it('does NOT include editPromptId or push open-edit-prompt when called with no arg', async () => {
            const { sendMessage } = stubLifecycle();

            await command.execute();

            const data = await (command as unknown as {
                getInitialData(): Promise<{ editPromptId?: string }>;
            }).getInitialData();
            expect(data.editPromptId).toBeUndefined();

            const openEditCalls = sendMessage.mock.calls.filter(c => c[0] === 'open-edit-prompt');
            expect(openEditCalls).toHaveLength(0);
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
                    'register-global-mcp',
                    'openInClaude',
                ]),
            );
            expect(calledTypes).toHaveLength(5);
        });

        it('registers a close-ai-panel handler that disposes the panel', async () => {
            const onStreaming = jest.fn();
            const on = jest.fn();
            const mockComm = { onStreaming, on } as unknown as Parameters<
                (typeof command)['initializeMessageHandlers']
            >[0];
            (command as unknown as { panel: vscode.WebviewPanel }).panel = mockPanel;

            (command as unknown as {
                initializeMessageHandlers(c: typeof mockComm): void;
            }).initializeMessageHandlers(mockComm);

            const closeReg = on.mock.calls.find(call => call[0] === 'close-ai-panel');
            expect(closeReg).toBeDefined();

            // Invoke the registered handler — it should dispose the panel.
            await (closeReg![1] as () => unknown)();
            expect(mockPanel.dispose).toHaveBeenCalled();
        });
    });

    describe('edit-only launch title', () => {
        function stubLifecycle(): { sendMessage: jest.SpyInstance } {
            jest
                .spyOn(command as unknown as { createOrRevealPanel(): Promise<unknown> }, 'createOrRevealPanel')
                .mockImplementation(async () => {
                    (command as unknown as { panel: vscode.WebviewPanel }).panel = mockPanel;
                    return mockPanel;
                });
            jest
                .spyOn(command as unknown as { initializeCommunication(): Promise<unknown> }, 'initializeCommunication')
                .mockResolvedValue(undefined);
            jest
                .spyOn(command as unknown as { subscribeToSurfaceChanges(): void }, 'subscribeToSurfaceChanges')
                .mockImplementation(() => undefined);
            const sendMessage = jest
                .spyOn(command as unknown as { sendMessage: (t: string, d?: unknown) => Promise<void> }, 'sendMessage')
                .mockResolvedValue(undefined);
            return { sendMessage };
        }

        it('sets the panel title to "Edit Prompt" on an edit launch', async () => {
            stubLifecycle();

            await command.execute({ editPromptId: 'prompt-123' });

            expect(mockPanel.title).toBe('Edit Prompt');
        });

        it('sets the panel title to "AI" on a manage launch (no editPromptId)', async () => {
            stubLifecycle();

            await command.execute();

            expect(mockPanel.title).toBe('AI');
        });

        it('pushes set-manage-mode on a manage launch when the panel was already open', async () => {
            const { sendMessage } = stubLifecycle();
            (command as unknown as { communicationManager: unknown }).communicationManager = {
                sendMessage: jest.fn(),
            };

            await command.execute();

            expect(sendMessage).toHaveBeenCalledWith('set-manage-mode');
        });

        it('does NOT push set-manage-mode on a fresh manage launch (panel not already open)', async () => {
            const { sendMessage } = stubLifecycle();

            await command.execute();

            const manageCalls = sendMessage.mock.calls.filter(c => c[0] === 'set-manage-mode');
            expect(manageCalls).toHaveLength(0);
        });

        it('does NOT push set-manage-mode on an edit launch', async () => {
            const { sendMessage } = stubLifecycle();
            (command as unknown as { communicationManager: unknown }).communicationManager = {
                sendMessage: jest.fn(),
            };

            await command.execute({ editPromptId: 'prompt-123' });

            const manageCalls = sendMessage.mock.calls.filter(c => c[0] === 'set-manage-mode');
            expect(manageCalls).toHaveLength(0);
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

        it('sets the document title to "AI"', async () => {
            (command as unknown as { panel: vscode.WebviewPanel }).panel = mockPanel;
            const html = await (command as unknown as { getWebviewContent(): Promise<string> })
                .getWebviewContent();

            expect(html).toContain('<title>AI</title>');
        });
    });
});
