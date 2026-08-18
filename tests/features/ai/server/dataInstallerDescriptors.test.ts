/**
 * The Data Installer write rows (Group 8).
 *
 * What is pinned, and why:
 *
 * - **The export name echo**, checked BEFORE dispatch. An export writes into a
 *   catalog other teams read; a confirm alone is the bar for your own project.
 * - **`validate_datapack_import` is UNGATED.** Gating the dry run would push an
 *   agent toward the real import to find out whether a request is well-formed,
 *   which is the opposite of why it exists. Asserted so nobody "tidies" it into
 *   consistency with its siblings.
 * - **The export item page size.** `listExportItems` asks the service for 1,000
 *   rows; unpaged, that is phase 2's 25KB finding all over again.
 * - **`provision_accs_credentials` is absent**, because its handler docstring
 *   says panel-only. A test states it so the next person adding "the missing
 *   ninth handler" finds the reason instead of the gap.
 */

import {
    DATA_INSTALLER_DESCRIPTORS,
} from '@/features/ai/server/dataInstallerDescriptors';
import { importHandlers } from '@/features/data-installer/handlers/importHandlers';
import type { HandlerResponse } from '@/types/handlers';

const row = (tool: string) => DATA_INSTALLER_DESCRIPTORS.find((d) => d.tool === tool);

it('registers the eight tools, and only those', () => {
    expect(DATA_INSTALLER_DESCRIPTORS.map((d) => d.tool).sort()).toEqual([
        'get_datapack_import_status',
        'get_datapack_import_target',
        'list_datapack_export_items',
        'list_datapack_import_scopes',
        'reset_datapack',
        'start_datapack_export',
        'start_datapack_import',
        'validate_datapack_import',
    ]);
});

it('omits provision_accs_credentials, which its handler declares panel-only', () => {
    // "Panel-only by construction (never in the MCP maps): it creates a
    // credential in the user's Console workspace." — importHandlers.ts
    expect(row('provision_accs_credentials')).toBeUndefined();
    // The handler still exists; it is the EXPOSURE that is withheld.
    expect(importHandlers['provision-accs-credentials']).toBeDefined();
});

it('every row dispatches to a handler that actually exists', () => {
    // Indexed as a plain record: `defineHandlers` gives the map a literal type
    // with no string index signature, and a row's `type` is a plain string.
    const handlers = importHandlers as unknown as Record<string, unknown>;
    for (const d of DATA_INSTALLER_DESCRIPTORS) {
        expect(handlers[d.type]).toBeDefined();
    }
});

describe('gates', () => {
    it('gates exactly the three writes', () => {
        const gated = DATA_INSTALLER_DESCRIPTORS.filter((d) => d.confirm).map((d) => d.tool);
        expect(gated.sort()).toEqual([
            'reset_datapack',
            'start_datapack_export',
            'start_datapack_import',
        ]);
    });

    it('leaves the dry run ungated on purpose', () => {
        // If this ever fails because someone added `confirm: true` "for
        // consistency": the dry run is how an agent avoids the gated call.
        expect(row('validate_datapack_import')!.confirm).toBeUndefined();
    });

    it('leaves every read ungated', () => {
        for (const tool of [
            'get_datapack_import_target',
            'list_datapack_import_scopes',
            'get_datapack_import_status',
            'list_datapack_export_items',
        ]) {
            expect(row(tool)!.confirm).toBeUndefined();
        }
    });
});

describe('start_datapack_export name echo', () => {
    const preflight = () => row('start_datapack_export')!.preflight!;

    it('refuses when the echo does not match', () => {
        const out = preflight()({ datapackName: 'shared-pack', confirmName: 'wrong' }) as {
            error: string;
            sharedCatalog: boolean;
        };

        expect(out.error).toMatch(/confirmName:"shared-pack"/);
        expect(out.sharedCatalog).toBe(true);
    });

    it('refuses when no echo is given at all', () => {
        expect(preflight()({ datapackName: 'shared-pack' })).toBeDefined();
    });

    it('allows dispatch when the echo matches', () => {
        expect(
            preflight()({ datapackName: 'shared-pack', confirmName: 'shared-pack' }),
        ).toBeUndefined();
    });
});

describe('list_datapack_export_items paging', () => {
    const shape = () => row('list_datapack_export_items')!.shape!;

    /** The service's own page shape — `listExportItems` returns `ExportItemPage`. */
    const page = (count: number): HandlerResponse => ({
        success: true,
        data: {
            items: Array.from({ length: count }, (_, i) => ({ sku: `SKU-${i}`, name: `Item ${i}` })),
            totalCount: count,
            excludedCount: 3,
        },
    });

    it('caps the page at the agent default', () => {
        const out = JSON.parse(shape()(page(500), {}));

        expect(out.items).toHaveLength(20);
        expect(out.returned).toBe(20);
    });

    it('reports the service totalCount, not the page length', () => {
        const out = JSON.parse(shape()(page(500), {}));

        // The distinction phase 2 paid for: `total: 20` for a 23-row catalog came
        // from recomputing an envelope field the service already sends.
        expect(out.totalCount).toBe(500);
    });

    it('keeps excludedCount — "8 of 9, one excluded" is the useful part', () => {
        expect(JSON.parse(shape()(page(5), {})).excludedCount).toBe(3);
    });

    it('honours an explicit limit', () => {
        const out = JSON.parse(shape()(page(500), { limit: 3 }));
        expect(out.items).toHaveLength(3);
    });

    it('passes a failure through untouched', () => {
        const out = JSON.parse(shape()({ success: false, error: 'nope' }, {}));
        expect(out).toEqual({ success: false, error: 'nope' });
    });

    it('omits counts the service did not send rather than inventing them', () => {
        const out = JSON.parse(shape()({ success: true, data: { items: [] } }, {}));

        expect(out.totalCount).toBeUndefined();
        expect(out.excludedCount).toBeUndefined();
        expect(out.returned).toBe(0);
    });
});
