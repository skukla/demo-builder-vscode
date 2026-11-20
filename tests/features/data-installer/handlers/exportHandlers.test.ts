/**
 * The export handlers: capture a datapack from the project's Commerce store.
 *
 * All three are Demo Builder's own (datapack-engine step 14): the list and the count read the
 * project's store (`listPickableItems`, `countPickableItems`), and the export saves what is picked
 * into the datapack library (`saveFromStore`). The Data Installer service's own export, into its
 * shared catalog, was deleted on 2026-11-06 with its engine (DI-12); what those three do with a
 * payload is `storeChangesHandlers-picks.test.ts`'s. This suite pins only the routing, and that an
 * ACO pack is refused before anything is read, while ACO packs are held back.
 */

import { ACO_HELD_BACK, exportHandlers } from '@/features/data-installer/handlers/exportHandlers';
import {
    countPickableItems,
    listPickableItems,
    saveFromStore,
} from '@/features/data-installer/handlers/storeChangesHandlers';
import { ErrorCode } from '@/types/errorCodes';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';

jest.mock('@/features/data-installer/handlers/storeChangesHandlers', () => ({
    listPickableItems: jest.fn(async () => ({ success: true, data: 'listed' })),
    countPickableItems: jest.fn(async () => ({ success: true, data: 'counted' })),
    saveFromStore: jest.fn(async () => ({ success: true, data: 'saved' })),
}));

const context = createMockHandlerContext();

beforeEach(() => jest.clearAllMocks());

describe('the export handlers, routed to the store', () => {
    it("lists one kind of the project's store, with the payload as sent", async () => {
        const payload = { dataType: 'products' };

        await expect(
            exportHandlers['list-datapack-export-items'](context, payload)
        ).resolves.toEqual({ success: true, data: 'listed' });
        expect(listPickableItems).toHaveBeenCalledWith(context, payload);
    });

    it("counts each kind of the project's store", async () => {
        await expect(exportHandlers['count-datapack-export-items'](context, {})).resolves.toEqual({
            success: true,
            data: 'counted',
        });
        expect(countPickableItems).toHaveBeenCalledWith(context, {});
    });

    it('saves what is picked into the library', async () => {
        const payload = {
            selections: { products: { sku: ['A'] } },
            saveAs: { displayName: 'My Pack' },
            confirm: true,
        };

        await expect(exportHandlers['start-datapack-export'](context, payload)).resolves.toEqual({
            success: true,
            data: 'saved',
        });
        expect(saveFromStore).toHaveBeenCalledWith(context, payload);
    });

    it('refuses an ACO pack before anything is read, while ACO packs are held back', async () => {
        const result = await exportHandlers['start-datapack-export'](context, {
            aco: true,
            datapackName: 'p',
            version: 'v1',
        });

        expect(result).toEqual({
            success: false,
            error: ACO_HELD_BACK,
            code: ErrorCode.INVALID_OPERATION,
        });
        expect(saveFromStore).not.toHaveBeenCalled();
    });
});
