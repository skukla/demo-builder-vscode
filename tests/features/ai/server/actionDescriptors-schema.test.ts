/**
 * ACTION_DESCRIPTORS — the per-row CONTRACT every action tool is registered on.
 *
 * `actionDescriptors.test.ts` pins the catalog row by row in prose, one `it` per
 * interesting tool. This suite pins the fields that are the same question asked
 * of EVERY row, as tables, so a new row cannot be added without answering them
 * and an existing one cannot flip silently:
 *
 *   - `readOnly` / `needsAuth` — what the dry run and the auth guard read. A row
 *     that says `readOnly: true` skips the write gate; a row that says
 *     `needsAuth: false` when it calls Adobe reaches the SDK with no token.
 *   - `inputSchema` key set — what an agent may send. An emptied schema is not a
 *     compile error and not a test failure anywhere else: zod strips unknown
 *     keys, so the tool keeps registering and the handler receives `{}`.
 *   - the zod shapes themselves — nested objects and the `.min(1)` guards, both
 *     asserted by PARSING, because that is the only thing registration does
 *     with them.
 *
 * Measured 2026-09-05: these tables account for 58 mutants that survived every
 * other suite in the module (PL-22).
 */

import type { AuthProvider } from '@/features/ai/server/mcpToolServer';

import { actionRow as row, actionRows } from './actionDescriptors.testUtils';

/**
 * Which sign-in each action needs. `['adobe']` means the tool reaches Adobe
 * Console / Runtime / IMS in the handler it dispatches into; `false` means it
 * stays on the local machine (disk, saved state, the demo server process).
 */
const NEEDS_AUTH: Record<string, AuthProvider[] | false> = {
    regenerate_ai_files: false,
    start_demo: false,
    add_integration: ['adobe'],
    rename_integration: false,
    set_console_apis: ['adobe'],
    set_project_destination: ['adobe'],
    deploy_integration: ['adobe'],
    redeploy_integration: ['adobe'],
    install_integration: ['adobe'],
    remove_integration: ['adobe'],
    stop_demo: false,
    restart_demo: false,
    set_current_project: false,
    set_project_pinned: false,
    rename_project: false,
    save_ai_prompt: false,
    delete_ai_prompt: false,
    deploy_mesh: ['adobe'],
    export_project_settings: false,
    refresh_block_library: false,
    delete_mesh: ['adobe'],
    add_console_apis: ['adobe'],
    install_prerequisite: false,
};

/** Exactly the arguments each action accepts; `[]` for a no-arg row. */
const INPUT_KEYS: Record<string, string[]> = {
    regenerate_ai_files: [],
    start_demo: [],
    add_integration: ['apis', 'id', 'instanceId', 'name', 'refreshCli', 'source'],
    rename_integration: ['id', 'name'],
    set_console_apis: ['apis', 'componentId'],
    set_project_destination: ['project', 'workspace'],
    deploy_integration: ['id', 'refreshCli'],
    redeploy_integration: ['id', 'refreshCli'],
    install_integration: ['id'],
    remove_integration: ['id'],
    stop_demo: [],
    restart_demo: [],
    set_current_project: ['projectPath'],
    set_project_pinned: ['pinned', 'projectPath'],
    rename_project: ['newName'],
    save_ai_prompt: ['prompt'],
    delete_ai_prompt: ['promptId'],
    deploy_mesh: [],
    export_project_settings: ['includeSecrets', 'path'],
    refresh_block_library: [],
    delete_mesh: ['workspaceId'],
    add_console_apis: ['apis'],
    install_prerequisite: ['prerequisiteId', 'version'],
};

