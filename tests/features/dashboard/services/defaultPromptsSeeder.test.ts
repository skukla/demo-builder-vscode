/**
 * defaultPromptsSeeder tests — one-time seeding of built-in prompts into the
 * global store, with a per-id ledger that makes re-seeding (and resurrecting a
 * deleted starter prompt) impossible.
 */

import {
    DEFAULT_AI_PROMPTS,
    SEEDED_DEFAULT_PROMPT_IDS_KEY,
    seedDefaultAiPrompts,
} from '@/features/dashboard/services/defaultPromptsSeeder';
import { GLOBAL_AI_PROMPTS_KEY } from '@/features/dashboard/handlers/aiHandlers';
import type { AiPrompt } from '@/types/base';

/** In-memory Memento double matching the structural GlobalStateLike shape. */
function makeGlobalState(seed: Record<string, unknown> = {}) {
    const store = new Map<string, unknown>(Object.entries(seed));
    return {
        _store: store,
        get<T>(key: string, defaultValue: T): T {
            return store.has(key) ? (store.get(key) as T) : defaultValue;
        },
        update: jest.fn(async (key: string, value: unknown) => {
            store.set(key, value);
        }),
    };
}

const DEFAULT_IDS = DEFAULT_AI_PROMPTS.map(p => p.id);

describe('seedDefaultAiPrompts', () => {
    it('adds every default to an empty global store and records the ledger', async () => {
        const gs = makeGlobalState();

        await seedDefaultAiPrompts(gs);

        expect(gs._store.get(GLOBAL_AI_PROMPTS_KEY)).toEqual([...DEFAULT_AI_PROMPTS]);
        expect(gs._store.get(SEEDED_DEFAULT_PROMPT_IDS_KEY)).toEqual(DEFAULT_IDS);
    });

    it('seeds prompts that are pinned (so they live in the global store)', async () => {
        const gs = makeGlobalState();

        await seedDefaultAiPrompts(gs);

        const seeded = gs._store.get(GLOBAL_AI_PROMPTS_KEY) as AiPrompt[];
        expect(seeded.every(p => p.pinned === true)).toBe(true);
    });

    it('appends to existing global prompts without clobbering them', async () => {
        const existing: AiPrompt[] = [{ id: 'mine', title: 'Mine', prompt: 'm', pinned: true }];
        const gs = makeGlobalState({ [GLOBAL_AI_PROMPTS_KEY]: existing });

        await seedDefaultAiPrompts(gs);

        expect(gs._store.get(GLOBAL_AI_PROMPTS_KEY)).toEqual([...existing, ...DEFAULT_AI_PROMPTS]);
    });

    it('is a no-op on a second call (idempotent — nothing re-added)', async () => {
        const gs = makeGlobalState();

        await seedDefaultAiPrompts(gs);
        gs.update.mockClear();
        await seedDefaultAiPrompts(gs);

        expect(gs.update).not.toHaveBeenCalled();
        expect((gs._store.get(GLOBAL_AI_PROMPTS_KEY) as AiPrompt[]).length).toBe(DEFAULT_AI_PROMPTS.length);
    });

    it('does NOT resurrect a starter prompt the user deleted (ledger blocks re-seed)', async () => {
        const gs = makeGlobalState();
        await seedDefaultAiPrompts(gs);

        // User deletes the seeded prompt from the global store.
        gs._store.set(GLOBAL_AI_PROMPTS_KEY, []);

        await seedDefaultAiPrompts(gs);

        expect(gs._store.get(GLOBAL_AI_PROMPTS_KEY)).toEqual([]);
    });

    it('ledgers a default without duplicating it when the id already exists in the store', async () => {
        const id = DEFAULT_IDS[0];
        const userCopy: AiPrompt[] = [{ id, title: 'User copy', prompt: 'edited', pinned: true }];
        const gs = makeGlobalState({ [GLOBAL_AI_PROMPTS_KEY]: userCopy });

        await seedDefaultAiPrompts(gs);

        // No duplicate id, user's copy preserved, and the id is ledgered as seeded.
        expect(gs._store.get(GLOBAL_AI_PROMPTS_KEY)).toEqual(userCopy);
        expect(gs._store.get(SEEDED_DEFAULT_PROMPT_IDS_KEY)).toEqual(DEFAULT_IDS);
    });
});
