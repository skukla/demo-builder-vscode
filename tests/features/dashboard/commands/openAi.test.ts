/**
 * ShowAiCommand Tests
 *
 * Tests for the prompt library webview command.
 * Mirrors the ConfigureProjectWebviewCommand test pattern.
 */

import * as vscode from 'vscode';
import { ShowAiCommand } from '@/features/dashboard/commands/openAi';
import { BaseWebviewCommand } from '@/core/base/baseWebviewCommand';
import { StateManager } from '@/core/state/stateManager';
import type { Logger } from '@/types/logger';
import type { Project } from '@/types/base';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';

// Mock VS Code API

// Mock dependencies

// Mock logger

// Mock the AI handler map so we can verify wiring
jest.mock('@/features/dashboard/handlers/aiHandlers', () => ({
    aiHandlers: {
        'verify-ai-setup': jest.fn(),
        'regenerate-ai-files': jest.fn(),
        openInClaude: jest.fn(),
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
            asWebviewUri: jest.fn(
                (uri: vscode.Uri) =>
                    ({
                        toString: () => `vscode-webview://authority${uri.fsPath}`,
                        fsPath: uri.fsPath,
                    }) as vscode.Uri
            ),
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

        mockContext = createMockExtensionContext();

        mockStateManager = {
            getCurrentProject: jest.fn().mockResolvedValue(createMockProject({
                name: 'Test Project',
                path: '/test/project',
            })),
        } as unknown as jest.Mocked<StateManager>;

        mockLogger = createMockLogger() as unknown as Logger;

        command = new ShowAiCommand(
            mockContext,
            mockStateManager as unknown as StateManager,
            mockLogger
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
            expect((command as unknown as { getWebviewId(): string }).getWebviewId()).toBe(
                'demoBuilder.openAi'
            );
        });

        it('getWebviewTitle returns "Prompt Library"', () => {
            expect((command as unknown as { getWebviewTitle(): string }).getWebviewTitle()).toBe(
                'Prompt Library'
            );
        });
    });

    describe('loading state', () => {
        it('uses a "prompt library" loading message', () => {
            expect(
                (command as unknown as { getLoadingMessage(): string }).getLoadingMessage()
            ).toMatch(/prompt library/i);
        });
    });

    describe('getInitialData', () => {
        it('includes the current project', async () => {
            const data = await (
                command as unknown as { getInitialData(): Promise<{ project: Project }> }
            ).getInitialData();

            expect(data.project).toBeDefined();
            expect(data.project.name).toBe('Test Project');
        });

        it('includes the theme', async () => {
            const data = await (
                command as unknown as { getInitialData(): Promise<{ theme: string }> }
            ).getInitialData();

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

            (
                command as unknown as {
                    initializeMessageHandlers(c: typeof mockComm): void;
                }
            ).initializeMessageHandlers(mockComm);

            const calledTypes = onStreaming.mock.calls.map((call) => call[0]);
            expect(calledTypes).toEqual(
                expect.arrayContaining(['verify-ai-setup', 'regenerate-ai-files', 'openInClaude'])
            );
            // 4 → 3: inspect-mcp removed 2026-08-05. It was registered but
            // unreachable — the AI surface has no Refresh action to send it.
            expect(calledTypes).toHaveLength(3);
        });

        it('registers a cancel handler (footer Close) that disposes the panel', async () => {
            const onStreaming = jest.fn();
            const on = jest.fn();
            const mockComm = { onStreaming, on } as unknown as Parameters<
                (typeof command)['initializeMessageHandlers']
            >[0];
            (command as unknown as { panel: vscode.WebviewPanel }).panel = mockPanel;

            (
                command as unknown as {
                    initializeMessageHandlers(c: typeof mockComm): void;
                }
            ).initializeMessageHandlers(mockComm);

            const cancelReg = on.mock.calls.find((call) => call[0] === 'cancel');
            expect(cancelReg).toBeDefined();

            await (cancelReg![1] as () => unknown)();
            expect(mockPanel.dispose).toHaveBeenCalled();
        });
    });

    // No surface-change subscription suite: the listener watched
    // `demoBuilder.ai.surface`, a setting retired in 7bbe1bd9 — an
    // unregistered key can never change, so the subscription could never
    // fire and was deleted 2026-08-21 (found by the settings-seam audit).
    // This suite was the mock proving the mock: it hand-fired the callback
    // a real VS Code would never invoke.

    describe('webview content', () => {
        it('loads the aiOverview-bundle.js feature bundle', async () => {
            (command as unknown as { panel: vscode.WebviewPanel }).panel = mockPanel;

            const html = await (
                command as unknown as { getWebviewContent(): Promise<string> }
            ).getWebviewContent();

            expect(html).toContain('aiOverview-bundle.js');
        });

        it('sets the document title to "Prompt Library"', async () => {
            (command as unknown as { panel: vscode.WebviewPanel }).panel = mockPanel;
            const html = await (
                command as unknown as { getWebviewContent(): Promise<string> }
            ).getWebviewContent();

            expect(html).toContain('<title>Prompt Library</title>');
        });
    });
});
