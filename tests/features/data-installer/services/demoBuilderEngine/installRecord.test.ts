/**
 * The install record: Demo Builder's engine writes down every Commerce object it creates,
 * as it creates it, so removal can take away exactly that and nothing the store already had
 * (DI-5; rule 1, whatever can be done can be undone).
 */

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
    InstallRecordError,
    forgetInstallRecord,
    installRecordPath,
    nodeRecordFiles,
    openInstallRecord,
    readInstallRecord,
    readProjectRecords,
    removalOrder,
    writeInstallRecord,
} from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import { NOW, PACK, PROJECT, memoryFiles } from './demoBuilderEngine.testUtils';


function stored(files: { data: Map<string, string> }): unknown {
    return JSON.parse(files.data.get(installRecordPath(PROJECT, PACK)) ?? 'null');
}

describe('installRecordPath', () => {
    it('puts one file per pack beside the project', () => {
        expect(installRecordPath(PROJECT, PACK)).toBe(
            path.join(PROJECT, '.demo-builder', 'datapacks', 'bodea-main@1.2.0.json'),
        );
    });

    it.each([
        ['a name that climbs out of the project', { name: '../../etc', version: '1' }],
        ['a version with a path separator', { name: 'bodea', version: '1/2' }],
        ['an empty name', { name: '', version: '1' }],
    ])('refuses %s', (_label, pack) => {
        expect(() => installRecordPath(PROJECT, pack)).toThrow(InstallRecordError);
    });
});

describe('openInstallRecord', () => {
    it('writes each object to disk the moment it is recorded, before the next is created', async () => {
        const files = memoryFiles();
        const recorder = await openInstallRecord(files, PROJECT, PACK, NOW);

        await recorder.record({ kind: 'product_attributes', id: 'bodea_fabric' });

        expect(stored(files)).toEqual({
            format: 1,
            pack: PACK,
            engine: 'demo-builder',
            startedAt: '2026-10-27T18:00:00.000Z',
            created: [{ kind: 'product_attributes', id: 'bodea_fabric' }],
        });
    });

    it('keeps the value a setting had before the install, so removal can put it back', async () => {
        const files = memoryFiles();
        const recorder = await openInstallRecord(files, PROJECT, PACK, NOW);

        await recorder.record({ kind: 'store_config', id: 'default:0:web/seo/use_rewrites', previous: '0' });

        expect(recorder.created).toEqual([
            { kind: 'store_config', id: 'default:0:web/seo/use_rewrites', previous: '0' },
        ]);
    });

    it('continues the record a failed install left, so a re-run skips what it already made', async () => {
        const files = memoryFiles();
        const first = await openInstallRecord(files, PROJECT, PACK, NOW);
        await first.record({ kind: 'categories', id: '41' });

        const second = await openInstallRecord(files, PROJECT, PACK, () => 'later');

        expect(second.has('categories', '41')).toBe(true);
        expect(second.has('categories', '42')).toBe(false);
        await second.record({ kind: 'categories', id: '42' });
        expect(stored(files)).toMatchObject({
            startedAt: '2026-10-27T18:00:00.000Z',
            created: [{ kind: 'categories', id: '41' }, { kind: 'categories', id: '42' }],
        });
    });

    it('does not record the same object twice', async () => {
        const files = memoryFiles();
        const recorder = await openInstallRecord(files, PROJECT, PACK, NOW);

        await recorder.record({ kind: 'categories', id: '41' });
        await recorder.record({ kind: 'categories', id: '41' });

        expect(recorder.created).toHaveLength(1);
    });

    it('drops an object once removal has taken it away, so a failed removal resumes', async () => {
        const files = memoryFiles();
        const recorder = await openInstallRecord(files, PROJECT, PACK, NOW);
        await recorder.record({ kind: 'categories', id: '41' });
        await recorder.record({ kind: 'products', id: 'BD-100' });

        await recorder.drop({ kind: 'products', id: 'BD-100' });

        expect(stored(files)).toMatchObject({ created: [{ kind: 'categories', id: '41' }] });
    });
});

