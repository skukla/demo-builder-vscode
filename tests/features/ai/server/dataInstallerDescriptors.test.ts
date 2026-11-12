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
 */

import {
    DATA_INSTALLER_DESCRIPTORS,
} from '@/features/ai/server/dataInstallerDescriptors';
import { importHandlers } from '@/features/data-installer/handlers/importHandlers';
import type { HandlerResponse } from '@/types/handlers';

const row = (tool: string) => DATA_INSTALLER_DESCRIPTORS.find((d) => d.tool === tool);

// Twenty-four since restore_datapack (Phase 3/5, 2026-11-12); twenty-three since undo_last_save (Phase 2, 2026-11-12; twenty-two since verify_datapack_install, the count
// in this test's name had stayed at twenty-one); twenty-one since build_datapack_from_export (2026-11-05); twenty since mark_team_datapack (beta.153); nineteen since share_datapack (owner, 2026-10-30); eighteen since datapack-engine step 10 added
// check_demo_data and clear_demo_data (sixteen since step 07 added rename_datapack, fifteen since step 05).
it('registers the twenty-four tools, and only those', () => {
    expect(DATA_INSTALLER_DESCRIPTORS.map((d) => d.tool).sort()).toEqual([
        'build_datapack_from_export',
        'check_demo_data',
        'clear_demo_data',
        'copy_library_datapack_to_installer',
        'delete_library_datapack',
        'get_datapack_import_status',
        'get_datapack_import_target',
        'list_datapack_export_items',
        'list_datapack_import_scopes',
        'load_datapack_zip',
        'mark_team_datapack',
        'open_datapack_zip',
        'preview_datapack_changes',
        'rename_datapack',
        'reset_datapack',
        'restore_datapack',
        'save_datapack_zip',
        'save_store_changes_to_pack',
        'share_datapack',
        'start_datapack_export',
        'start_datapack_import',
        'undo_last_save',
        'validate_datapack_import',
        'verify_datapack_install',
    ]);
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
    // Saving a file into the project is not gated: it changes no store and no instance.
    it('gates exactly the thirteen writes that reach a store or an instance', () => {
        const gated = DATA_INSTALLER_DESCRIPTORS.filter((d) => d.confirm).map((d) => d.tool);
        expect(gated.sort()).toEqual([
            'clear_demo_data',
            'copy_library_datapack_to_installer',
            'delete_library_datapack',
            'load_datapack_zip',
            'mark_team_datapack',
            'rename_datapack',
            'reset_datapack',
            'restore_datapack',
            'save_store_changes_to_pack',
            'share_datapack',
            'start_datapack_export',
            'start_datapack_import',
            'undo_last_save',
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
        const out = preflight()({ datapackName: 'aco-pack', confirmName: 'wrong' }) as { error: string };

        expect(out.error).toMatch(/confirmName:"aco-pack"/);
    });

    it('refuses when no echo is given at all', () => {
        expect(preflight()({ datapackName: 'shared-pack' })).toBeDefined();
    });

    // The service's export into the shared catalog was deleted on 2026-11-06 (DI-12): a named pack is the library's.
    it('names the library it writes into, never the shared catalog', () => {
        const out = preflight()({ datapackName: 'aco_acme', aco: true }) as { error: string };

        expect(out).toEqual({ error: 'start_datapack_export writes "aco_acme" into My Datapacks. To proceed, call again with confirmName:"aco_acme".' });
    });

    it('allows dispatch when the echo matches', () => {
        expect(
            preflight()({ datapackName: 'shared-pack', confirmName: 'shared-pack' }),
        ).toBeUndefined();
    });

    // Step 14: a save from the store names no pack and writes none to the shared catalog.
    it('needs no echo from a call naming no pack, which writes into the demo\'s own pack', () => {
        expect(preflight()({ selections: { products: { sku: ['VR-Rack'] } } })).toBeUndefined();
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

    it("keeps inPackCount, Demo Builder's count of what the pack being saved holds already", () => {
        const res: HandlerResponse = { success: true, data: { items: [], totalCount: 4, excludedCount: 0, inPackCount: 4 } };

        expect(JSON.parse(shape()(res, {})).inPackCount).toBe(4);
    });

    it('honours an explicit limit', () => {
        const out = JSON.parse(shape()(page(500), { limit: 3 }));
        expect(out.items).toHaveLength(3);
    });

    it('passes a failure through untouched', () => {
        const out = JSON.parse(shape()({ success: false, error: 'nope' }, {}));
        expect(out).toEqual({ success: false, error: 'nope' });
    });

    // The service answering with no data at all is not an error, and inventing
    // a page for it — or reaching into one that is not there — is worse.
    it('answers with an empty page when the response carries no data', () => {
        expect(JSON.parse(shape()({ success: true }, {}))).toStrictEqual({
            items: [],
            returned: 0,
        });
    });

    it('omits counts the service did not send rather than inventing them', () => {
        const out = JSON.parse(shape()({ success: true, data: { items: [] } }, {}));

        expect(out.totalCount).toBeUndefined();
        expect(out.excludedCount).toBeUndefined();
        expect(out.returned).toBe(0);
    });
});

// A descriptor row is a set of DECLARATIONS the MCP registration acts on before
// any handler runs — which sign-in is required, whether the tool is exposed as a
// read, and what a caller may send. Nothing else checks them.
describe('what each row declares', () => {
    // open_datapack_zip and build_datapack_from_export only touch local files, so they need no sign-in.
    it('requires an Adobe sign-in on every row that reaches a service', () => {
        const local = new Set(['open_datapack_zip', 'build_datapack_from_export']);
        for (const d of DATA_INSTALLER_DESCRIPTORS) {
            expect(d.needsAuth).toStrictEqual(local.has(d.tool) ? [] : ['adobe']);
        }
    });

    // readOnly is what the write-gating machinery reads. The dry run is a read;
    // the three that touch a live instance or the shared catalog are not.
    it('exposes nine reads and fifteen writes', () => {
        const byFlag = (readOnly: boolean) =>
            DATA_INSTALLER_DESCRIPTORS.filter((d) => d.readOnly === readOnly)
                .map((d) => d.tool)
                .sort();

        expect(byFlag(true)).toEqual([
            'check_demo_data',
            'get_datapack_import_status',
            'get_datapack_import_target',
            'list_datapack_export_items',
            'list_datapack_import_scopes',
            'open_datapack_zip',
            'preview_datapack_changes',
            'validate_datapack_import',
            'verify_datapack_install',
        ]);
        expect(byFlag(false)).toEqual([
            'build_datapack_from_export',
            'clear_demo_data',
            'copy_library_datapack_to_installer',
            'delete_library_datapack',
            'load_datapack_zip',
            'mark_team_datapack',
            'rename_datapack',
            'reset_datapack',
            'restore_datapack',
            'save_datapack_zip',
            'save_store_changes_to_pack',
            'share_datapack',
            'start_datapack_export',
            'start_datapack_import',
            'undo_last_save',
        ]);
    });
});

describe('what each row accepts', () => {
    const keys = (tool: string) => Object.keys(row(tool)!.inputSchema ?? {}).sort();

    // The dry run's whole point is taking the SAME request body as the real
    // import, so the three share one schema.
    it('gives the import trio the datapack id plus the full import target', () => {
        const expected = [
            'commerceInstance',
            'dataTypes',
            'datapackName',
            // Which store holds the pack, installer or library (DI-5).
            'source',
            'storeCode',
            'version',
            'websiteCode',
        ].sort();

        expect(keys('validate_datapack_import')).toEqual(expected);
        // The start may wait on the job it began, rather than an agent polling it (2026-11-05), and
        // answers for the changes in the pack it replaces, as a reset does (walk F97).
        expect(keys('start_datapack_import')).toEqual([...expected, 'changes', 'saveAs', 'waitSeconds'].sort());
        // Its one addition: the answer to the changes it names (step 05).
        // And Save As's name, for changes kept when the project's pack is not the user's; and the wait.
        expect(keys('reset_datapack')).toEqual([...expected, 'changes', 'saveAs', 'waitSeconds'].sort());
    });

    // Restore picks its own version and target from the project and drops the changes itself, so an
    // agent names only the pack (and may wait); the row's gate supplies confirm.
    it('gives restore_datapack the pack and the wait, nothing that could choose a version or save', () => {
        expect(keys('restore_datapack')).toEqual(['datapackName', 'waitSeconds']);
    });

    it('lets reset_datapack answer keep or drop, and gives an agent no way to turn on "always"', () => {
        const schema = row('reset_datapack')!.inputSchema!;

        expect(schema.changes.parse('keep')).toBe('keep');
        expect(schema.changes.parse('drop')).toBe('drop');
        expect(schema.changes.parse(undefined)).toBeUndefined();
        expect(() => schema.changes.parse('maybe')).toThrow();
        // The handler reads `alwaysSave` from the confirm's box. A setting is the SC's to change.
        expect(schema).not.toHaveProperty('alwaysSave');
    });

    it('lets reset_datapack omit dataTypes, since its record decides, but not an import or a dry run', () => {
        expect(() => row('reset_datapack')!.inputSchema!.dataTypes.parse(undefined)).not.toThrow();
        expect(() => row('start_datapack_import')!.inputSchema!.dataTypes.parse(undefined)).toThrow();
        expect(() => row('validate_datapack_import')!.inputSchema!.dataTypes.parse(undefined)).toThrow();
    });

    it('says what the ticks mean, for an import and for a removal', () => {
        expect(row('start_datapack_import')!.description).toContain('Only the dataTypes named install, with what they need');
        expect(row('start_datapack_import')!.description).toContain('A kind left out is left alone');
        expect(row('reset_datapack')!.description).toContain('takes everything the install record lists, whatever dataTypes names');
    });

    it('says what reset_datapack does about changes, including what the setting does', () => {
        const { description } = row('reset_datapack')!;

        expect(description).toContain('uninstalls nothing until changes answers');
        expect(description).toContain('demoBuilder.dataInstaller.changesOnRemoval');
    });

    // Step 03, S5: the refusal's reason is the one Dry Run's Fix with AI names, and the tool says
    // the same fix, so an agent reaches it without the button.
    it('tells an agent how to fix what a refused dry run names, and not to install unasked', () => {
        const { description } = row('validate_datapack_import')!;

        expect(description).toContain('save_datapack_zip, correct the rows, load_datapack_zip');
        expect(description).toContain('run this again');
        expect(description).toContain('install only when the user asks');
    });

    it('gives the export item list a single data type to enumerate, a limit, and Add Items\'s unused', () => {
        expect(keys('list_datapack_export_items')).toEqual(
            ['dataType', 'datapackName', 'limit', 'source', 'unused', 'version'].sort(),
        );
    });

    it('gives the export the picks, the Save As name, and the ACO choice with its name echo', () => {
        expect(keys('start_datapack_export')).toEqual(
            ['aco', 'confirmName', 'dataTypes', 'datapackName', 'saveAs', 'selections', 'storeViews', 'version'].sort(),
        );
    });

    // Step 14: what the SC added by hand goes in when picked; no pack named saves the project's, or picks alone.
    // Save As's name makes a new pack of the user's (2026-11-03).
    it('gives the save the picks and the Save As name, and lets it name no pack', () => {
        expect(keys('save_store_changes_to_pack')).toEqual(['datapackName', 'saveAs', 'selections', 'source', 'version'].sort());
        const schema = row('save_store_changes_to_pack')!.inputSchema!;
        expect(() => schema.datapackName.parse(undefined)).not.toThrow();
        expect(() => schema.selections.parse({ products: { sku: ['VR-Rack'] }, cart_rules: { rule_id: [7] } })).not.toThrow();
        expect(() => schema.selections.parse({ products: ['VR-Rack'] })).toThrow();
        expect(schema.saveAs.parse({ displayName: 'My Bodea' })).toEqual({ displayName: 'My Bodea' });
        expect(() => schema.saveAs.parse({ displayName: '' })).toThrow();
    });

    it('asks the two project-derived reads for nothing at all', () => {
        for (const tool of ['get_datapack_import_target', 'list_datapack_import_scopes']) {
            expect(row(tool)!.inputSchema).toBeUndefined();
        }
    });

    it('asks the status read how long it may wait, at most 45 seconds, and where the skipped rows start', () => {
        expect(keys('get_datapack_import_status')).toEqual(['skippedFrom', 'waitSeconds']);
        const schema = row('get_datapack_import_status')!.inputSchema!;
        expect(schema.waitSeconds.parse(45)).toBe(45);
        expect(() => schema.waitSeconds.parse(46)).toThrow();
    });

    // An empty dataTypes is a request that would do nothing, and an agent that
    // sends one has misunderstood the call rather than made a small mistake.
    it('requires at least one data type wherever dataTypes appears', () => {
        for (const tool of [
            'validate_datapack_import',
            'start_datapack_import',
            'reset_datapack',
            'start_datapack_export',
        ]) {
            const dataTypes = row(tool)!.inputSchema!.dataTypes;

            expect(() => dataTypes.parse([])).toThrow();
            expect(() => dataTypes.parse(['products', 'categories'])).not.toThrow();
        }
    });
});
