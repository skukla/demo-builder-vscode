/**
 * The GUARDS inside the read-tool projectors — every path where shaping must
 * step aside rather than reshape what it was handed.
 *
 * WHY THESE ARE THEIR OWN SUITE. `readDescriptors.test.ts` covers what each
 * projector does with a well-formed payload, which is the easy half. The half
 * that bites is the other one: a projector that reshapes a FAILURE turns an
 * error into a plausible-looking success, and a projector that assumes a field
 * is present throws inside the MCP dispatch loop, where the agent sees a tool
 * that simply stopped answering.
 *
 * A failure carrying rows is the case worth naming. `defaultShape` returns a
 * structured failure WHOLE (dataInstallerHandlers' headless branch returns
 * `{success:false, error, code, needsAuth}` deliberately), so "is this a
 * failure?" has to be asked before "does it have items?" — otherwise the rows
 * get projected and the envelope reads as a result.
 */

import { READ_DESCRIPTORS } from '@/features/ai/server/readDescriptors';
import type { HandlerResponse } from '@/types/handlers';

const shapeOf = (tool: string) => READ_DESCRIPTORS.find((d) => d.tool === tool)!.shape!;
const schemaOf = (tool: string) => READ_DESCRIPTORS.find((d) => d.tool === tool)!.inputSchema!;
const parsed = (tool: string, res: HandlerResponse, args: Record<string, unknown> = {}) =>
    JSON.parse(shapeOf(tool)(res, args));

describe('a failure is never projected into a success envelope', () => {
    // Both rows carry the dashboard-only fields the projector would strip. If
    // the failure guard is skipped the rows come back LEAN, which is how you
    // can tell the projector ran on something that was not a result.
    const FAILED_LIST: HandlerResponse = {
        success: false,
        error: 'Adobe sign-in required',
        code: 'AUTH_REQUIRED',
        items: [{ id: { name: 'bodea' }, art: { thumbnail: 'https://example.test/t.png' } }],
    };

    it.each(['find_datapacks', 'list_installed_datapacks'])(
        '%s returns the failure whole, rows unprojected',
        (tool) => {
            const out = parsed(tool, FAILED_LIST);
            expect(out.error).toBe('Adobe sign-in required');
            expect(out.code).toBe('AUTH_REQUIRED');
            // Untouched: art is still there, and no dataTypeCount was invented.
            expect(out.items[0].art).toEqual({ thumbnail: 'https://example.test/t.png' });
            expect(out.items[0]).not.toHaveProperty('dataTypeCount');
        },
    );

    it('list_console_apis returns the failure whole, without a group legend', () => {
        const out = parsed('list_console_apis', {
            success: false,
            error: 'workspace unreachable',
            apis: [{ code: 'A', name: 'Alpha', group: { code: 'g1', name: 'Group One' } }],
        });
        expect(out.error).toBe('workspace unreachable');
        expect(out).not.toHaveProperty('groups');
        expect(out.apis[0].group).toEqual({ code: 'g1', name: 'Group One' });
    });

    it('list_ai_prompts returns the failure whole, bodies untrimmed', () => {
        const out = parsed('list_ai_prompts', {
            success: false,
            error: 'no project open',
            aiPrompts: [{ id: 'p1', title: 'T', prompt: 'y'.repeat(400) }],
        });
        expect(out.error).toBe('no project open');
        expect(out.aiPrompts[0].prompt).toHaveLength(400);
        expect(out.aiPrompts[0]).not.toHaveProperty('preview');
    });

    it('verify_ai_setup returns the failure whole rather than counting it', () => {
        const out = parsed('verify_ai_setup', {
            success: false,
            error: 'no project open',
            inventory: { skills: [{ name: 'a' }] },
        });
        expect(out.error).toBe('no project open');
        expect(out.inventory).toEqual({ skills: [{ name: 'a' }] });
        expect(out).not.toHaveProperty('inventoryDetail');
    });
});

describe('verify_ai_setup inventory guard', () => {
    const shape = () => shapeOf('verify_ai_setup');

    it('leaves a response with no inventory alone', () => {
        const out = parsed('verify_ai_setup', { success: true, data: { status: 'ok' } });
        expect(out).toEqual({ status: 'ok' });
    });

    // A null inventory is the case the `||` exists for: `typeof null` is
    // 'object', so the second test alone would let it through to
    // Object.entries(null).
    it('leaves a null inventory alone rather than iterating it', () => {
        const out = parsed('verify_ai_setup', {
            success: true,
            data: { status: 'ok', inventory: null },
        });
        expect(out).toEqual({ status: 'ok', inventory: null });
    });

    it('leaves an inventory that is not an object alone', () => {
        const out = parsed('verify_ai_setup', {
            success: true,
            data: { status: 'ok', inventory: 'none' },
        });
        expect(out).toEqual({ status: 'ok', inventory: 'none' });
    });

    // A handler that answers `{success:true, data:null}` has no payload to read
    // the inventory off at all.
    it('survives a response whose data is null', () => {
        expect(shape()({ success: true, data: null }, {})).toBe('null');
    });

    // Only arrays become counts. A scalar or object under `inventory` is not a
    // listing, and reporting `undefined` for its length would be a made-up number.
    it('counts only the array members of the inventory', () => {
        const out = parsed('verify_ai_setup', {
            success: true,
            data: {
                status: 'ok',
                inventory: { skills: [{ name: 'a' }], generatedAt: '2026-01-01', meta: { v: 1 } },
            },
        });
        expect(out.inventory).toEqual({ skills: 1 });
    });
});

