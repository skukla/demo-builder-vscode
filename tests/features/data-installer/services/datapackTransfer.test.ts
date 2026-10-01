/**
 * Moving a whole pack between a store and a file: what is read, what is written,
 * and what happens when one type is refused.
 */

import { DataInstallerApiError } from '@/features/data-installer/services/dataInstallerErrors';
import {
    DatapackTransferError,
    readPackFromStore,
    writePackToStore,
} from '@/features/data-installer/services/datapackTransfer';
import type { DatapackFile } from '@/features/data-installer/services/datapackZip';
import type { DataItem, DatapackDetail } from '@/features/data-installer/types';

const ID = { name: 'justrite', version: 'v1' };
const DETAIL: DatapackDetail = {
    id: ID,
    displayName: 'Justrite B2B',
    description: 'Signs',
    shared: true,
    dataTypes: ['categories', 'customer_groups'],
    art: {},
};
const ROWS: Record<string, unknown> = {
    categories: [{ category: { name: 'Signs' } }],
    customer_groups: [{ customer_group: { code: 'Northgate' } }],
};

function client(detail: DatapackDetail = DETAIL, items: Record<string, DataItem> = {}) {
    return {
        getDatapackDetail: jest.fn().mockResolvedValue(detail),
        getDataItem: jest.fn(
            async (_id: unknown, dataType: string) =>
                items[dataType] ?? { dataType, records: ROWS[dataType] }
        ),
    };
}

describe('readPackFromStore', () => {
    it('reads the detail, then each type the pack lists, and records where it came from', async () => {
        const c = client();

        const pack = await readPackFromStore(
            c,
            ID,
            'library',
            () => new Date('2026-10-01T12:00:00Z')
        );

        expect(c.getDatapackDetail).toHaveBeenCalledWith(ID);
        expect(c.getDataItem.mock.calls).toEqual([
            [ID, 'categories'],
            [ID, 'customer_groups'],
        ]);
        expect(pack).toEqual({
            id: ID,
            displayName: 'Justrite B2B',
            description: 'Signs',
            items: [
                { dataType: 'categories', records: ROWS.categories },
                { dataType: 'customer_groups', records: ROWS.customer_groups },
            ],
            source: 'library',
            exportedAt: '2026-10-01T12:00:00.000Z',
        });
    });

    it('refuses a pack that holds no data yet', async () => {
        await expect(
            readPackFromStore(client({ ...DETAIL, dataTypes: [] }), ID, 'installer')
        ).rejects.toThrow(/holds no data yet/);
    });

    it('refuses a pack whose stored rows do not parse, naming the type', async () => {
        const c = client(DETAIL, {
            customer_groups: { dataType: 'customer_groups', rawData: '{bad' },
        });

        await expect(readPackFromStore(c, ID, 'installer')).rejects.toThrow(DatapackTransferError);
        await expect(readPackFromStore(c, ID, 'installer')).rejects.toThrow(/customer_groups rows/);
    });
});

describe('writePackToStore', () => {
    const PACK: DatapackFile = {
        id: ID,
        displayName: 'Justrite B2B',
        description: 'Signs',
        items: [
            { dataType: 'categories', records: ROWS.categories },
            { dataType: 'products', records: [] },
            { dataType: 'customer_groups', records: ROWS.customer_groups },
        ],
    };

    function writer(created: 'created' | 'exists' = 'created') {
        return {
            createDatapack: jest.fn().mockResolvedValue(created),
            addDataItem: jest.fn().mockResolvedValue(undefined),
        };
    }

    it('creates the pack, then adds every type with its rows', async () => {
        const w = writer();

        const outcome = await writePackToStore(w, PACK);

        expect(w.createDatapack).toHaveBeenCalledWith({
            id: ID,
            displayName: 'Justrite B2B',
            description: 'Signs',
        });
        expect(w.addDataItem.mock.calls).toEqual([
            [ID, 'categories', ROWS.categories],
            [ID, 'products', []],
            [ID, 'customer_groups', ROWS.customer_groups],
        ]);
        expect(outcome).toEqual({
            pack: 'created',
            stored: ['categories', 'products', 'customer_groups'],
            failed: [],
        });
    });

    it('refuses an existing pack without update, and writes nothing into it', async () => {
        const w = writer('exists');

        await expect(writePackToStore(w, PACK)).rejects.toThrow(/already exists in that store/);
        expect(w.addDataItem).not.toHaveBeenCalled();
    });

    it('with update, replaces the types the file carries in the existing pack', async () => {
        const w = writer('exists');

        const outcome = await writePackToStore(w, PACK, { update: true });

        expect(outcome.pack).toBe('updated');
        expect(w.addDataItem).toHaveBeenCalledTimes(3);
    });

    it('reports a refused type by name and still writes the others', async () => {
        const w = writer();
        w.addDataItem.mockImplementation(async (_id: unknown, dataType: string) => {
            if (dataType === 'products') {
                throw new DataInstallerApiError(
                    'products: too large to send in one request',
                    413,
                    'add-data-item'
                );
            }
        });

        const outcome = await writePackToStore(w, PACK);

        expect(outcome).toEqual({
            pack: 'created',
            stored: ['categories', 'customer_groups'],
            failed: [
                { dataType: 'products', reason: 'products: too large to send in one request' },
            ],
        });
    });

    it('lets an unexpected error through rather than filing it as a refused type', async () => {
        const w = writer();
        w.addDataItem.mockRejectedValue(new TypeError('network down'));

        await expect(writePackToStore(w, PACK)).rejects.toThrow('network down');
    });
});