describe('ACTION_DESCRIPTORS — per-row contract', () => {
    it('covers every shipped row in both tables', () => {
        const tools = actionRows().map((d) => d.tool).sort();
        // Control: without this, a table entry for a row that no longer exists
        // would pass every loop below by never being visited.
        expect(tools.length).toBeGreaterThan(0);
        expect(Object.keys(NEEDS_AUTH).sort()).toEqual(tools);
        expect(Object.keys(INPUT_KEYS).sort()).toEqual(tools);
    });

    it('declares every action row as a WRITE', () => {
        // The whole file is the action half of the tool surface — the read half
        // lives in readDescriptors.ts. `readOnly: true` here would exempt a row
        // from the dry-run write gate and mislabel its annotation.
        for (const d of actionRows()) {
            expect([d.tool, d.readOnly]).toEqual([d.tool, false]);
        }
    });

    it('declares the sign-in each row needs', () => {
        for (const d of actionRows()) {
            expect([d.tool, d.needsAuth]).toEqual([d.tool, NEEDS_AUTH[d.tool]]);
        }
    });

    it('accepts exactly the arguments its table row names', () => {
        for (const d of actionRows()) {
            expect([d.tool, Object.keys(d.inputSchema ?? {}).sort()]).toEqual([
                d.tool,
                INPUT_KEYS[d.tool],
            ]);
        }
    });

    /**
     * The nested objects, asserted by PARSING rather than by reading `.shape`.
     *
     * An emptied `z.object({})` still parses — it just STRIPS every field, so the
     * handler is handed `{}` and reports a missing value the agent did in fact
     * send. Round-tripping a payload is the only assertion that sees that.
     */
    describe('nested payload objects survive the parse they are registered with', () => {
        it('add_integration.source keeps owner and repo', () => {
            const source = row('add_integration').inputSchema!.source;
            expect(source.parse({ owner: 'acme', repo: 'widget' })).toEqual({
                owner: 'acme',
                repo: 'widget',
            });
            // Both halves are required — a source with no repo cannot be cloned.
            expect(source.safeParse({ owner: 'acme' }).success).toBe(false);
        });

        it('set_project_destination keeps the project and workspace ids', () => {
            const d = row('set_project_destination');
            for (const field of ['project', 'workspace'] as const) {
                const schema = d.inputSchema![field];
                expect(schema.parse({ id: 'p1', name: 'n', title: 't' })).toEqual({
                    id: 'p1',
                    name: 'n',
                    title: 't',
                });
                // The id is what the move targets; name/title are display only.
                expect(schema.safeParse({ name: 'n' }).success).toBe(false);
                expect(schema.safeParse({ id: 'p1' }).success).toBe(true);
            }
        });

        it('save_ai_prompt.prompt keeps id, title, body and the pinned flag', () => {
            const prompt = row('save_ai_prompt').inputSchema!.prompt;
            expect(prompt.parse({ id: 'p', title: 'T', prompt: 'B', pinned: true })).toEqual({
                id: 'p',
                title: 'T',
                prompt: 'B',
                pinned: true,
            });
            // `pinned` chooses global vs project-local; omitting it is legal and
            // must not be turned into `false` by the schema.
            expect(prompt.parse({ id: 'p', title: 'T', prompt: 'B' })).toEqual({
                id: 'p',
                title: 'T',
                prompt: 'B',
            });
            expect(prompt.safeParse({ id: 'p', title: 'T' }).success).toBe(false);
        });
    });

    /**
     * The `.min(1)` guards. Each one refuses an EMPTY value; none of them caps
     * the length, which is what makes the difference checkable — a real display
     * name or a two-code subscription has to pass.
     */
    describe('non-empty guards reject empty and accept real values', () => {
        it('rename_integration.name refuses an empty name', () => {
            const name = row('rename_integration').inputSchema!.name;
            expect(name.safeParse('').success).toBe(false);
            expect(name.parse('Checkout Extension')).toBe('Checkout Extension');
        });

        it('rename_project.newName refuses an empty name', () => {
            const newName = row('rename_project').inputSchema!.newName;
            expect(newName.safeParse('').success).toBe(false);
            expect(newName.parse('acme-summit-demo')).toBe('acme-summit-demo');
        });

        it('add_console_apis.apis refuses an empty list and takes several codes', () => {
            // add_console_apis is add-ONLY: an empty list would be a call that
            // subscribes nothing. Clearing extras is set_console_apis's job, and
            // that row deliberately allows `[]`.
            const apis = row('add_console_apis').inputSchema!.apis;
            expect(apis.safeParse([]).success).toBe(false);
            expect(apis.parse(['AdobeAnalyticsSDK', 'FireflyAPI'])).toEqual([
                'AdobeAnalyticsSDK',
                'FireflyAPI',
            ]);
        });

        it('set_console_apis.apis DOES take an empty list — that is how extras are cleared', () => {
            const apis = row('set_console_apis').inputSchema!.apis;
            expect(apis.parse([])).toEqual([]);
        });
    });
});
