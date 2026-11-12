/**
 * `get-datapack-records` (step 03, S4): the records an install puts in Commerce, by name, for the
 * install window's Review Records. Each record is named as the pack names it, by `keyOf`
 * (`packForm.ts`), the same name a repeat install finds it by. Webview-only: merged into
 * `importHandlers`, not the read map the MCP descriptors mirror.
 *
 * The pack read is handed in, so the request it is given is asserted directly: a mock that answers
 * the same whatever it is handed cannot see a wrong pack or store.
 */

import { readDatapackRecords } from '@/features/data-installer/handlers/datapackRecordsHandlers';
import { importHandlers } from '@/features/data-installer/handlers/importHandlers';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';

const ITEMS = {
    products: [
        { product: { sku: 'BD-CENTRIFUGE', name: 'Benchtop Centrifuge' } },
        { product: { sku: 'BD-GLOVES', name: 'Nitrile Gloves' } },
    ],
    categories: [{ category: { name: 'Centrifuges', path: 'Bodea Catalog/Lab Equipment' } }],
    coupons: [{ coupon: { code: 'SAVE10' } }],
    // A kind that keeps no record has no name to show.
    store_config: [{ path: 'general/locale/code', value: 'en_US' }],
};

describe('get-datapack-records', () => {
    it('reads the pack named, from the store named', async () => {
        const read = jest.fn().mockResolvedValue(ITEMS);

        await readDatapackRecords(
            createMockHandlerContext(),
            { datapackName: 'bodea', version: 'main', source: 'library' },
            read
        );

        expect(read).toHaveBeenCalledWith({ name: 'bodea', version: 'main' }, 'library');
    });

    it('reads a Data Installer pack from the Data Installer when no store is named', async () => {
        const read = jest.fn().mockResolvedValue(ITEMS);

        await readDatapackRecords(
            createMockHandlerContext(),
            { datapackName: 'bodea', version: 'main' },
            read
        );

        expect(read).toHaveBeenCalledWith({ name: 'bodea', version: 'main' }, 'installer');
    });

    it('names each record by the name the pack gives it, by data type', async () => {
        const read = jest.fn().mockResolvedValue(ITEMS);

        const answer = await readDatapackRecords(
            createMockHandlerContext(),
            { datapackName: 'bodea', version: 'main' },
            read
        );

        expect(answer).toEqual({
            success: true,
            data: {
                records: {
                    products: ['BD-CENTRIFUGE', 'BD-GLOVES'],
                    // A category by its place under the pack's root.
                    categories: ['Lab Equipment/Centrifuges'],
                    coupons: ['SAVE10'],
                },
            },
        });
    });

    it('refuses without a name and version, reading nothing', async () => {
        const read = jest.fn();

        const answer = await readDatapackRecords(
            createMockHandlerContext(),
            { datapackName: 'bodea' },
            read
        );

        expect(answer).toMatchObject({
            success: false,
            error: 'A datapack name and version are required.',
        });
        expect(read).not.toHaveBeenCalled();
    });

    it('answers a failed read as a failure in its own words, never a throw', async () => {
        const read = jest
            .fn()
            .mockRejectedValue(new Error('The datapack library is not reachable.'));

        const answer = await readDatapackRecords(
            createMockHandlerContext(),
            { datapackName: 'bodea', version: 'main' },
            read
        );

        expect(answer).toMatchObject({ success: false, error: 'The records could not be read. Details are in Debug Logs.' });
    });

    it('is reachable from the Datapacks screen', () => {
        expect(importHandlers).toHaveProperty('get-datapack-records');
    });
});
