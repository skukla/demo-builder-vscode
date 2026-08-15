/**
 * READ_DESCRIPTORS — pin the read-tool catalog rows to their handler map/type.
 * Generic dispatch/shaping is covered in toolDescriptors.test.ts; here we assert
 * the catalog wiring so a row can't silently point at the wrong handler.
 */

import { READ_DESCRIPTORS } from '@/features/ai/server/readDescriptors';
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

});
