/**
 * ShowAiCommand — the parts that DO something.
 *
 * The sibling suite pins the command's metadata (id, title, bundle, handler
 * registration). Everything with a decision in it — the no-project refusal, the
 * comm-manager gate, the catch, the theme mapping, the handler context handed to
 * every dispatch, and the footer Close — was measured unconstrained on
 * 2026-09-06: 22 of the file's mutants sat in code no test entered at all.
 *
 * The panel plumbing (`createOrRevealPanel`, `initializeCommunication`) is
 * stubbed per test: those belong to BaseWebviewCommand and have their own
 * suites, and running them for real here would stand up a live webview
 * communication manager to test four lines of routing.
 */

import * as vscode from 'vscode';
import { ShowAiCommand } from '@/features/dashboard/commands/openAi';
import { BaseWebviewCommand } from '@/core/base/baseWebviewCommand';
import { createPanelHandlerContext } from '@/commands/handlerContextFactory';
import { dispatchHandler } from '@/core/handlers/dispatchHandler';
import type { StateManager } from '@/core/state/stateManager';
import type { Logger } from '@/types/logger';
import type { HandlerContext } from '@/types/handlers';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';

jest.mock('@/features/dashboard/handlers/aiHandlers', () => ({
    aiHandlers: {
        'verify-ai-setup': jest.fn(),
        'regenerate-ai-files': jest.fn(),
        openInClaude: jest.fn(),
    },
}));

// getRegisteredTypes stays real (it is `Object.keys`); dispatchHandler is the
// collaborator whose ARGUMENTS are the thing under test.
jest.mock('@/core/handlers/dispatchHandler', () => ({
    dispatchHandler: jest.fn().mockResolvedValue({ success: true }),
    getRegisteredTypes: (handlers: Record<string, unknown>) => Object.keys(handlers),
}));

/** A sentinel context, so "which context reached the dispatch" is answerable. */
const CONTEXT_SENTINEL: HandlerContext = createMockHandlerContext();
jest.mock('@/commands/handlerContextFactory', () => ({
    createPanelHandlerContext: jest.fn(),
}));

const mockedCreateContext = createPanelHandlerContext as jest.MockedFunction<
    typeof createPanelHandlerContext
>;
const mockedDispatch = dispatchHandler as jest.MockedFunction<typeof dispatchHandler>;

interface CommandInternals {
    panel: vscode.WebviewPanel | undefined;
    communicationManager: unknown;
    createOrRevealPanel(): Promise<vscode.WebviewPanel>;
    initializeCommunication(): Promise<unknown>;
    initializeMessageHandlers(comm: unknown): void;
    getInitialData(): Promise<{ theme: string }>;
    getWebviewContent(): Promise<string>;
    sendMessage(type: string, payload?: unknown): Promise<void>;
}

