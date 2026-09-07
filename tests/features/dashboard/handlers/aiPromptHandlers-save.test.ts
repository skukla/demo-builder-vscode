/**
 * aiPromptHandlers — handleSaveAiPrompt: stores, scope routing, cross-scope moves
 *
 * Split out of `aiHandlers-launch.test.ts` on 2026-09-07: the subject is defined
 * in `aiPromptHandlers.ts`, and suites are credited to modules by filename, so
 * every kill here was being scored against a module that only re-exports it.
 *
 * The routing decision under test is `targetIsGlobal` — pinned prompts go to
 * globalState, unpinned ones to the project manifest, and legacy prompts already
 * pinned INSIDE a project manifest stay there. Several cases assert that a store
 * was NOT written (`saveProject` / `globalState.update` not called) rather than
 * only what it holds: an unnecessary write is invisible in the resulting content
 * and is exactly what the guards at the end of the handler exist to prevent.
 */

// The mock preamble lives in aiHandlers.testUtils, so it must be required BEFORE
// the module under test — hence this import first. The subjects then come from the
// module that DECLARES them, which is also what pairs this suite to that module in
// the mutation configs (tests/sop/mutation-config-pairing.test.ts).
import { createAiHandlerContext, makeScopedContext } from './aiHandlers.testUtils';
import {
    handleSaveAiPrompt,
    handleListAiPrompts,
} from '@/features/dashboard/handlers/aiPromptHandlers';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

describe('aiPromptHandlers — save', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('handleSaveAiPrompt', () => {
        it('appends a new prompt to project.aiPrompts when id is not already present', async () => {
            const saveProject = jest.fn().mockResolvedValue(undefined);
            const project = { name: 'p', path: '/projects/p', aiPrompts: [] as unknown[] };
            const context = createAiHandlerContext({
                stateManager: createMockStateManager({
                    getCurrentProject: jest.fn().mockResolvedValue(project),
                    saveProject,
                }),
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
                verify: expect.stringContaining('re-check with list_ai_prompts'),
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
            const context = createAiHandlerContext({
                stateManager: createMockStateManager({
                    getCurrentProject: jest.fn().mockResolvedValue(project),
                    saveProject,
                }),
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
            expect(result.aiPrompts as unknown[]).toHaveLength(2);
        });

        it('returns success: false when prompt payload is missing', async () => {
            const context = createAiHandlerContext();
            const result = await handleSaveAiPrompt(context, undefined);
            expect(result.success).toBe(false);
        });

        it('returns success: false when prompt fields are missing', async () => {
            const context = createAiHandlerContext();
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
            const context = createAiHandlerContext({
                stateManager: createMockStateManager({
                    getCurrentProject,
                    saveProject,
                }),
            });

            await handleSaveAiPrompt(context, {
                prompt: { id: 'new', title: 'T', prompt: 'B' },
            });

            expect(getCurrentProject).toHaveBeenCalled();
            expect(saveProject.mock.calls[0][0].path).toBe('/safe/path');
        });

        it('returns project-not-found when no current project is loaded', async () => {
            const context = createAiHandlerContext({
                stateManager: createMockStateManager({
                    getCurrentProject: jest.fn().mockResolvedValue(null),
                    saveProject: jest.fn(),
                }),
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
            expect(project.aiPrompts).toEqual([{ id: 'p1', title: 'Unpinned', prompt: 'p' }]);
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
            const matches = (result.aiPrompts as { id: string }[]).filter((p) => p.id === 'x');
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

    // ==========================================================
    // Which prompt the handler treats as the PREVIOUS one, and
    // which store it therefore leaves alone
    // ==========================================================

    describe('handleSaveAiPrompt — the previous prompt is matched by id, not by position', () => {
        it('sends a new pinned prompt to the global store without writing the project manifest', async () => {
            // The project already holds an unrelated PINNED prompt. If the
            // handler took that one as the previous version of what is being
            // saved, it would read prevPinned = true and keep the new prompt in
            // the project store instead of pinning it globally.
            const { context, project, memento, saveProject } = makeScopedContext({
                projectPrompts: [{ id: 'other', title: 'Other', prompt: 'o', pinned: true }],
            });

            await handleSaveAiPrompt(context, {
                prompt: { id: 'new', title: 'New', prompt: 'n', pinned: true },
            });

            expect(memento._store.get('demoBuilder.ai.globalPrompts')).toEqual([
                { id: 'new', title: 'New', prompt: 'n', pinned: true },
            ]);
            expect(project.aiPrompts).toEqual([
                { id: 'other', title: 'Other', prompt: 'o', pinned: true },
            ]);
            // Nothing in the project manifest changed, so it must not be rewritten.
            expect(saveProject).not.toHaveBeenCalled();
        });

        it('keeps a legacy pinned-in-project prompt in the project even when unrelated global prompts exist', async () => {
            // prevPinned is read from the prompt with the SAME id. An unrelated
            // global entry must not supply it — reading `pinned: false` off that
            // one would migrate the legacy prompt out of the project manifest,
            // which is precisely the auto-migration the user opted out of.
            const { context, project, memento } = makeScopedContext({
                projectPrompts: [{ id: 'legacy', title: 'Legacy', prompt: 'l', pinned: true }],
                globalPrompts: [{ id: 'unrelated', title: 'U', prompt: 'u', pinned: false }],
            });

            await handleSaveAiPrompt(context, {
                prompt: { id: 'legacy', title: 'Legacy v2', prompt: 'l2', pinned: true },
            });

            expect(project.aiPrompts).toEqual([
                { id: 'legacy', title: 'Legacy v2', prompt: 'l2', pinned: true },
            ]);
            expect(memento._store.get('demoBuilder.ai.globalPrompts')).toEqual([
                { id: 'unrelated', title: 'U', prompt: 'u', pinned: false },
            ]);
        });

        it('does not rewrite the global store when the save only touches the project manifest', async () => {
            const { context, memento, saveProject } = makeScopedContext({
                globalPrompts: [{ id: 'g', title: 'G', prompt: 'g', pinned: true }],
            });

            await handleSaveAiPrompt(context, {
                prompt: { id: 'n', title: 'N', prompt: 'n' },
            });

            expect(saveProject).toHaveBeenCalledTimes(1);
            // The global list is unchanged, so it is not written back at all —
            // asserting only its contents would pass on a redundant write.
            expect(memento.update).not.toHaveBeenCalled();
        });

        it('saves into a project whose manifest has no aiPrompts array yet', async () => {
            const saveProject = jest.fn().mockResolvedValue(undefined);
            const context = createAiHandlerContext({
                stateManager: createMockStateManager({
                    // A project created before prompts existed: the field is absent.
                    getCurrentProject: jest.fn().mockResolvedValue({ name: 'p', path: '/projects/p' }),
                    saveProject,
                }),
            });

            const result = await handleSaveAiPrompt(context, {
                prompt: { id: 'first', title: 'First', prompt: 'f' },
            });

            expect(saveProject.mock.calls[0][0].aiPrompts).toEqual([
                { id: 'first', title: 'First', prompt: 'f' },
            ]);
            expect(result.aiPrompts).toEqual([{ id: 'first', title: 'First', prompt: 'f' }]);
        });
    });
});
