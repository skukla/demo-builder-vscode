/**
 * aiHandlers Tests — Launch & save
 *
 * handleOpenInClaude (terminal/extension launch, pending-launch mechanism) and
 * handleSaveAiPrompt (project + global scope writes). Shared setup lives in
 * aiHandlers.testUtils.ts.
 */

import {
    handleOpenInClaude,
    handleSaveAiPrompt,
    handleListAiPrompts,
    createMockContext,
    makeScopedContext,
} from './aiHandlers.testUtils';
import type { HandlerContext } from './aiHandlers.testUtils';

describe('aiHandlers — launch & save', () => {
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
            const vscode = jest.requireMock('vscode') as {
                workspace: { workspaceFolders: { uri: { fsPath: string } }[] | undefined };
            };
            vscode.workspace.workspaceFolders = path === null
                ? undefined
                : [{ uri: { fsPath: path } }];
        }

        beforeEach(() => {
            setWorkspaceFolder('/projects/test');
        });

        it('forwards a prompt payload to demoBuilder.openInClaude', async () => {
            const vscode = jest.requireMock('vscode') as {
                commands: { executeCommand: jest.Mock };
            };
            const context = createMockContext();

            const result = await handleOpenInClaude(context, {
                prompt: 'Add a hero block',
            });

            expect(result).toEqual({ success: true });
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                'demoBuilder.openInClaude',
                { prompt: 'Add a hero block' },
            );
        });

        it('calls demoBuilder.openInClaude with no second argument when no payload is provided', async () => {
            const vscode = jest.requireMock('vscode') as {
                commands: { executeCommand: jest.Mock };
            };
            const context = createMockContext();

            const result = await handleOpenInClaude(context);

            expect(result).toEqual({ success: true });
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith('demoBuilder.openInClaude');
            const call = vscode.commands.executeCommand.mock.calls[0];
            expect(call.length).toBe(1);
        });

        it('calls demoBuilder.openInClaude with no second argument when payload omits prompt', async () => {
            const vscode = jest.requireMock('vscode') as {
                commands: { executeCommand: jest.Mock };
            };
            const context = createMockContext();

            const result = await handleOpenInClaude(context, {} as never);

            expect(result).toEqual({ success: true });
            const call = vscode.commands.executeCommand.mock.calls[0];
            expect(call[0]).toBe('demoBuilder.openInClaude');
            expect(call.length).toBe(1);
        });

        // ----- No anchoring in the handler (moved to the command) -----

        it('does NOT anchor (no pending record, no openFolder) even when workspace ≠ project — the command handles that', async () => {
            const vscode = jest.requireMock('vscode') as {
                commands: { executeCommand: jest.Mock };
            };
            setWorkspaceFolder('/some/other/repo');
            const globalStateUpdateMock = jest.fn().mockResolvedValue(undefined);
            const context = createMockContext({
                context: {
                    extensionPath: '/mock/extension/path',
                    secrets: { get: jest.fn(), store: jest.fn(), delete: jest.fn(), onDidChange: jest.fn() },
                    globalState: { get: jest.fn(), update: globalStateUpdateMock, keys: jest.fn().mockReturnValue([]) },
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
                expect.anything(),
            );
            // Just forwards the prompt — the command anchors on-demand
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                'demoBuilder.openInClaude',
                { prompt: 'Add a hero block' },
            );
        });
    });

    // ==========================================================
    // AI prompt CRUD handlers
    // ==========================================================

    describe('handleSaveAiPrompt', () => {
        it('appends a new prompt to project.aiPrompts when id is not already present', async () => {
            const saveProject = jest.fn().mockResolvedValue(undefined);
            const project = { name: 'p', path: '/projects/p', aiPrompts: [] as unknown[] };
            const context = createMockContext({
                stateManager: {
                    getCurrentProject: jest.fn().mockResolvedValue(project),
                    saveProject,
                } as unknown as HandlerContext['stateManager'],
            });

            const result = await handleSaveAiPrompt(context, {
                prompt: { id: 'new-id', title: 'T', prompt: 'B' },
            });

            expect(saveProject).toHaveBeenCalledTimes(1);
            const saved = saveProject.mock.calls[0][0];
            expect(saved.aiPrompts).toEqual([{ id: 'new-id', title: 'T', prompt: 'B' }]);
            expect(result).toEqual({
                success: true,
                aiPrompts: [{ id: 'new-id', title: 'T', prompt: 'B' }],
            });
        });

        it('replaces an existing prompt by id (edit flow)', async () => {
            const saveProject = jest.fn().mockResolvedValue(undefined);
            const project = {
                name: 'p',
                path: '/projects/p',
                aiPrompts: [
                    { id: 'a', title: 'A', prompt: 'a' },
                    { id: 'b', title: 'B', prompt: 'b' },
                ],
            };
            const context = createMockContext({
                stateManager: {
                    getCurrentProject: jest.fn().mockResolvedValue(project),
                    saveProject,
                } as unknown as HandlerContext['stateManager'],
            });

            const result = await handleSaveAiPrompt(context, {
                prompt: { id: 'a', title: 'A2', prompt: 'a2' },
            });

            expect(saveProject).toHaveBeenCalledTimes(1);
            const saved = saveProject.mock.calls[0][0];
            expect(saved.aiPrompts).toEqual([
                { id: 'a', title: 'A2', prompt: 'a2' },
                { id: 'b', title: 'B', prompt: 'b' },
            ]);
            expect(result.success).toBe(true);
            expect((result.aiPrompts as unknown[]).length).toBe(2);
        });

        it('returns success: false when prompt payload is missing', async () => {
            const context = createMockContext();
            const result = await handleSaveAiPrompt(context, undefined as never);
            expect(result.success).toBe(false);
        });

        it('returns success: false when prompt fields are missing', async () => {
            const context = createMockContext();
            const result = await handleSaveAiPrompt(context, {
                prompt: { id: 'x', title: '', prompt: '' },
            } as unknown as { prompt: { id: string; title: string; prompt: string } });
            expect(result.success).toBe(false);
        });

        it('uses stateManager.getCurrentProject (does not accept webview-supplied projectPath)', async () => {
            const saveProject = jest.fn().mockResolvedValue(undefined);
            const getCurrentProject = jest.fn().mockResolvedValue({
                name: 'p',
                path: '/safe/path',
                aiPrompts: [],
            });
            const context = createMockContext({
                stateManager: {
                    getCurrentProject,
                    saveProject,
                } as unknown as HandlerContext['stateManager'],
            });

            await handleSaveAiPrompt(context, {
                prompt: { id: 'new', title: 'T', prompt: 'B' },
            });

            expect(getCurrentProject).toHaveBeenCalled();
            expect(saveProject.mock.calls[0][0].path).toBe('/safe/path');
        });

        it('returns project-not-found when no current project is loaded', async () => {
            const context = createMockContext({
                stateManager: {
                    getCurrentProject: jest.fn().mockResolvedValue(null),
                    saveProject: jest.fn(),
                } as unknown as HandlerContext['stateManager'],
            });
            const result = await handleSaveAiPrompt(context, {
                prompt: { id: 'x', title: 'T', prompt: 'B' },
            });
            expect(result.success).toBe(false);
        });

        // ── Global-pin-store routing ──────────────────────────────────────
        it('writes a new pinned prompt to globalState, NOT to project.aiPrompts', async () => {
            const { context, project, memento } = makeScopedContext();
            await handleSaveAiPrompt(context, {
                prompt: { id: 'g1', title: 'Pinned', prompt: 'p', pinned: true },
            });
            expect(memento._store.get('demoBuilder.ai.globalPrompts')).toEqual([
                { id: 'g1', title: 'Pinned', prompt: 'p', pinned: true },
            ]);
            expect(project.aiPrompts).toEqual([]);
        });

        it('writes a new unpinned prompt to project.aiPrompts, NOT to globalState', async () => {
            const { context, project, memento } = makeScopedContext();
            await handleSaveAiPrompt(context, {
                prompt: { id: 'p1', title: 'Unpinned', prompt: 'p' },
            });
            expect(project.aiPrompts).toEqual([
                { id: 'p1', title: 'Unpinned', prompt: 'p' },
            ]);
            expect(memento._store.get('demoBuilder.ai.globalPrompts')).toEqual([]);
        });

        it('moves a prompt project→global when pin toggles false→true', async () => {
            const { context, project, memento } = makeScopedContext({
                projectPrompts: [
                    { id: 'x', title: 'X', prompt: 'x' },
                    { id: 'y', title: 'Y', prompt: 'y' },
                ],
            });
            await handleSaveAiPrompt(context, {
                prompt: { id: 'x', title: 'X', prompt: 'x', pinned: true },
            });
            // Removed from project
            expect(project.aiPrompts).toEqual([{ id: 'y', title: 'Y', prompt: 'y' }]);
            // Added to global
            expect(memento._store.get('demoBuilder.ai.globalPrompts')).toEqual([
                { id: 'x', title: 'X', prompt: 'x', pinned: true },
            ]);
        });

        it('moves a prompt global→project when pin toggles true→false', async () => {
            const { context, project, memento } = makeScopedContext({
                projectPrompts: [{ id: 'y', title: 'Y', prompt: 'y' }],
                globalPrompts: [{ id: 'g', title: 'G', prompt: 'g', pinned: true }],
            });
            await handleSaveAiPrompt(context, {
                prompt: { id: 'g', title: 'G', prompt: 'g', pinned: false },
            });
            // Removed from global
            expect(memento._store.get('demoBuilder.ai.globalPrompts')).toEqual([]);
            // Added to project
            expect(project.aiPrompts).toEqual([
                { id: 'y', title: 'Y', prompt: 'y' },
                { id: 'g', title: 'G', prompt: 'g', pinned: false },
            ]);
        });

        it('after a cross-scope move, the merged list contains the prompt exactly once', async () => {
            const { context } = makeScopedContext({
                projectPrompts: [{ id: 'x', title: 'X', prompt: 'x' }],
            });
            await handleSaveAiPrompt(context, {
                prompt: { id: 'x', title: 'X', prompt: 'x', pinned: true },
            });
            const result = await handleListAiPrompts(context);
            const matches = (result.aiPrompts as { id: string }[]).filter(p => p.id === 'x');
            expect(matches).toHaveLength(1);
            expect(matches[0]).toMatchObject({ pinned: true });
        });

        it('updates a global prompt in place when pin state is unchanged', async () => {
            const { context, project, memento } = makeScopedContext({
                globalPrompts: [{ id: 'g', title: 'Old', prompt: 'old', pinned: true }],
            });
            await handleSaveAiPrompt(context, {
                prompt: { id: 'g', title: 'New', prompt: 'new', pinned: true },
            });
            expect(memento._store.get('demoBuilder.ai.globalPrompts')).toEqual([
                { id: 'g', title: 'New', prompt: 'new', pinned: true },
            ]);
            expect(project.aiPrompts).toEqual([]);
        });
    });

});
