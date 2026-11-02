/**
 * The datapack file: one zip, a `datapack.json` saying what the pack is, and one
 * `data/<type>.json` per data type. Built and read over bytes; the save and the
 * open are the handler's.
 */

import AdmZip from 'adm-zip';
import {
    buildDatapackZip,
    datapackZipName,
    readDatapackZip,
    DatapackZipError,
    type DatapackFile,
} from '@/features/data-installer/services/datapackZip';
import { BODEA_CUSTOMER_ROWS, TEST_PASSWORD } from '../../../helpers/commerceB2bFixtures';
import { GRID, fileLayer, settingRow } from '../../../helpers/settingsLayerFixtures';

const PACK: DatapackFile = {
    id: { name: 'justrite', version: 'v1' },
    displayName: 'Justrite B2B',
    description: 'Signs, cabinets, two companies',
    source: 'installer',
    exportedAt: '2026-10-01T12:00:00.000Z',
    items: [
        { dataType: 'categories', records: [{ category: { name: 'Signs and Labels' } }] },
        { dataType: 'customer_groups', records: [{ customer_group: { code: 'Northgate' } }] },
    ],
};

function entries(bytes: Buffer): Record<string, string> {
    const zip = new AdmZip(bytes);
    return Object.fromEntries(
        zip
            .getEntries()
            .filter((e) => !e.isDirectory)
            .map((e) => [e.entryName, e.getData().toString('utf-8')])
    );
}

function zipOf(files: Record<string, string>): Buffer {
    const zip = new AdmZip();
    for (const [name, text] of Object.entries(files)) zip.addFile(name, Buffer.from(text, 'utf-8'));
    return zip.toBuffer();
}

describe('buildDatapackZip', () => {
    it('writes datapack.json and one data file per type, nothing else', () => {
        const files = entries(buildDatapackZip(PACK));

        expect(Object.keys(files).sort()).toEqual([
            'data/categories.json',
            'data/customer_groups.json',
            'datapack.json',
        ]);
        expect(JSON.parse(files['datapack.json'])).toEqual({
            format: 'demo-builder-datapack',
            formatVersion: 1,
            datapack_name: 'justrite',
            version: 'v1',
            display_name: 'Justrite B2B',
            description: 'Signs, cabinets, two companies',
            data_types: ['categories', 'customer_groups'],
            source: 'installer',
            exported_at: '2026-10-01T12:00:00.000Z',
        });
        expect(JSON.parse(files['data/categories.json'])).toEqual(PACK.items[0].records);
    });

    // Step 08: a file can be sent to anyone, so no customer password ever goes in one.
    it("writes customers without the password a pack's rows carry", () => {
        const files = entries(buildDatapackZip({ ...PACK, items: [{ dataType: 'customers', records: BODEA_CUSTOMER_ROWS }] }));

        expect(files['data/customers.json']).not.toContain(TEST_PASSWORD);
        expect(JSON.parse(files['data/customers.json'])).toEqual(BODEA_CUSTOMER_ROWS.map(({ customer }) => ({ customer })));
    });

    it('refuses a data type that is not a plain name, so it cannot steer a path', () => {
        const bad = { ...PACK, items: [{ dataType: '../escape', records: [] }] };
        expect(() => buildDatapackZip(bad)).toThrow(DatapackZipError);
    });
});

describe('readDatapackZip', () => {
    it('reads back exactly what was built', () => {
        expect(readDatapackZip(buildDatapackZip(PACK))).toEqual(PACK);
    });

    it('reads a file whose contents sit under one root folder, as macOS Compress makes', () => {
        const built = entries(buildDatapackZip(PACK));
        const nested = zipOf(
            Object.fromEntries(Object.entries(built).map(([k, v]) => [`justrite-v1/${k}`, v]))
        );

        expect(readDatapackZip(nested)).toEqual(PACK);
    });

    it('omits optional fields the file does not carry', () => {
        const bytes = zipOf({
            'datapack.json': JSON.stringify({
                format: 'demo-builder-datapack',
                formatVersion: 1,
                datapack_name: 'bare',
                version: 'main',
                data_types: ['categories'],
            }),
            'data/categories.json': '[]',
        });

        expect(readDatapackZip(bytes)).toEqual({
            id: { name: 'bare', version: 'main' },
            displayName: 'bare',
            items: [{ dataType: 'categories', records: [] }],
        });
    });

    it.each([
        ['not a zip at all', Buffer.from('plain text'), /not a zip/i],
        ['a zip with no datapack.json', zipOf({ 'readme.txt': 'hi' }), /no datapack\.json/i],
        [
            'another format',
            zipOf({
                'datapack.json': JSON.stringify({ format: 'something-else', formatVersion: 1 }),
            }),
            /not a Demo Builder datapack file/i,
        ],
        [
            'a newer format version',
            zipOf({
                'datapack.json': JSON.stringify({
                    format: 'demo-builder-datapack',
                    formatVersion: 2,
                    datapack_name: 'x',
                    version: 'v1',
                    data_types: [],
                }),
            }),
            /newer version of Demo Builder/i,
        ],
        [
            'a pack with no name',
            zipOf({
                'datapack.json': JSON.stringify({
                    format: 'demo-builder-datapack',
                    formatVersion: 1,
                    version: 'v1',
                    data_types: [],
                }),
            }),
            /name and a version/i,
        ],
        [
            'a listed type with no data file',
            zipOf({
                'datapack.json': JSON.stringify({
                    format: 'demo-builder-datapack',
                    formatVersion: 1,
                    datapack_name: 'x',
                    version: 'v1',
                    data_types: ['categories', 'products'],
                }),
                'data/categories.json': '[]',
            }),
            /missing the data for: products/i,
        ],
        [
            'a data file that is not JSON',
            zipOf({
                'datapack.json': JSON.stringify({
                    format: 'demo-builder-datapack',
                    formatVersion: 1,
                    datapack_name: 'x',
                    version: 'v1',
                    data_types: ['categories'],
                }),
                'data/categories.json': '{not json',
            }),
            /categories data is not valid JSON/i,
        ],
    ])('refuses %s, in words an SC can act on', (_label, bytes, message) => {
        expect(() => readDatapackZip(bytes)).toThrow(DatapackZipError);
        expect(() => readDatapackZip(bytes)).toThrow(message);
    });

    it('refuses a file that would unpack larger than the cap, before unpacking it', () => {
        const bytes = buildDatapackZip(PACK);
        expect(() => readDatapackZip(bytes, { maxUnpackedBytes: 10 })).toThrow(/too large/i);
    });
});

