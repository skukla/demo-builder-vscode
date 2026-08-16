/**
 * READ_DESCRIPTORS — pin the read-tool catalog rows to their handler map/type.
 * Generic dispatch/shaping is covered in toolDescriptors.test.ts; here we assert
 * the catalog wiring so a row can't silently point at the wrong handler.
 */

import { READ_DESCRIPTORS } from '@/features/ai/server/readDescriptors';
import { dashboardHandlers } from '@/features/dashboard/handlers/dashboardHandlers';
import { edsHandlers } from '@/features/eds/handlers/edsHandlers';
import { meshHandlers } from '@/features/mesh/handlers';

function row(tool: string) {
    return READ_DESCRIPTORS.find((d) => d.tool === tool);
}

describe('READ_DESCRIPTORS', () => {
    it('exposes get_project_urls as a no-arg read dispatching to getProjectUrls', () => {
        const d = row('get_project_urls');
        expect(d).toBeDefined();
        expect(d!.map).toBe(dashboardHandlers);
        expect(d!.type).toBe('getProjectUrls');
        expect(d!.confirm).toBeUndefined();
        expect(d!.inputSchema).toBeUndefined();
    });

    it('exposes get_store_structure as a no-arg read dispatching to edsHandlers', () => {
        const d = row('get_store_structure');
        expect(d).toBeDefined();
        expect(d!.map).toBe(edsHandlers);
        expect(d!.type).toBe('get-store-structure');
        // No inputSchema: the project is the only input, and it comes from state.
        expect(d!.inputSchema).toBeUndefined();
    });

    // Regression: check_mesh shipped with no inputSchema at all. The registration
    // loop then dispatches `{}`, the handler found no workspaceId and every single
    // invocation came back "Invalid workspace ID: must be a non-empty string" —
    // the tool was advertised to agents and could not work. workspaceId is
    // declared optional (the handler falls back to the current project's), so the
    // assertion that matters is that the key EXISTS and is not required.
    it('exposes check_mesh with an optional workspaceId, not a bare no-arg row', () => {
        const d = row('check_mesh');
        expect(d).toBeDefined();
        expect(d!.map).toBe(meshHandlers);
        expect(d!.type).toBe('check-api-mesh');
        expect(d!.inputSchema).toBeDefined();
        expect(d!.inputSchema!.workspaceId).toBeDefined();
        expect(d!.inputSchema!.workspaceId.isOptional()).toBe(true);
    });

    it('never confirm-gates a read row', () => {
        for (const d of READ_DESCRIPTORS) {
            expect(d.confirm).toBeUndefined();
        }
    });
});

// ─── response shaping (phase 2) ──────────────────────────────────────────────
//
// These four tools were 78% of everything the read-only surface returned,
// measured live against a real Data Installer on 2026-08-16. The prior comment
// in readDescriptors.ts said none of them needed shaping — correct arithmetic on
// FIXTURE data (40 rows), wrong against 1,099 live rows. Fixtures tell you the
// shape of a payload, never its volume.

describe('paged list reads default to an agent-sized page', () => {
    // The service's own default is 100 rows. An agent's first call is `{}`, so
    // that default is what it pays: get_datapack_activity returned 25,056 bytes.
    it.each(['find_datapacks', 'list_installed_datapacks', 'get_datapack_activity'])(
        '%s declares a limit default so `{}` is not "everything"',
        (tool) => {
            const schema = row(tool)!.inputSchema!;
            expect(schema.limit).toBeDefined();
            // The SDK parses args through this schema and passes parseResult.data
            // to the handler, so a zod default lands without any handler change.
            expect(schema.limit.parse(undefined)).toBe(20);
            // An explicit value must still win.
            expect(schema.limit.parse(5)).toBe(5);
        },
    );

    it('leaves skip optional — paging is opt-in, page size is not', () => {
        expect(row('find_datapacks')!.inputSchema!.skip.parse(undefined)).toBeUndefined();
    });
});

describe('datapack list rows drop dashboard-only fields', () => {
    const shapeOf = (tool: string) => row(tool)!.shape!;
    const RESPONSE = {
        success: true as const,
        data: {
            items: [
                {
                    id: { name: 'bodea', version: 'main' },
                    displayName: 'Bodea',
                    art: { thumbnail: 'https://example.test/300/200' },
                    dataTypes: ['products', 'customers', 'orders'],
                },
            ],
            count: 1,
            total: 23,
            limit: 20,
            skip: 0,
        },
    };

    it.each(['find_datapacks', 'list_installed_datapacks'])(
        '%s drops art and collapses dataTypes to a count',
        (tool) => {
            const out = JSON.parse(shapeOf(tool)(RESPONSE, {}));

            expect(out.items[0]).toEqual({
                id: { name: 'bodea', version: 'main' },
                displayName: 'Bodea',
                dataTypeCount: 3,
            });
            // The envelope survives: without total/limit/skip an agent cannot
            // tell a full answer from a first page.
            expect(out).toMatchObject({ count: 1, total: 23, limit: 20, skip: 0 });
        },
    );

    it('passes an error response straight through rather than shaping it', () => {
        const out = shapeOf('find_datapacks')({ success: false, error: 'service down' }, {});
        expect(out).toMatch(/service down/);
    });

    it('falls back to the default shape when there are no items', () => {
        const out = shapeOf('find_datapacks')({ success: true, data: { ok: true } }, {});
        expect(JSON.parse(out)).toEqual({ ok: true });
    });
});

describe('verify_ai_setup returns the verdict, not the whole inventory', () => {
    // Measured live: 19,856 bytes, of which status + checks — the thing the tool
    // is named for — were 170.
    const RESPONSE = {
        success: true as const,
        data: {
            status: 'ok',
            checks: [{ name: 'mcp', ok: true }],
            inventory: {
                skills: [{ name: 'a' }, { name: 'b' }],
                mcps: [{ name: 'demo-builder', tools: ['x', 'y', 'z'] }],
                sessionMcps: [],
            },
        },
    };

    it('collapses inventory to counts by default', () => {
        const out = JSON.parse(row('verify_ai_setup')!.shape!(RESPONSE, { inventory: 'counts' }));

        expect(out.status).toBe('ok');
        expect(out.checks).toEqual([{ name: 'mcp', ok: true }]);
        expect(out.inventory).toEqual({ skills: 2, mcps: 1, sessionMcps: 0 });
        expect(out.inventoryDetail).toMatch(/full/);
    });

    // The full listing is the runtime source of truth for which MCP servers a
    // project actually loads — that is how the audit established Playwright
    // exposes 23 tools, not the 66 its README lists. It must stay reachable.
    it('returns the complete inventory when asked for full', () => {
        const out = JSON.parse(row('verify_ai_setup')!.shape!(RESPONSE, { inventory: 'full' }));

        expect(out.inventory.skills).toHaveLength(2);
        expect(out.inventory.mcps[0].tools).toEqual(['x', 'y', 'z']);
        expect(out.inventoryDetail).toBeUndefined();
    });

    it('declares the inventory argument with a counts default', () => {
        expect(row('verify_ai_setup')!.inputSchema!.inventory.parse(undefined)).toBe('counts');
    });
});
