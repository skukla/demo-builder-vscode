/**
 * A pack put in the Data Installer's form before it is copied or loaded there. The rows are the
 * shapes the 14 packs in Demo Builder's store hold (2026-11-06): Luma's gift cards name their set
 * "Gift Card", and the import-form Luma wrote its error count as text. Both failed the Data
 * Installer's schemas, checked against every item of every pack that day.
 */

import type { DatapackFile } from '@/features/data-installer/services/datapackZip';
import {
    DEFAULT_ATTRIBUTE_SET_ID,
    InstallerFormError,
    toInstallerForm,
} from '@/features/data-installer/services/installerForm';

const pack = (items: DatapackFile['items']): DatapackFile => ({
    id: { name: 'luma', version: 'eds-compatible' },
    displayName: 'Luma',
    items,
});
const giftCard = (sku: string, set: unknown) => ({
    product: { sku, name: sku, type_id: 'giftcard', attribute_set_id: set },
});

describe('toInstallerForm', () => {
    it('puts a gift card that names its set in the Default set, and says so', () => {
        const form = toInstallerForm(
            pack([
                {
                    dataType: 'giftcards',
                    records: [giftCard('243-mb04', 'Gift Card'), giftCard('243-mb09', 'Gift Card')],
                },
            ])
        );

        expect(form.pack.items[0].records).toEqual([
            giftCard('243-mb04', DEFAULT_ATTRIBUTE_SET_ID),
            giftCard('243-mb09', DEFAULT_ATTRIBUTE_SET_ID),
        ]);
        expect(form.changes).toEqual([
            "2 gift cards go in the Default attribute set: the Data Installer takes a set by its number, and only the Default set's is the same on every store.",
        ]);
    });

    it('CONTROL: leaves a gift card that already gives a number as it is, and says nothing', () => {
        const form = toInstallerForm(
            pack([{ dataType: 'giftcards', records: [giftCard('243-mb04', 12)] }])
        );

        expect(form.pack.items[0].records).toEqual([giftCard('243-mb04', 12)]);
        expect(form.changes).toStrictEqual([]);
    });

    it("sends an import body's error count as a number", () => {
        const body = {
            source: {
                entity: 'catalog_product',
                behavior: 'append',
                allowed_error_count: '10',
                items: [{ sku: 'MH01' }],
            },
        };

        const form = toInstallerForm(pack([{ dataType: 'product_export', records: body }]));

        expect(form.pack.items[0].records).toEqual({
            source: { ...body.source, allowed_error_count: 10 },
        });
        expect(form.changes).toHaveLength(1);
    });

    it('refuses, before anything is sent, a data type the Data Installer has no schema for', () => {
        const settings = pack([
            { dataType: 'categories', records: { categories: [] } },
            { dataType: 'store_config', records: [] },
        ]);

        expect(() => toInstallerForm(settings)).toThrow(InstallerFormError);
        expect(() => toInstallerForm(settings)).toThrow(
            /takes no store_config data, so nothing was sent/
        );
    });

    it('changes nothing else in the pack', () => {
        const categories = {
            dataType: 'categories',
            records: { categories: [{ category: { name: 'Gear', path: 'Default Category' } }] },
        };

        const form = toInstallerForm(pack([categories]));

        expect(form.pack.items).toEqual([categories]);
        expect(form.changes).toStrictEqual([]);
    });
});