describe('the website and store view the pack was installed to', () => {
    const TARGET = { websiteCode: 'justrite_test_website', storeCode: 'justrite_test_view' };

    it('is written on a new record, so every later read opens the store where the pack went', async () => {
        const files = memoryFiles();
        const recorder = await openInstallRecord(files, PROJECT, PACK, NOW, TARGET);

        await recorder.record({ kind: 'categories', id: '41' });

        expect(recorder.target).toEqual(TARGET);
        expect(stored(files)).toMatchObject({ target: TARGET });
        expect((await readInstallRecord(files, PROJECT, PACK))?.target).toEqual(TARGET);
    });

    it('is kept as first written when the record is carried on, whatever target the re-run names', async () => {
        const files = memoryFiles();
        await (await openInstallRecord(files, PROJECT, PACK, NOW, TARGET)).record({ kind: 'categories', id: '41' });

        const again = await openInstallRecord(files, PROJECT, PACK, NOW, { websiteCode: 'base', storeCode: 'default' });

        expect(again.target).toEqual(TARGET);
    });

    it('is absent on a record written before targets were kept, which still reads', async () => {
        const files = memoryFiles();
        await (await openInstallRecord(files, PROJECT, PACK, NOW)).record({ kind: 'categories', id: '41' });

        const again = await openInstallRecord(files, PROJECT, PACK, NOW, TARGET);

        expect(again.target).toBeUndefined();
        expect(stored(files)).not.toHaveProperty('target');
    });
});

describe('what the record keeps about each object (step 05)', () => {
    it('keeps the pack\'s own name for an object and the two hashes a repeat install compares', async () => {
        const files = memoryFiles();
        const recorder = await openInstallRecord(files, PROJECT, PACK, NOW);
        await recorder.record({ kind: 'categories', id: '41' });

        await recorder.update({ kind: 'categories', id: '41', key: 'Products', fingerprint: 'store-hash', wrote: 'row-hash' });

        expect(stored(files)).toMatchObject({
            created: [{ kind: 'categories', id: '41', key: 'Products', fingerprint: 'store-hash', wrote: 'row-hash' }],
        });
        expect((await readInstallRecord(files, PROJECT, PACK))?.created[0]).toEqual({
            kind: 'categories',
            id: '41',
            key: 'Products',
            fingerprint: 'store-hash',
            wrote: 'row-hash',
        });
    });

    it('keeps what an update does not name, such as the value a setting had before', async () => {
        const files = memoryFiles();
        const recorder = await openInstallRecord(files, PROJECT, PACK, NOW);
        await recorder.record({ kind: 'sources', id: 'east', previous: { enabled: false } });

        await recorder.update({ kind: 'sources', id: 'east', fingerprint: 'h' });

        expect(recorder.created).toEqual([{ kind: 'sources', id: 'east', previous: { enabled: false }, fingerprint: 'h' }]);
    });

    it('updates nothing it has no record of', async () => {
        const files = memoryFiles();
        const recorder = await openInstallRecord(files, PROJECT, PACK, NOW);

        await recorder.update({ kind: 'categories', id: '41', fingerprint: 'h' });

        expect(recorder.created).toStrictEqual([]);
        expect(files.data.size).toBe(0);
    });

    it('finds an object by the pack\'s name for it, so a category renamed in the Admin is still ours', async () => {
        const recorder = await openInstallRecord(memoryFiles(), PROJECT, PACK, NOW);
        await recorder.record({ kind: 'categories', id: '41' });
        await recorder.update({ kind: 'categories', id: '41', key: 'Products' });
        await recorder.record({ kind: 'products', id: 'vrrack' });

        expect(recorder.byKey('categories', 'Products')?.id).toBe('41');
        // A record from before keys were kept: an id that is its own name still answers.
        expect(recorder.byKey('products', 'vrrack')?.id).toBe('vrrack');
        expect(recorder.byKey('categories', 'Other')).toBeUndefined();
    });
});

describe('writeInstallRecord', () => {
    it('writes a whole record under its own pack, as a capture does for the new version', async () => {
        const files = memoryFiles();
        const next = { name: 'bodea-main', version: '1.2.0-saved-20261029-1830' };

        await writeInstallRecord(files, PROJECT, {
            format: 1,
            pack: next,
            engine: 'demo-builder',
            startedAt: '2026-10-27T18:00:00.000Z',
            created: [{ kind: 'products', id: 'vrrack', key: 'vrrack', fingerprint: 'a', wrote: 'b' }],
        });

        expect((await readInstallRecord(files, PROJECT, next))?.created).toEqual([
            { kind: 'products', id: 'vrrack', key: 'vrrack', fingerprint: 'a', wrote: 'b' },
        ]);
    });
});

