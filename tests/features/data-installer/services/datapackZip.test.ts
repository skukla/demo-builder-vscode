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
