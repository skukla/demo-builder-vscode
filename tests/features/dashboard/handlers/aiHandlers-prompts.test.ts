/**
 * aiHandlers Tests — Prompt CRUD & scope
 *
 * handleDeleteAiPrompt, handleListAiPrompts, pin-aware ordering, and the full
 * pin/unpin/delete scope flow. Shared setup lives in aiHandlers.testUtils.ts.
 */

import {
    handleSaveAiPrompt,
    handleDeleteAiPrompt,
    handleListAiPrompts,
    createMockContext,
    makeScopedContext,
} from './aiHandlers.testUtils';
import type { HandlerContext } from './aiHandlers.testUtils';

describe('aiHandlers — prompt CRUD & scope', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('handleDeleteAiPrompt', () => {
        it('removes the prompt with the matching id and persists', async () => {
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

            const result = await handleDeleteAiPrompt(context, { promptId: 'a' });

            expect(saveProject).toHaveBeenCalledTimes(1);
            const saved = saveProject.mock.calls[0][0];
            expect(saved.aiPrompts).toEqual([{ id: 'b', title: 'B', prompt: 'b' }]);
            expect(result).toEqual({
                success: true,
                aiPrompts: [{ id: 'b', title: 'B', prompt: 'b' }],
            });
        });

        it('returns success: false when promptId is missing', async () => {
            const context = createMockContext();
            const result = await handleDeleteAiPrompt(context, undefined as never);
            expect(result.success).toBe(false);
        });

        it('returns project-not-found when no current project is loaded', async () => {
            const context = createMockContext({
                stateManager: {
                    getCurrentProject: jest.fn().mockResolvedValue(null),
                    saveProject: jest.fn(),
                } as unknown as HandlerContext['stateManager'],
            });
            const result = await handleDeleteAiPrompt(context, { promptId: 'a' });
            expect(result.success).toBe(false);
        });

        it('returns the empty array when project has no aiPrompts', async () => {
            const saveProject = jest.fn().mockResolvedValue(undefined);
            const context = createMockContext({
                stateManager: {
                    getCurrentProject: jest.fn().mockResolvedValue({
                        name: 'p',
                        path: '/projects/p',
                    }),
                    saveProject,
                } as unknown as HandlerContext['stateManager'],
            });
            const result = await handleDeleteAiPrompt(context, { promptId: 'a' });
            expect(result.success).toBe(true);
            expect(result.aiPrompts).toEqual([]);
        });

        // ── Global-pin-store scope-aware delete ───────────────────────────
        it('deletes a project-only prompt from the project store; global untouched', async () => {
            const { context, project, memento } = makeScopedContext({
                projectPrompts: [
                    { id: 'a', title: 'A', prompt: 'a' },
                    { id: 'b', title: 'B', prompt: 'b' },
                ],
                globalPrompts: [{ id: 'g', title: 'G', prompt: 'g', pinned: true }],
            });
            await handleDeleteAiPrompt(context, { promptId: 'a' });
            expect(project.aiPrompts).toEqual([{ id: 'b', title: 'B', prompt: 'b' }]);
            expect(memento._store.get('demoBuilder.ai.globalPrompts')).toEqual([
                { id: 'g', title: 'G', prompt: 'g', pinned: true },
            ]);
        });

        it('deletes a global-only prompt from globalState; project untouched', async () => {
            const { context, project, memento } = makeScopedContext({
                projectPrompts: [{ id: 'p', title: 'P', prompt: 'p' }],
                globalPrompts: [
                    { id: 'g1', title: 'G1', prompt: 'g1', pinned: true },
                    { id: 'g2', title: 'G2', prompt: 'g2', pinned: true },
                ],
            });
            await handleDeleteAiPrompt(context, { promptId: 'g1' });
            expect(memento._store.get('demoBuilder.ai.globalPrompts')).toEqual([
                { id: 'g2', title: 'G2', prompt: 'g2', pinned: true },
            ]);
            expect(project.aiPrompts).toEqual([{ id: 'p', title: 'P', prompt: 'p' }]);
        });

        it('removes the prompt from BOTH stores when (defensively) it exists in each', async () => {
            const { context, project, memento } = makeScopedContext({
                projectPrompts: [{ id: 'dup', title: 'Project copy', prompt: 'p' }],
                globalPrompts: [{ id: 'dup', title: 'Global copy', prompt: 'g', pinned: true }],
            });
            await handleDeleteAiPrompt(context, { promptId: 'dup' });
            expect(memento._store.get('demoBuilder.ai.globalPrompts')).toEqual([]);
            expect(project.aiPrompts).toEqual([]);
        });

        it('is a no-op (success, no error) when the prompt id exists in neither store', async () => {
            const { context, saveProject, memento } = makeScopedContext({
                projectPrompts: [{ id: 'p', title: 'P', prompt: 'p' }],
                globalPrompts: [{ id: 'g', title: 'G', prompt: 'g', pinned: true }],
            });
            const updateSpy = memento.update;
            const result = await handleDeleteAiPrompt(context, { promptId: 'nope' });
            expect(result.success).toBe(true);
            // No writes to either store when nothing was found
            expect(saveProject).not.toHaveBeenCalled();
            expect(updateSpy).not.toHaveBeenCalled();
            // Returns the merged list unchanged — global first, then project
            expect(result.aiPrompts).toEqual([
                { id: 'g', title: 'G', prompt: 'g', pinned: true },
                { id: 'p', title: 'P', prompt: 'p' },
            ]);
        });
    });

    describe('handleListAiPrompts', () => {
        it('returns the project.aiPrompts array', async () => {
            const prompts = [
                { id: 'a', title: 'A', prompt: 'a' },
                { id: 'b', title: 'B', prompt: 'b' },
            ];
            const context = createMockContext({
                stateManager: {
                    getCurrentProject: jest.fn().mockResolvedValue({
                        name: 'p',
                        path: '/projects/p',
                        aiPrompts: prompts,
                    }),
                    saveProject: jest.fn(),
                } as unknown as HandlerContext['stateManager'],
            });

            const result = await handleListAiPrompts(context);
            expect(result).toEqual({ success: true, aiPrompts: prompts });
        });

        it('returns an empty array when aiPrompts is undefined', async () => {
            const context = createMockContext({
                stateManager: {
                    getCurrentProject: jest.fn().mockResolvedValue({
                        name: 'p',
                        path: '/projects/p',
                    }),
                    saveProject: jest.fn(),
                } as unknown as HandlerContext['stateManager'],
            });

            const result = await handleListAiPrompts(context);
            expect(result).toEqual({ success: true, aiPrompts: [] });
        });

        it('returns project-not-found when no current project', async () => {
            const context = createMockContext({
                stateManager: {
                    getCurrentProject: jest.fn().mockResolvedValue(null),
                    saveProject: jest.fn(),
                } as unknown as HandlerContext['stateManager'],
            });
            const result = await handleListAiPrompts(context);
            expect(result.success).toBe(false);
        });

        // ── Global-pin-store merging ──────────────────────────────────────
        it('returns merged list (globals first, then project) when both stores have entries', async () => {
            const { context } = makeScopedContext({
                projectPrompts: [
                    { id: 'p1', title: 'Project 1', prompt: 'p1' },
                    { id: 'p2', title: 'Project 2', prompt: 'p2' },
                ],
                globalPrompts: [
                    { id: 'g1', title: 'Global 1', prompt: 'g1', pinned: true },
                ],
            });
            const result = await handleListAiPrompts(context);
            expect(result.success).toBe(true);
            expect(result.aiPrompts).toEqual([
                { id: 'g1', title: 'Global 1', prompt: 'g1', pinned: true },
                { id: 'p1', title: 'Project 1', prompt: 'p1' },
                { id: 'p2', title: 'Project 2', prompt: 'p2' },
            ]);
        });

        it('returns only global prompts when the project has no prompts', async () => {
            const { context } = makeScopedContext({
                globalPrompts: [
                    { id: 'g1', title: 'Global', prompt: 'g1', pinned: true },
                ],
            });
            const result = await handleListAiPrompts(context);
            expect(result.aiPrompts).toEqual([
                { id: 'g1', title: 'Global', prompt: 'g1', pinned: true },
            ]);
        });

        it('dedups by id when the same id appears in both stores (global wins)', async () => {
            const { context } = makeScopedContext({
                projectPrompts: [
                    { id: 'dup', title: 'Stale project copy', prompt: 'stale' },
                ],
                globalPrompts: [
                    { id: 'dup', title: 'Fresh global copy', prompt: 'fresh', pinned: true },
                ],
            });
            const result = await handleListAiPrompts(context);
            expect(result.aiPrompts).toEqual([
                { id: 'dup', title: 'Fresh global copy', prompt: 'fresh', pinned: true },
            ]);
        });
    });

    // Pin-aware ordering inside the project store still applies for legacy
    // pinned-in-project prompts (no auto-migration). The three "new pinned"
    // and "flip false→true" cases moved to the global-pin-store tests above —
    // those scenarios now cross scopes, not just sort within a single array.
    describe('handleSaveAiPrompt — pin-aware ordering (G2, legacy project store)', () => {
        function makeContext(aiPrompts: unknown[]) {
            const saveProject = jest.fn().mockResolvedValue(undefined);
            const project = { name: 'p', path: '/projects/p', aiPrompts };
            const context = createMockContext({
                stateManager: {
                    getCurrentProject: jest.fn().mockResolvedValue(project),
                    saveProject,
                } as unknown as HandlerContext['stateManager'],
            });
            return { context, saveProject };
        }

        it('replaces a legacy pinned-in-project prompt in place when the user unpins it (no migration)', async () => {
            // Legacy data: the prompt was pinned BEFORE the global-store
            // feature shipped, so it lives in the project array with
            // `pinned: true`. Unpinning it does NOT cross scopes — it stays
            // in the project store with `pinned: false`. The render layer's
            // pinned-first sort handles visual ordering, so no array
            // re-shuffle is needed here.
            const { context, saveProject } = makeContext([
                { id: 'p1', title: 'P1', prompt: 'p1', pinned: true },
                { id: 'p2', title: 'P2', prompt: 'p2', pinned: true },
                { id: 'a', title: 'A', prompt: 'a' },
                { id: 'b', title: 'B', prompt: 'b' },
            ]);
            await handleSaveAiPrompt(context, {
                prompt: { id: 'p1', title: 'P1', prompt: 'p1', pinned: false },
            });
            const saved = saveProject.mock.calls[0][0];
            expect(saved.aiPrompts).toEqual([
                { id: 'p1', title: 'P1', prompt: 'p1', pinned: false },
                { id: 'p2', title: 'P2', prompt: 'p2', pinned: true },
                { id: 'a', title: 'A', prompt: 'a' },
                { id: 'b', title: 'B', prompt: 'b' },
            ]);
        });

        it('replaces in place when pin state is unchanged', async () => {
            const { context, saveProject } = makeContext([
                { id: 'a', title: 'A', prompt: 'a' },
                { id: 'b', title: 'B', prompt: 'b' },
            ]);
            await handleSaveAiPrompt(context, {
                prompt: { id: 'a', title: 'A2', prompt: 'a2' },
            });
            const saved = saveProject.mock.calls[0][0];
            // Position 0 preserved; only fields changed.
            expect(saved.aiPrompts).toEqual([
                { id: 'a', title: 'A2', prompt: 'a2' },
                { id: 'b', title: 'B', prompt: 'b' },
            ]);
        });
    });

    // ==========================================================
    // End-to-end flow: create → pin (project→global) → list → unpin → delete
    // ==========================================================

    describe('AI prompt scope — full pin/unpin/delete flow', () => {
        it('walks a prompt through every scope transition and ends with the stores empty', async () => {
            const { context, project, memento } = makeScopedContext();

            // 1. Create unpinned prompt → lives in project
            await handleSaveAiPrompt(context, {
                prompt: { id: 'x', title: 'X', prompt: 'x' },
            });
            expect(project.aiPrompts).toEqual([{ id: 'x', title: 'X', prompt: 'x' }]);
            expect(memento._store.get('demoBuilder.ai.globalPrompts')).toEqual([]);

            // 2. Pin it → migrates to global, removed from project
            await handleSaveAiPrompt(context, {
                prompt: { id: 'x', title: 'X', prompt: 'x', pinned: true },
            });
            expect(project.aiPrompts).toEqual([]);
            expect(memento._store.get('demoBuilder.ai.globalPrompts')).toEqual([
                { id: 'x', title: 'X', prompt: 'x', pinned: true },
            ]);

            // 3. List returns it once, with pinned: true
            const listed = await handleListAiPrompts(context);
            expect(listed.aiPrompts).toEqual([
                { id: 'x', title: 'X', prompt: 'x', pinned: true },
            ]);

            // 4. Unpin → migrates back to current project
            await handleSaveAiPrompt(context, {
                prompt: { id: 'x', title: 'X', prompt: 'x', pinned: false },
            });
            expect(memento._store.get('demoBuilder.ai.globalPrompts')).toEqual([]);
            expect(project.aiPrompts).toEqual([
                { id: 'x', title: 'X', prompt: 'x', pinned: false },
            ]);

            // 5. Delete → gone from both stores
            await handleDeleteAiPrompt(context, { promptId: 'x' });
            expect(project.aiPrompts).toEqual([]);
            expect(memento._store.get('demoBuilder.ai.globalPrompts')).toEqual([]);
        });
    });

    // ==========================================================
    // Surface-agnostic kebab + sessions browser handlers
    // ==========================================================

});