describe('readInstallRecord', () => {
    it('answers undefined when this engine never installed the pack', async () => {
        await expect(readInstallRecord(memoryFiles(), PROJECT, PACK)).resolves.toBeUndefined();
    });

    it('refuses a record it cannot read, rather than removing nothing and calling it done', async () => {
        const files = memoryFiles({ [installRecordPath(PROJECT, PACK)]: '{"format":1,"created":"no"}' });

        await expect(readInstallRecord(files, PROJECT, PACK)).rejects.toThrow(
            /bodea-main@1\.2\.0.*cannot be read/,
        );
    });

    it('refuses a file that is not JSON', async () => {
        const files = memoryFiles({ [installRecordPath(PROJECT, PACK)]: 'not json' });

        await expect(readInstallRecord(files, PROJECT, PACK)).rejects.toThrow(InstallRecordError);
    });

    it('refuses a record written for a different pack', async () => {
        const files = memoryFiles();
        const other = { name: 'bodea-main', version: '9.9.9' };
        await (await openInstallRecord(files, PROJECT, other, NOW)).record({ kind: 'categories', id: '1' });
        files.data.set(installRecordPath(PROJECT, PACK), files.data.get(installRecordPath(PROJECT, other)) ?? '');

        await expect(readInstallRecord(files, PROJECT, PACK)).rejects.toThrow(/written for bodea-main@9\.9\.9/);
    });
});

describe('readProjectRecords (step 10)', () => {
    it("reads every pack's record beside the project, so a wipe leaves everything Demo Builder made", async () => {
        const files = memoryFiles();
        await (await openInstallRecord(files, PROJECT, PACK, NOW)).record({ kind: 'products', id: 'BD-1' });
        await (await openInstallRecord(files, PROJECT, { name: 'bodea-settings', version: '1' }, NOW)).record({ kind: 'categories', id: '41' });

        const records = await readProjectRecords(files, PROJECT);

        expect(records.map((r) => r.pack.name).sort()).toEqual(['bodea-main', 'bodea-settings']);
        expect(records.flatMap((r) => r.created.map((o) => o.id)).sort()).toEqual(['41', 'BD-1']);
    });

    it('answers none when the project has no records', async () => {
        expect(await readProjectRecords(memoryFiles(), PROJECT)).toStrictEqual([]);
    });

    it('refuses a record it cannot read, rather than wipe what it lists', async () => {
        const files = memoryFiles({ [installRecordPath(PROJECT, PACK)]: '{"format":2}' });

        await expect(readProjectRecords(files, PROJECT)).rejects.toThrow(InstallRecordError);
    });
});

describe('removalOrder', () => {
    it('takes things away in the reverse of the order they were made', async () => {
        const files = memoryFiles();
        const recorder = await openInstallRecord(files, PROJECT, PACK, NOW);
        await recorder.record({ kind: 'attribute_sets', id: '12' });
        await recorder.record({ kind: 'categories', id: '41' });
        await recorder.record({ kind: 'products', id: 'BD-100' });
        const record = await readInstallRecord(files, PROJECT, PACK);

        expect(removalOrder(record!).map((o) => o.id)).toEqual(['BD-100', '41', '12']);
    });
});

describe('forgetInstallRecord', () => {
    it('deletes the file once everything in it is gone', async () => {
        const files = memoryFiles();
        await (await openInstallRecord(files, PROJECT, PACK, NOW)).record({ kind: 'categories', id: '41' });

        await forgetInstallRecord(files, PROJECT, PACK);

        expect(files.data.size).toBe(0);
    });
});

