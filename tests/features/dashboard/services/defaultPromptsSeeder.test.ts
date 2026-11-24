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
import { DRAFT_BLOCK_EXAMPLES_PROMPT } from '@/features/dashboard/services/draftBlockExamplesPrompt';
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
/** The user's own copy of every default, under the defaults' ids. */
const USER_COPIES: AiPrompt[] = DEFAULT_IDS.map(id => ({ id, title: 'User copy', prompt: 'edited', pinned: true }));

// EDS-71 step 4c: the prompt the dashboard's Draft Examples tile sends, in the prompts list too.
describe('the Draft Block Examples starter prompt', () => {
    it('is seeded with the words the tile sends', () => {
        const draft = DEFAULT_AI_PROMPTS.find(p => p.id === DRAFT_BLOCK_EXAMPLES_PROMPT.id);

        expect(draft).toStrictEqual({
            id: 'demo-builder-draft-block-examples',
            title: 'Draft Block Examples',
            prompt:
                'Write an example page for each block in this storefront that has none. Read each '
                + "block's code and description, and show me each page before you save it.",
            pinned: true,
        });
    });
});

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
        expect((gs._store.get(GLOBAL_AI_PROMPTS_KEY) as AiPrompt[])).toHaveLength(DEFAULT_AI_PROMPTS.length);
    });

    it('does NOT resurrect a starter prompt the user deleted (ledger blocks re-seed)', async () => {
        const gs = makeGlobalState();
        await seedDefaultAiPrompts(gs);

        // User deletes the seeded prompt from the global store.
        gs._store.set(GLOBAL_AI_PROMPTS_KEY, []);

        await seedDefaultAiPrompts(gs);

        expect(gs._store.get(GLOBAL_AI_PROMPTS_KEY)).toStrictEqual([]);
    });

    it('does not write the prompt store at all when every default is already present', async () => {
        // The store write is guarded on there being something to add. Without that
        // guard the seeder rewrites the global prompt list on activation with a
        // value it did not change — a needless globalState write on every launch,
        // and one that would clobber a concurrent edit. Asserting the ARGUMENTS
        // the Memento receives is the only way to see it; the resulting store
        // contents are identical either way.
        const gs = makeGlobalState({ [GLOBAL_AI_PROMPTS_KEY]: USER_COPIES });

        await seedDefaultAiPrompts(gs);

        expect(gs.update).not.toHaveBeenCalledWith(GLOBAL_AI_PROMPTS_KEY, expect.anything());
        expect(gs.update).toHaveBeenCalledTimes(1);
        expect(gs.update).toHaveBeenCalledWith(SEEDED_DEFAULT_PROMPT_IDS_KEY, DEFAULT_IDS);
    });

    it('ledgers a default without duplicating it when the id already exists in the store', async () => {
        const gs = makeGlobalState({ [GLOBAL_AI_PROMPTS_KEY]: USER_COPIES });

        await seedDefaultAiPrompts(gs);

        // No duplicate id, user's copies preserved, and every id is ledgered as seeded.
        expect(gs._store.get(GLOBAL_AI_PROMPTS_KEY)).toEqual(USER_COPIES);
        expect(gs._store.get(SEEDED_DEFAULT_PROMPT_IDS_KEY)).toEqual(DEFAULT_IDS);
    });
});
