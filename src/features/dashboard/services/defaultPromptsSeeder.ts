/**
 * Default AI prompts — seeded once into the global prompt store.
 *
 * The prompt library has no source seed: entries are user-created and live in
 * globalState (pinned/global scope) or the project manifest (project scope). To
 * ship a ready-made recipe in every project's library, we seed it once into the
 * GLOBAL store at activation. Global prompts surface across every project (that
 * is the store's whole purpose), so existing projects get it too — no per-project
 * write, no creation-flow change.
 *
 * Seeding is guarded by a per-id ledger: each default is recorded after its first
 * seed and never re-added. So a user who deletes a starter prompt keeps it
 * deleted, and new defaults can ship in a later release without disturbing
 * prompts already in the store. Reuses the existing global store + merge — the
 * CRUD/read paths treat a seeded prompt as an ordinary global prompt.
 */

import { GLOBAL_AI_PROMPTS_KEY } from '../handlers/aiHandlers';
import type { AiPrompt } from '@/types/base';

/** globalState key holding the ids of defaults already seeded (the dedup ledger). */
export const SEEDED_DEFAULT_PROMPT_IDS_KEY = 'demoBuilder.ai.seededDefaultPromptIds';

/**
 * Built-in starter prompts. Pinned, because the scope rule stores pinned prompts
 * in the global store (visible in every project). The create-eds-project prompt
 * pairs with the create-eds-project skill written into each project's
 * `.claude/skills/`.
 */
export const DEFAULT_AI_PROMPTS: readonly AiPrompt[] = [
    {
        id: 'demo-builder-create-eds-project',
        title: 'Create an EDS demo project',
        prompt:
            'Create a new Edge Delivery (EDS) Demo Builder project. Ask me for the ' +
            "project name, demo package, and stack if you don't already have them, plus " +
            'the GitHub repo name and the DA.live org and site for the storefront. Then ' +
            'follow the create-eds-project skill: call the create_project MCP tool ' +
            'headlessly with confirm:true; if it reports needsAuth, tell me which sign-in ' +
            'is required and wait for my go-ahead before opening any browser; relay the ' +
            'per-phase progress in plain language; and if a step fails, fix the cause it ' +
            'points to and re-run the same call (re-running is safe — completed steps are ' +
            'skipped). When it succeeds, summarize the new project and its repo URL, and ' +
            'ask before opening it in the IDE.',
        pinned: true,
    },
];

/** Minimal structural view of `vscode.Memento` — keeps the seeder vscode-free and unit-testable. */
interface GlobalStateLike {
    get<T>(key: string, defaultValue: T): T;
    update(key: string, value: unknown): Thenable<void>;
}

/**
 * Seed any not-yet-seeded {@link DEFAULT_AI_PROMPTS} into the global prompt store.
 *
 * Idempotent and safe to call on every activation: each default id is recorded in
 * a ledger and never re-added (so a deleted starter prompt stays deleted), and a
 * default whose id already exists in the store is ledgered without duplicating it.
 */
export async function seedDefaultAiPrompts(globalState: GlobalStateLike): Promise<void> {
    const seededIds = globalState.get<string[]>(SEEDED_DEFAULT_PROMPT_IDS_KEY, []);
    const unseeded = DEFAULT_AI_PROMPTS.filter(p => !seededIds.includes(p.id));
    if (unseeded.length === 0) {
        return;
    }

    const existing = globalState.get<AiPrompt[]>(GLOBAL_AI_PROMPTS_KEY, []);
    const existingIds = new Set(existing.map(p => p.id));
    const toAdd = unseeded.filter(p => !existingIds.has(p.id));

    if (toAdd.length > 0) {
        await globalState.update(GLOBAL_AI_PROMPTS_KEY, [...existing, ...toAdd]);
    }
    // Ledger every unseeded id — including any skipped because the user already
    // had that id — so we never retry the seed on a later activation.
    await globalState.update(SEEDED_DEFAULT_PROMPT_IDS_KEY, [
        ...seededIds,
        ...unseeded.map(p => p.id),
    ]);
}
