/**
 * aiPromptHandlers — copy and the module helpers
 *
 * Renamed from `aiHandlers-*.test.ts` on 2026-09-07. Every test here exercises
 * handleCopyAiPrompt, mergePromptsForRead, readMergedAiPrompts and deleteAiPromptById,
 * all of which are DEFINED IN `aiPromptHandlers.ts`. Suites are matched to
 * modules by filename, so the whole file was scored against `aiHandlers.ts` —
 * which only re-exports one of these — and killed nothing there, while
 * `aiPromptHandlers.ts` had no suite of its own and had never appeared in the
 * mutation baseline.
 *
 * The subjects are reached through `aiHandlers.testUtils`, which already
 * re-exports them from the defining module, so nothing about how these tests
 * run has changed — only which module their kills are credited to.
 */

// The mock preamble lives in aiHandlers.testUtils, so it must be required BEFORE
// the module under test — hence this import first. The subjects then come from the
// module that DECLARES them, which is also what pairs this suite to that module in
// the mutation configs (tests/sop/mutation-config-pairing.test.ts).
import { createAiHandlerContext, makeScopedContext } from './aiHandlers.testUtils';
import {
    handleCopyAiPrompt,
    GLOBAL_AI_PROMPTS_KEY,
    mergePromptsForRead,
    deleteAiPromptById,
    readMergedAiPrompts,
} from '@/features/dashboard/handlers/aiPromptHandlers';
import { ErrorCode } from '@/types/errorCodes';

describe('aiHandlers — copy & module helpers', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('handleCopyAiPrompt', () => {
        it('writes the prompt body to the system clipboard and shows a confirmation toast', async () => {
            const vscode = jest.requireMock('vscode');
            const context = createAiHandlerContext();

            const result = await handleCopyAiPrompt(context, {
                prompt: 'Build a hero block',
                name: 'Hero Block Generator',
            });

            expect(vscode.env.clipboard.writeText).toHaveBeenCalledWith('Build a hero block');
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                expect.stringContaining('Prompt copied to clipboard')
            );
            expect(result).toEqual({ success: true });
        });

        it('logs the prompt name only — never the prompt body', async () => {
            const context = createAiHandlerContext();
            const loggerInfo = context.logger.info as jest.Mock;

            await handleCopyAiPrompt(context, {
                prompt: 'SECRET_BODY_should_not_appear_in_logs',
                name: 'Hero Block Generator',
            });

            // The assertion is about WHAT reaches the log, not how it is worded: the
            // two checks below need a log line to have happened at all, and pinning
            // its prefix as well only fixes the wording in place.
            const logged = loggerInfo.mock.calls.map((c) => String(c[0])).join('\n');
            expect(logged).toContain('Hero Block Generator');
            expect(logged).not.toContain('SECRET_BODY_should_not_appear_in_logs');
        });

        it('rejects a payload with no prompt body and never touches the clipboard', async () => {
            const vscode = jest.requireMock('vscode');
            const context = createAiHandlerContext();

            const result = await handleCopyAiPrompt(context, {});

            expect(result).toEqual({
                success: false,
                error: 'Invalid prompt payload',
                code: ErrorCode.CONFIG_INVALID,
            });
            expect(vscode.env.clipboard.writeText).not.toHaveBeenCalled();
            expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
        });

        it('rejects an empty prompt body rather than clearing the clipboard', async () => {
            const vscode = jest.requireMock('vscode');
            const context = createAiHandlerContext();

            const result = await handleCopyAiPrompt(context, { prompt: '' });

            expect(result.success).toBe(false);
            expect(vscode.env.clipboard.writeText).not.toHaveBeenCalled();
        });

        it('rejects a missing payload entirely', async () => {
            // The kebab menu can invoke copy with nothing attached; reading
            // `payload.prompt` unguarded would throw out of the handler.
            const context = createAiHandlerContext();

            const result = await handleCopyAiPrompt(context);

            expect(result.success).toBe(false);
        });

        it('still copies and reports success when name is omitted', async () => {
            const vscode = jest.requireMock('vscode');
            const context = createAiHandlerContext();

            const result = await handleCopyAiPrompt(context, { prompt: 'Quick prompt' });

            expect(vscode.env.clipboard.writeText).toHaveBeenCalledWith('Quick prompt');
            expect(result).toEqual({ success: true });
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
                [{ id: 'p', title: 'P', prompt: 'p' }]
            );
            expect(merged).toEqual([
                { id: 'g', title: 'G', prompt: 'g', pinned: true },
                { id: 'p', title: 'P', prompt: 'p' },
            ]);
        });

        it('dedups by id, with the global copy winning on collision', () => {
            const merged = mergePromptsForRead(
                [{ id: 'dup', title: 'Fresh', prompt: 'fresh', pinned: true }],
                [{ id: 'dup', title: 'Stale', prompt: 'stale' }]
            );
            expect(merged).toEqual([{ id: 'dup', title: 'Fresh', prompt: 'fresh', pinned: true }]);
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
            const merged = readMergedAiPrompts(context, project);
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
            expect(merged).toEqual([{ id: 'g1', title: 'G1', prompt: 'g1', pinned: true }]);
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

            const remaining = await deleteAiPromptById(context, project, 'a');

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

            const remaining = await deleteAiPromptById(context, project, 'g');

            expect(memento._store.get('demoBuilder.ai.globalPrompts')).toEqual([]);
            expect(project.aiPrompts).toEqual([{ id: 'p', title: 'P', prompt: 'p' }]);
            expect(remaining).toEqual([{ id: 'p', title: 'P', prompt: 'p' }]);
        });

        it('removes from both stores when the id is (defensively) present in each', async () => {
            const { context, project, memento } = makeScopedContext({
                projectPrompts: [{ id: 'dup', title: 'Project', prompt: 'p' }],
                globalPrompts: [{ id: 'dup', title: 'Global', prompt: 'g', pinned: true }],
            });

            const remaining = await deleteAiPromptById(context, project, 'dup');

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
            expect(remaining).toEqual([{ id: 'g2', title: 'G2', prompt: 'g2', pinned: true }]);
        });
    });
});
