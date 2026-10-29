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
    removalOrder,
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

    it('treats removing a record that is already gone as done', async () => {
        await expect(forgetInstallRecord(nodeRecordFiles, dir, PACK)).resolves.toBeUndefined();
    });
});