describe('list_console_apis guards', () => {
    const shape = () => shapeOf('list_console_apis');

    it('leaves a response with no apis array alone', () => {
        expect(parsed('list_console_apis', { success: true, data: { ok: true } })).toEqual({
            ok: true,
        });
    });

    it('survives a response whose data is null', () => {
        expect(shape()({ success: true, data: null }, {})).toBe('null');
    });

    // A row with no group must not put an `undefined` key in the legend, and
    // must not gain a `group` field it did not have.
    it('omits a row that carries no group from the legend and the row', () => {
        const out = parsed('list_console_apis', {
            success: true,
            data: { apis: [{ code: 'A', name: 'Alpha' }] },
        });
        expect(out.groups).toEqual({});
        expect(out.apis[0]).toEqual({ code: 'A', name: 'Alpha' });
    });

    // The legend needs BOTH halves: a code with no name would register an
    // entry mapping the code to undefined, which JSON.stringify drops — leaving
    // a legend that silently lost a group.
    it('registers no legend entry for a group with a code but no name', () => {
        const out = parsed('list_console_apis', {
            success: true,
            data: { apis: [{ code: 'A', name: 'Alpha', group: { code: 'g1' } }] },
        });
        expect(out.groups).toEqual({});
        expect(out.apis[0].group).toBe('g1');
    });

    it('trims surrounding whitespace off the search term', () => {
        const out = parsed(
            'list_console_apis',
            {
                success: true,
                data: {
                    apis: [
                        { code: 'FireflyAPI', name: 'Firefly Services' },
                        { code: 'AnalyticsSDK', name: 'Adobe Analytics' },
                    ],
                },
            },
            { search: '  firefly  ' },
        );
        expect(out.apis).toHaveLength(1);
        expect(out.search).toBe('firefly');
    });

    // The predicate has to check that a field IS a string before lowercasing
    // it: `some` reaches the third field only when the first two miss, and a
    // row with no group has `undefined` there.
    it('skips a non-string field instead of lowercasing it', () => {
        const out = parsed(
            'list_console_apis',
            {
                success: true,
                data: {
                    apis: [
                        { code: 'FireflyAPI', name: 'Firefly Services', group: { code: 'ff', name: 'Firefly' } },
                        { code: 'Zed', name: 'Zed Service' },
                    ],
                },
            },
            { search: 'firefly' },
        );
        expect(out.apis).toHaveLength(1);
        expect(out.matched).toBe(1);
        expect(out.totalUnfiltered).toBe(2);
    });
});

describe('list_ai_prompts guards', () => {
    const shape = () => shapeOf('list_ai_prompts');

    it('leaves a response with no aiPrompts array alone', () => {
        expect(parsed('list_ai_prompts', { success: true, data: { ok: true } })).toEqual({
            ok: true,
        });
    });

    it('survives a response whose data is null', () => {
        expect(shape()({ success: true, data: null }, {})).toBe('null');
    });

    const INDEX: HandlerResponse = {
        success: true,
        data: { aiPrompts: [{ id: 'p1', title: 'Only one', prompt: 'body' }] },
    };

    // `promptId` is declared as a string; anything else is not an id, and
    // looking one up by it would answer "Unknown promptId" for a caller that
    // asked for the index.
    it('falls back to the index when promptId is not a string', () => {
        const out = parsed('list_ai_prompts', INDEX, { promptId: 42 });
        expect(out.aiPrompts).toHaveLength(1);
        expect(out.promptBodies).toMatch(/promptId/);
    });

    it('reports zero chars for a prompt with no body rather than throwing', () => {
        const out = parsed('list_ai_prompts', {
            success: true,
            data: { aiPrompts: [{ id: 'p1', title: 'Empty' }] },
        });
        expect(out.aiPrompts[0]).toEqual({ id: 'p1', title: 'Empty', chars: 0, preview: '' });
    });

    // Exactly at the preview length there is nothing elided, so appending the
    // ellipsis would claim a body is longer than it is.
    it('does not elide a body exactly as long as the preview', () => {
        const body = 'x'.repeat(100);
        const out = parsed('list_ai_prompts', {
            success: true,
            data: { aiPrompts: [{ id: 'p1', title: 'Exact', prompt: body }] },
        });
        expect(out.aiPrompts[0].preview).toBe(body);
        expect(out.aiPrompts[0].chars).toBe(100);
    });

    it('omits pinned entirely for an unpinned prompt', () => {
        const out = parsed('list_ai_prompts', INDEX);
        expect(out.aiPrompts[0]).not.toHaveProperty('pinned');
    });
});

describe('the operation-mode enum is the four modes the service supports', () => {
    it.each(['import', 'export', 'delete', 'validate'])('accepts %s', (mode) => {
        expect(schemaOf('list_datapack_data_types').operationMode.parse(mode)).toBe(mode);
    });

    it('rejects a mode the service has no type set for', () => {
        expect(() => schemaOf('list_datapack_data_types').operationMode.parse('reindex')).toThrow();
    });

    it('is the same enum on get_datapack_activity, there optional', () => {
        expect(schemaOf('get_datapack_activity').operationMode.parse(undefined)).toBeUndefined();
        expect(schemaOf('get_datapack_activity').operationMode.parse('export')).toBe('export');
    });
});