describe('nodeRecordFiles', () => {
    let dir: string;

    beforeEach(async () => {
        dir = await fs.mkdtemp(path.join(os.tmpdir(), 'install-record-'));
    });

    afterEach(async () => {
        await fs.rm(dir, { recursive: true, force: true });
    });

    it('writes, reads and removes a real record, making the folder it needs', async () => {
        const recorder = await openInstallRecord(nodeRecordFiles, dir, PACK, NOW);
        await recorder.record({ kind: 'categories', id: '41' });

        const record = await readInstallRecord(nodeRecordFiles, dir, PACK);
        expect(record?.created).toEqual([{ kind: 'categories', id: '41' }]);

        await forgetInstallRecord(nodeRecordFiles, dir, PACK);
        await expect(readInstallRecord(nodeRecordFiles, dir, PACK)).resolves.toBeUndefined();
    });

    it('lists the record files in a folder, and none for a folder that is not there', async () => {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'records-'));
        try {
            await nodeRecordFiles.write(path.join(dir, 'a@1.json'), '{}');
            expect(await nodeRecordFiles.list(dir)).toEqual(['a@1.json']);
            expect(await nodeRecordFiles.list(path.join(dir, 'missing'))).toStrictEqual([]);
        } finally {
            await fs.rm(dir, { recursive: true, force: true });
        }
    });

    it('treats removing a record that is already gone as done', async () => {
        await expect(forgetInstallRecord(nodeRecordFiles, dir, PACK)).resolves.toBeUndefined();
    });
});

// Step 14 item 1: a create whose answer is lost is still the pack's. Its pending entry is written
// before the create, so a re-run or a removal can look for it.
describe('pending entries', () => {
    it('writes a pending entry to disk, then swaps it for the object once made', async () => {
        const files = memoryFiles();
        const recorder = await openInstallRecord(files, PROJECT, PACK, NOW);

        await recorder.markPending([{ kind: 'products', key: 'vrrack', id: 'vrrack' }]);
        expect(stored(files)).toMatchObject({ created: [], pending: [{ kind: 'products', key: 'vrrack', id: 'vrrack' }] });

        await recorder.confirm([{ kind: 'products', key: 'vrrack', id: 'vrrack' }], [{ kind: 'products', id: 'vrrack' }]);
        expect(stored(files)).toMatchObject({ created: [{ kind: 'products', id: 'vrrack' }] });
        // None pending: the file is as a record written before pending entries existed.
        expect(stored(files)).not.toHaveProperty('pending');
        expect(recorder.pending).toStrictEqual([]);
    });

    it('keeps a pending entry when the same one is marked twice, once', async () => {
        const recorder = await openInstallRecord(memoryFiles(), PROJECT, PACK, NOW);

        await recorder.markPending([{ kind: 'categories', key: 'Bodea/Racks', find: { parentId: 2, name: 'Racks' } }]);
        await recorder.markPending([{ kind: 'categories', key: 'Bodea/Racks', find: { parentId: 2, name: 'Racks' } }]);

        expect(recorder.pending).toHaveLength(1);
    });

    it('forgets a pending entry whose create Commerce refused', async () => {
        const files = memoryFiles();
        const recorder = await openInstallRecord(files, PROJECT, PACK, NOW);
        await recorder.markPending([{ kind: 'coupons', key: 'SPRING' }]);

        await recorder.forgetPending([{ kind: 'coupons', key: 'SPRING' }]);

        expect((await readInstallRecord(files, PROJECT, PACK))?.pending).toBeUndefined();
    });

    it('carries pending entries over when a later install opens the record', async () => {
        const files = memoryFiles();
        await (await openInstallRecord(files, PROJECT, PACK, NOW)).markPending([{ kind: 'customers', key: 'ann@x.test', find: { websiteId: 1 } }]);

        const again = await openInstallRecord(files, PROJECT, PACK, NOW);

        expect(again.pending).toEqual([{ kind: 'customers', key: 'ann@x.test', find: { websiteId: 1 } }]);
    });

    it('still reads a record an earlier version wrote, with no pending entries at all', async () => {
        const files = memoryFiles({
            [installRecordPath(PROJECT, PACK)]: JSON.stringify({
                format: 1, pack: PACK, engine: 'demo-builder', startedAt: NOW(), created: [{ kind: 'products', id: 'vrrack' }],
            }),
        });

        const recorder = await openInstallRecord(files, PROJECT, PACK, NOW);

        expect(recorder.created).toEqual([{ kind: 'products', id: 'vrrack' }]);
        expect(recorder.pending).toStrictEqual([]);
    });
});