describe('datapackZipName', () => {
    it('names the file after the pack, with anything unsafe for a filename replaced', () => {
        expect(datapackZipName({ name: 'justrite', version: 'v1' })).toBe(
            'justrite-v1.datapack.zip'
        );
        expect(datapackZipName({ name: 'a/b c', version: '1:2' })).toBe('a_b_c-1_2.datapack.zip');
    });
});

describe('a pack file with its settings layer (datapack-engine step 09)', () => {
    const LAYERED: DatapackFile = { ...PACK, settingsLayer: fileLayer() };

    it('writes the layer as a second section, its rows out of the data folder', () => {
        const files = entries(buildDatapackZip(LAYERED));

        expect(Object.keys(files).sort()).toEqual(['data/categories.json', 'data/customer_groups.json', 'datapack.json', 'settings/store_config.json']);
        expect(JSON.parse(files['settings/store_config.json'])).toEqual([settingRow(GRID, '24')]);
    });

    it('stays format version 1 and leaves the layer out of data_types, so an older extension loads the data as it always did', () => {
        const manifest = JSON.parse(entries(buildDatapackZip(LAYERED))['datapack.json']);

        expect(manifest.formatVersion).toBe(1);
        expect(manifest.data_types).toEqual(['categories', 'customer_groups']);
        expect(manifest.settings_layer).toEqual({ datapack_name: 'justrite-settings', version: '3', display_name: 'Justrite settings' });
    });

    it('reads back the same pack and the same layer', () => {
        const read = readDatapackZip(buildDatapackZip(LAYERED));

        expect(read.items).toEqual(PACK.items);
        expect(read.settingsLayer).toEqual(fileLayer());
    });

    it('reads a section inside one root folder, as macOS Compress leaves it', () => {
        const files = entries(buildDatapackZip(LAYERED));
        const nested = zipOf(Object.fromEntries(Object.entries(files).map(([name, text]) => [`justrite/${name}`, text])));

        expect(readDatapackZip(nested).settingsLayer).toEqual(fileLayer());
    });

    it('has no section and no key for a pack with no layer', () => {
        const bytes = buildDatapackZip(PACK);

        expect(JSON.parse(entries(bytes)['datapack.json'])).not.toHaveProperty('settings_layer');
        expect(readDatapackZip(bytes)).not.toHaveProperty('settingsLayer');
    });

    it('reads an older file, written before the section existed, as it always did', () => {
        const older = zipOf({
            'datapack.json': JSON.stringify({ format: 'demo-builder-datapack', formatVersion: 1, datapack_name: 'justrite', version: 'v1', data_types: ['categories'] }),
            'data/categories.json': '[{"category":{"name":"Signs"}}]',
        });

        const read = readDatapackZip(older);

        expect(read.items).toEqual([{ dataType: 'categories', records: [{ category: { name: 'Signs' } }] }]);
        expect(read).not.toHaveProperty('settingsLayer');
    });

    const manifestWith = (settings_layer: unknown) =>
        JSON.stringify({ format: 'demo-builder-datapack', formatVersion: 1, datapack_name: 'justrite', version: 'v1', data_types: [], settings_layer });

    it("refuses a section naming another pack's layer", () => {
        const file = zipOf({ 'datapack.json': manifestWith({ datapack_name: 'evil', version: '1' }), 'settings/store_config.json': '[]' });

        expect(() => readDatapackZip(file)).toThrow(DatapackZipError);
        expect(() => readDatapackZip(file)).toThrow('justrite-settings');
    });

    it('refuses a section that names no version, or whose rows are missing or not JSON', () => {
        const named = { datapack_name: 'justrite-settings', version: '1' };

        expect(() => readDatapackZip(zipOf({ 'datapack.json': manifestWith({ datapack_name: 'justrite-settings' }), 'settings/store_config.json': '[]' }))).toThrow(DatapackZipError);
        expect(() => readDatapackZip(zipOf({ 'datapack.json': manifestWith(named) }))).toThrow('store settings');
        expect(() => readDatapackZip(zipOf({ 'datapack.json': manifestWith(named), 'settings/store_config.json': '{' }))).toThrow('store settings');
    });
});
