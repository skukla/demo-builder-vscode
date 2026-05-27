/**
 * aiHandlers Tests — Copy, sessions & module helpers
 *
 * handleCopyAiPrompt, handleBrowseClaudeSessions, and the module-level prompt
 * helpers (GLOBAL_AI_PROMPTS_KEY, mergePromptsForRead, readMergedAiPrompts,
 * deleteAiPromptById). Shared setup lives in aiHandlers.testUtils.ts.
 */

import {
    handleCopyAiPrompt,
    handleBrowseClaudeSessions,
    GLOBAL_AI_PROMPTS_KEY,
    mergePromptsForRead,
    deleteAiPromptById,
    readMergedAiPrompts,
    createMockContext,
    makeScopedContext,
} from './aiHandlers.testUtils';

describe('aiHandlers — copy, sessions & module helpers', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('handleCopyAiPrompt', () => {
        it('writes the prompt body to the system clipboard and shows a confirmation toast', async () => {
            const vscode = jest.requireMock('vscode') as {
                env: { clipboard: { writeText: jest.Mock } };
                window: { showInformationMessage: jest.Mock };
            };
            const context = createMockContext();

            const result = await handleCopyAiPrompt(context, {
                prompt: 'Build a hero block',
                name: 'Hero Block Generator',
            });

            expect(vscode.env.clipboard.writeText).toHaveBeenCalledWith('Build a hero block');
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                expect.stringContaining('Prompt copied to clipboard'),
            );
            expect(result).toEqual({ success: true });
        });

        it('logs the prompt name only — never the prompt body', async () => {
            const context = createMockContext();
            const loggerInfo = context.logger.info as jest.Mock;

            await handleCopyAiPrompt(context, {
                prompt: 'SECRET_BODY_should_not_appear_in_logs',
                name: 'Hero Block Generator',
            });

            expect(loggerInfo).toHaveBeenCalledWith(
                expect.stringContaining('[handleCopyAiPrompt] prompt copied'),
            );
            const logged = loggerInfo.mock.calls.map((c) => String(c[0])).join('\n');
            expect(logged).toContain('Hero Block Generator');
            expect(logged).not.toContain('SECRET_BODY_should_not_appear_in_logs');
        });

        it('still copies and reports success when name is omitted', async () => {
            const vscode = jest.requireMock('vscode') as {
                env: { clipboard: { writeText: jest.Mock } };
            };
            const context = createMockContext();

            const result = await handleCopyAiPrompt(context, { prompt: 'Quick prompt' });

            expect(vscode.env.clipboard.writeText).toHaveBeenCalledWith('Quick prompt');
            expect(result).toEqual({ success: true });
        });
    });

    describe('handleBrowseClaudeSessions', () => {
        it('returns success when the primary container-focus command succeeds', async () => {
            const vscode = jest.requireMock('vscode') as {
                commands: { executeCommand: jest.Mock };
                extensions: { getExtension: jest.Mock };
            };
            vscode.extensions.getExtension.mockReturnValue({ id: 'anthropic.claude-code' });
            vscode.commands.executeCommand.mockResolvedValueOnce(undefined);

            const context = createMockContext();
            const result = await handleBrowseClaudeSessions(context);

            expect(vscode.extensions.getExtension).toHaveBeenCalledWith('anthropic.claude-code');
            expect(vscode.commands.executeCommand).toHaveBeenCalledTimes(1);
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                'workbench.view.extension.claude-sessions-sidebar',
            );
            expect(context.logger.info).toHaveBeenCalledWith(
                expect.stringContaining('[handleBrowseClaudeSessions] sessions browser focus command executed'),
            );
            expect(result).toEqual({ success: true });
        });

        it('falls back to claudeVSCodeSessionsList.focus when the primary command throws', async () => {
            const vscode = jest.requireMock('vscode') as {
                commands: { executeCommand: jest.Mock };
                extensions: { getExtension: jest.Mock };
            };
            vscode.extensions.getExtension.mockReturnValue({ id: 'anthropic.claude-code' });
            vscode.commands.executeCommand
                .mockRejectedValueOnce(new Error('container missing'))
                .mockResolvedValueOnce(undefined);

            const context = createMockContext();
            const result = await handleBrowseClaudeSessions(context);

            expect(vscode.commands.executeCommand).toHaveBeenNthCalledWith(
                1,
                'workbench.view.extension.claude-sessions-sidebar',
            );
            expect(vscode.commands.executeCommand).toHaveBeenNthCalledWith(
                2,
                'claudeVSCodeSessionsList.focus',
            );
            expect(context.logger.warn).toHaveBeenCalledWith(
                expect.stringContaining('[handleBrowseClaudeSessions] primary focus command failed'),
            );
            expect(result).toEqual({ success: true });
        });

        it('returns success: false and shows a toast when both focus commands throw', async () => {
            const vscode = jest.requireMock('vscode') as {
                commands: { executeCommand: jest.Mock };
                extensions: { getExtension: jest.Mock };
                window: { showInformationMessage: jest.Mock };
            };
            vscode.extensions.getExtension.mockReturnValue({ id: 'anthropic.claude-code' });
            vscode.commands.executeCommand
                .mockRejectedValueOnce(new Error('primary fail'))
                .mockRejectedValueOnce(new Error('fallback fail'));

            const context = createMockContext();
            const result = await handleBrowseClaudeSessions(context);

            expect(vscode.commands.executeCommand).toHaveBeenCalledTimes(2);
            const warnMock = context.logger.warn as jest.Mock;
            expect(warnMock).toHaveBeenCalledWith(
                expect.stringContaining('[handleBrowseClaudeSessions] primary focus command failed'),
            );
            expect(warnMock).toHaveBeenCalledWith(
                expect.stringContaining('[handleBrowseClaudeSessions] both focus commands failed'),
            );
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                expect.stringContaining('sessions browser unavailable'),
            );
            expect(result).toMatchObject({ success: false });
        });

        it('returns success: false without invoking any commands when the extension is not installed', async () => {
            const vscode = jest.requireMock('vscode') as {
                commands: { executeCommand: jest.Mock };
                extensions: { getExtension: jest.Mock };
            };
            vscode.extensions.getExtension.mockReturnValue(undefined);

            const context = createMockContext();
            const result = await handleBrowseClaudeSessions(context);

            expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
            expect(context.logger.warn).toHaveBeenCalledWith(
                expect.stringContaining('[handleBrowseClaudeSessions] extension not installed'),
            );
            expect(result).toMatchObject({ success: false });
        });
    });

    // ==========================================================
    // Exported reusable helpers (consumed by the AI QuickPick command)
    // ==========================================================

    describe('GLOBAL_AI_PROMPTS_KEY', () => {
        it('exports the globalState key string', () => {
            expect(GLOBAL_AI_PROMPTS_KEY).toBe('demoBuilder.ai.globalPrompts');
        });
    });

    describe('mergePromptsForRead', () => {
        it('returns globals first, then project prompts', () => {
            const merged = mergePromptsForRead(
                [{ id: 'g', title: 'G', prompt: 'g', pinned: true }],
                [{ id: 'p', title: 'P', prompt: 'p' }],
            );
            expect(merged).toEqual([
                { id: 'g', title: 'G', prompt: 'g', pinned: true },
                { id: 'p', title: 'P', prompt: 'p' },
            ]);
        });

        it('dedups by id, with the global copy winning on collision', () => {
            const merged = mergePromptsForRead(
                [{ id: 'dup', title: 'Fresh', prompt: 'fresh', pinned: true }],
                [{ id: 'dup', title: 'Stale', prompt: 'stale' }],
            );
            expect(merged).toEqual([
                { id: 'dup', title: 'Fresh', prompt: 'fresh', pinned: true },
            ]);
        });

        it('returns an empty array when both stores are empty', () => {
            expect(mergePromptsForRead([], [])).toEqual([]);
        });
    });

    describe('readMergedAiPrompts', () => {
        it('returns the merged pinned-first list for a project', () => {
            const { context, project } = makeScopedContext({
                projectPrompts: [{ id: 'p1', title: 'P1', prompt: 'p1' }],
                globalPrompts: [{ id: 'g1', title: 'G1', prompt: 'g1', pinned: true }],
            });
            const merged = readMergedAiPrompts(context, project as never);
            expect(merged).toEqual([
                { id: 'g1', title: 'G1', prompt: 'g1', pinned: true },
                { id: 'p1', title: 'P1', prompt: 'p1' },
            ]);
        });

        it('returns only globals when project is undefined (no-project case)', () => {
            const { context } = makeScopedContext({
                globalPrompts: [{ id: 'g1', title: 'G1', prompt: 'g1', pinned: true }],
            });
            const merged = readMergedAiPrompts(context, undefined);
            expect(merged).toEqual([
                { id: 'g1', title: 'G1', prompt: 'g1', pinned: true },
            ]);
        });

        it('does not throw and returns [] when there are no prompts and no project', () => {
            const { context } = makeScopedContext();
            expect(readMergedAiPrompts(context, undefined)).toEqual([]);
        });
    });

    describe('deleteAiPromptById', () => {
        it('removes a project-only prompt and returns the merged remaining list', async () => {
            const { context, project, memento } = makeScopedContext({
                projectPrompts: [
                    { id: 'a', title: 'A', prompt: 'a' },
                    { id: 'b', title: 'B', prompt: 'b' },
                ],
                globalPrompts: [{ id: 'g', title: 'G', prompt: 'g', pinned: true }],
            });

            const remaining = await deleteAiPromptById(context, project as never, 'a');

            expect(project.aiPrompts).toEqual([{ id: 'b', title: 'B', prompt: 'b' }]);
            expect(memento._store.get('demoBuilder.ai.globalPrompts')).toEqual([
                { id: 'g', title: 'G', prompt: 'g', pinned: true },
            ]);
            expect(remaining).toEqual([
                { id: 'g', title: 'G', prompt: 'g', pinned: true },
                { id: 'b', title: 'B', prompt: 'b' },
            ]);
        });

        it('removes a global-only prompt and leaves the project store untouched', async () => {
            const { context, project, memento } = makeScopedContext({
                projectPrompts: [{ id: 'p', title: 'P', prompt: 'p' }],
                globalPrompts: [{ id: 'g', title: 'G', prompt: 'g', pinned: true }],
            });

            const remaining = await deleteAiPromptById(context, project as never, 'g');

            expect(memento._store.get('demoBuilder.ai.globalPrompts')).toEqual([]);
            expect(project.aiPrompts).toEqual([{ id: 'p', title: 'P', prompt: 'p' }]);
            expect(remaining).toEqual([{ id: 'p', title: 'P', prompt: 'p' }]);
        });

        it('removes from both stores when the id is (defensively) present in each', async () => {
            const { context, project, memento } = makeScopedContext({
                projectPrompts: [{ id: 'dup', title: 'Project', prompt: 'p' }],
                globalPrompts: [{ id: 'dup', title: 'Global', prompt: 'g', pinned: true }],
            });

            const remaining = await deleteAiPromptById(context, project as never, 'dup');

            expect(memento._store.get('demoBuilder.ai.globalPrompts')).toEqual([]);
            expect(project.aiPrompts).toEqual([]);
            expect(remaining).toEqual([]);
        });

        it('handles an undefined project by deleting from the global store only', async () => {
            const { context, memento } = makeScopedContext({
                globalPrompts: [
                    { id: 'g1', title: 'G1', prompt: 'g1', pinned: true },
                    { id: 'g2', title: 'G2', prompt: 'g2', pinned: true },
                ],
            });

            const remaining = await deleteAiPromptById(context, undefined, 'g1');

            expect(memento._store.get('demoBuilder.ai.globalPrompts')).toEqual([
                { id: 'g2', title: 'G2', prompt: 'g2', pinned: true },
            ]);
            expect(remaining).toEqual([
                { id: 'g2', title: 'G2', prompt: 'g2', pinned: true },
            ]);
        });
    });

});
