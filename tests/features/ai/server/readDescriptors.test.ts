/**
 * READ_DESCRIPTORS — pin the read-tool catalog rows to their handler map/type.
 * Generic dispatch/shaping is covered in toolDescriptors.test.ts; here we assert
 * the catalog wiring so a row can't silently point at the wrong handler.
 */

import { READ_DESCRIPTORS } from '@/features/ai/server/readDescriptors';
import { dataInstallerHandlers } from '@/features/data-installer/handlers';
import { dashboardHandlers } from '@/features/dashboard/handlers/dashboardHandlers';
import { edsHandlers } from '@/features/eds/handlers/edsHandlers';

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

    it('never confirm-gates a read row', () => {
        for (const d of READ_DESCRIPTORS) {
            expect(d.confirm).toBeUndefined();
        }
    });

    /**
     * The Data Installer's six reads.
     *
     * All six dispatch into `dataInstallerHandlers`, whose guard branches on
     * `context.panel` — absent here, so the headless path returns a `needsAuth`
     * marker instead of popping a VS Code warning on the user's window.
     */
    describe('Data Installer reads', () => {
        it.each([
            ['check_datapack_service', 'check-datapack-service'],
            ['find_datapacks', 'find-datapacks'],
            ['get_datapack', 'get-datapack-detail'],
            ['list_datapack_data_types', 'list-datapack-data-types'],
            ['list_installed_datapacks', 'list-installed-datapacks'],
            ['get_datapack_activity', 'get-datapack-activity'],
        ])('exposes %s dispatching to %s', (tool, type) => {
            const d = row(tool);

            expect(d).toBeDefined();
            expect(d!.map).toBe(dataInstallerHandlers);
            expect(d!.type).toBe(type);
        });

        it('exposes every read handler — no handler left behind', () => {
            const exposed = READ_DESCRIPTORS.filter((d) => d.map === dataInstallerHandlers).map(
                (d) => d.type,
            );

            expect(exposed.sort()).toEqual(Object.keys(dataInstallerHandlers).sort());
        });

        it('takes no arguments for the service check', () => {
            expect(row('check_datapack_service')!.inputSchema).toBeUndefined();
        });

        // `(name, version)` is the identity the service keys on, always — a
        // lookup by name alone has no answer.
        it('requires both halves of the identity for a single datapack', () => {
            const schema = row('get_datapack')!.inputSchema!;

            expect(Object.keys(schema).sort()).toEqual(['datapackName', 'version']);
            expect(schema.datapackName.isOptional()).toBe(false);
            expect(schema.version.isOptional()).toBe(false);
        });

        // The import and export type sets genuinely differ, so the handler
        // refuses to guess one — the tool must not offer a default either.
        it('requires an operation mode for the data-type list', () => {
            const schema = row('list_datapack_data_types')!.inputSchema!;

            expect(schema.operationMode.isOptional()).toBe(false);
        });

        it('lets an agent page the catalog rather than shaping it', () => {
            // 40 live rows is ~17KB of JSON. `limit`/`skip` are the service's own
            // lever for that, which beats a bespoke projector nobody can tune.
            const schema = row('find_datapacks')!.inputSchema!;

            expect(schema.limit.isOptional()).toBe(true);
            expect(schema.skip.isOptional()).toBe(true);
            expect(schema.includeCommunity.isOptional()).toBe(true);
        });

        it('offers no search argument, because the handler has none', () => {
            expect(row('find_datapacks')!.inputSchema!.search).toBeUndefined();
        });
    });
});