describe('ShowAiCommand — execute and wiring', () => {
    let command: ShowAiCommand;
    let internals: CommandInternals;
    let mockPanel: vscode.WebviewPanel;
    let mockStateManager: jest.Mocked<StateManager>;
    let createOrRevealPanel: jest.Mock;
    let initializeCommunication: jest.Mock;
    let showErrorMessage: jest.Mock;
    let showWarningMessage: jest.Mock;

    beforeEach(() => {
        jest.restoreAllMocks();
        jest.clearAllMocks();
        mockedCreateContext.mockReturnValue(CONTEXT_SENTINEL);
        mockedDispatch.mockResolvedValue({ success: true });

        mockPanel = {
            webview: {
                asWebviewUri: jest.fn((uri: vscode.Uri) => uri),
                cspSource: 'vscode-webview:',
            },
            dispose: jest.fn(),
        } as unknown as vscode.WebviewPanel;

        mockStateManager = {
            getCurrentProject: jest
                .fn()
                .mockResolvedValue(createMockProject({ name: 'Test Project' })),
        } as unknown as jest.Mocked<StateManager>;

        command = new ShowAiCommand(
            createMockExtensionContext(),
            mockStateManager as unknown as StateManager,
            createMockLogger() as unknown as Logger,
        );
        internals = command as unknown as CommandInternals;

        createOrRevealPanel = jest.fn().mockResolvedValue(mockPanel);
        initializeCommunication = jest.fn().mockResolvedValue({});
        Object.assign(internals, { createOrRevealPanel, initializeCommunication });

        showErrorMessage = jest.fn().mockResolvedValue(undefined);
        showWarningMessage = jest.fn().mockResolvedValue(undefined);
        (vscode.window.showErrorMessage as unknown as jest.Mock) = showErrorMessage;
        (vscode.window.showWarningMessage as unknown as jest.Mock) = showWarningMessage;
        (vscode.window.activeColorTheme as unknown) = { kind: vscode.ColorThemeKind.Dark };
    });

    describe('disposeActivePanel', () => {
        it('disposes the registered panel', () => {
            jest.spyOn(BaseWebviewCommand, 'getActivePanel').mockReturnValue(mockPanel);

            ShowAiCommand.disposeActivePanel();

            expect(mockPanel.dispose).toHaveBeenCalledTimes(1);
        });

        it('looks the panel up by the AI webview id', () => {
            const getActivePanel = jest
                .spyOn(BaseWebviewCommand, 'getActivePanel')
                .mockReturnValue(mockPanel);

            ShowAiCommand.disposeActivePanel();

            expect(getActivePanel).toHaveBeenCalledWith('demoBuilder.openAi');
        });

        it('swallows a dispose that throws — an already-disposed panel is fine', () => {
            const dead = {
                dispose: jest.fn(() => {
                    throw new Error('Webview is disposed');
                }),
            } as unknown as vscode.WebviewPanel;
            jest.spyOn(BaseWebviewCommand, 'getActivePanel').mockReturnValue(dead);

            expect(() => ShowAiCommand.disposeActivePanel()).not.toThrow();
        });
    });

    describe('execute', () => {
        it('opens the panel when a project is open', async () => {
            await command.execute();

            expect(createOrRevealPanel).toHaveBeenCalledTimes(1);
            expect(showWarningMessage).not.toHaveBeenCalled();
        });

        it('initializes communication when the panel has none yet', async () => {
            await command.execute();

            expect(initializeCommunication).toHaveBeenCalledTimes(1);
        });

        it('reuses an existing communication manager rather than rebuilding it', async () => {
            internals.communicationManager = { alreadyThere: true };

            await command.execute();

            expect(initializeCommunication).not.toHaveBeenCalled();
        });

        it('reports an error instead of throwing when opening the panel fails', async () => {
            createOrRevealPanel.mockRejectedValue(new Error('no panel for you'));

            await expect(command.execute()).resolves.toBeUndefined();

            expect(showErrorMessage).toHaveBeenCalledWith('Failed to open prompts', 'OK');
        });
    });

    describe('getWebviewContent', () => {
        it('refuses before a panel exists', async () => {
            internals.panel = undefined;

            await expect(internals.getWebviewContent()).rejects.toThrow(
                'Panel must be created before getting webview content',
            );
        });
    });

    describe('getInitialData', () => {
        it('refuses when no project is open', async () => {
            mockStateManager.getCurrentProject = jest.fn().mockResolvedValue(null);

            await expect(internals.getInitialData()).rejects.toThrow('No project found');
        });

        it('maps a dark colour theme to the dark webview theme', async () => {
            (vscode.window.activeColorTheme as unknown) = { kind: vscode.ColorThemeKind.Dark };

            await expect(internals.getInitialData()).resolves.toEqual(
                expect.objectContaining({ theme: 'dark' }),
            );
        });

        it('maps every other colour theme to light', async () => {
            (vscode.window.activeColorTheme as unknown) = { kind: vscode.ColorThemeKind.Light };

            await expect(internals.getInitialData()).resolves.toEqual(
                expect.objectContaining({ theme: 'light' }),
            );
        });
    });

    describe('the context every message dispatch is given', () => {
        function register(): { onStreaming: jest.Mock; on: jest.Mock } {
            const comm = { onStreaming: jest.fn(), on: jest.fn() };
            internals.panel = mockPanel;
            internals.initializeMessageHandlers(comm);
            return comm;
        }

        it('dispatches into the aiHandlers map with the factory-built context', async () => {
            const comm = register();
            const [type, handler] = comm.onStreaming.mock.calls[0] as [
                string,
                (data: unknown) => Promise<unknown>,
            ];

            await handler({ some: 'payload' });

            expect(mockedDispatch).toHaveBeenCalledWith(
                expect.any(Object),
                CONTEXT_SENTINEL,
                type,
                { some: 'payload' },
            );
        });

        it('returns the handler result to the webview (Pattern B)', async () => {
            const comm = register();
            mockedDispatch.mockResolvedValue({ success: true, prompts: ['a'] });
            const handler = comm.onStreaming.mock.calls[0][1] as (d: unknown) => Promise<unknown>;

            await expect(handler({})).resolves.toEqual({ success: true, prompts: ['a'] });
        });

        it('builds that context from the panel wiring, not a hand-rolled partial', async () => {
            const comm = register();
            await (comm.onStreaming.mock.calls[0][1] as (d: unknown) => Promise<unknown>)({});

            expect(mockedCreateContext).toHaveBeenCalledWith(
                expect.objectContaining({
                    panel: mockPanel,
                    stateManager: mockStateManager,
                    sendMessage: expect.any(Function),
                }),
            );
        });

        it('the sendMessage it hands over forwards to the panel transport', async () => {
            const comm = register();
            const sendMessage = jest.fn().mockResolvedValue(undefined);
            Object.assign(internals, { sendMessage });
            await (comm.onStreaming.mock.calls[0][1] as (d: unknown) => Promise<unknown>)({});

            const handed = mockedCreateContext.mock.calls[0][0].sendMessage;
            await handed('mesh-status', { state: 'deploying' });

            expect(sendMessage).toHaveBeenCalledWith('mesh-status', { state: 'deploying' });
        });
    });

    describe('the footer Close button', () => {
        function cancelHandler(): () => Promise<unknown> {
            const comm = { onStreaming: jest.fn(), on: jest.fn() };
            internals.initializeMessageHandlers(comm);
            return comm.on.mock.calls.find((call) => call[0] === 'cancel')![1] as () => Promise<
                unknown
            >;
        }

        it('answers success so the webview can settle its request', async () => {
            internals.panel = mockPanel;

            await expect(cancelHandler()()).resolves.toEqual({ success: true });
        });

        it('answers success even with no panel to close', async () => {
            internals.panel = undefined;

            await expect(cancelHandler()()).resolves.toEqual({ success: true });
        });
    });
});
