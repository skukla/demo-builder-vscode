/**
 * aiHandlers Tests — Launch
 *
 * handleOpenInClaude (terminal/extension launch, pending-launch mechanism).
 * Shared setup lives in aiHandlers.testUtils.ts.
 *
 * The handleSaveAiPrompt block moved to aiPromptHandlers-crud.test.ts on
 * 2026-09-07: the subject is defined in aiPromptHandlers.ts, and suites are
 * credited to modules by filename, so its kills were scored against a module
 * that only re-exports it.
 */

import { handleOpenInClaude, createAiHandlerContext } from './aiHandlers.testUtils';
import type { HandlerContext } from './aiHandlers.testUtils';

describe('aiHandlers — launch', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('handleOpenInClaude', () => {
        // Anchor-on-demand now lives in OpenInClaudeCommand.execute() (see
        // tests/features/lifecycle/commands/openInClaude.anchor.test.ts). This
        // handler is a thin pass-through: it forwards the (optional) prompt to
        // `demoBuilder.openInClaude` and never anchors / writes a pending record
        // itself, regardless of the current workspace.

        /** Set the mocked workspaceFolders for a single test. */
        function setWorkspaceFolder(path: string | null): void {
            const vscode = jest.requireMock('vscode');
            vscode.workspace.workspaceFolders =
                path === null ? undefined : [{ uri: { fsPath: path } }];
        }

        beforeEach(() => {
            setWorkspaceFolder('/projects/test');
        });

        it('forwards a prompt payload to demoBuilder.openInClaude', async () => {
            const vscode = jest.requireMock('vscode');
            const context = createAiHandlerContext();

            const result = await handleOpenInClaude(context, {
                prompt: 'Add a hero block',
            });

            expect(result).toEqual({ success: true });
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                'demoBuilder.openInClaude',
                { prompt: 'Add a hero block' }
            );
        });

        it('calls demoBuilder.openInClaude with no second argument when no payload is provided', async () => {
            const vscode = jest.requireMock('vscode');
            const context = createAiHandlerContext();

            const result = await handleOpenInClaude(context);

            expect(result).toEqual({ success: true });
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith('demoBuilder.openInClaude');
            const call = vscode.commands.executeCommand.mock.calls[0];
            expect(call).toHaveLength(1);
        });

        it('calls demoBuilder.openInClaude with no second argument when payload omits prompt', async () => {
            const vscode = jest.requireMock('vscode');
            const context = createAiHandlerContext();

            const result = await handleOpenInClaude(context, {});

            expect(result).toEqual({ success: true });
            const call = vscode.commands.executeCommand.mock.calls[0];
            expect(call[0]).toBe('demoBuilder.openInClaude');
            expect(call).toHaveLength(1);
        });

        // ----- No anchoring in the handler (moved to the command) -----

        it('does NOT anchor (no pending record, no openFolder) even when workspace ≠ project — the command handles that', async () => {
            const vscode = jest.requireMock('vscode');
            setWorkspaceFolder('/some/other/repo');
            const globalStateUpdateMock = jest.fn().mockResolvedValue(undefined);
            const context = createAiHandlerContext({
                context: {
                    extensionPath: '/mock/extension/path',
                    secrets: {
                        get: jest.fn(),
                        store: jest.fn(),
                        delete: jest.fn(),
                        onDidChange: jest.fn(),
                    },
                    globalState: {
                        get: jest.fn(),
                        update: globalStateUpdateMock,
                        keys: jest.fn().mockReturnValue([]),
                    },
                    subscriptions: [],
                } as unknown as HandlerContext['context'],
            });

            const result = await handleOpenInClaude(context, { prompt: 'Add a hero block' });

            expect(result).toEqual({ success: true });
            // No pending record written by the handler
            expect(globalStateUpdateMock).not.toHaveBeenCalled();
            // No openFolder by the handler
            expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(
                'vscode.openFolder',
                expect.anything(),
                expect.anything()
            );
            // Just forwards the prompt — the command anchors on-demand
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                'demoBuilder.openInClaude',
                { prompt: 'Add a hero block' }
            );
        });
    });
});
