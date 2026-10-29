/**
 * A whole pack: kinds install in the store's order, a kind the engine cannot install is refused
 * before any write, and removal walks the record newest first, dropping each object as it goes
 * (DI-5).
 */

import { CommerceReadError } from '@/features/app-builder/services/erpFillReaders';
import { installRecordPath, openInstallRecord, readInstallRecord } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import {
    INSTALLABLE_KINDS,
    UnsupportedKindsError,
    installPack,
    removePack,
} from '@/features/data-installer/services/demoBuilderEngine/runPack';
import { NOW, PACK, PROJECT, type SentCall, fakeContext, memoryFiles } from './demoBuilderEngine.testUtils';

describe('installPack', () => {
    it('runs the kinds the pack holds in the store\'s order, whatever order the pack lists them in', async () => {
        const ctx = await fakeContext({
            'products/attribute-sets/sets/list?searchCriteria[currentPage]=1&searchCriteria[pageSize]=100': { items: [], total_count: 0 },
        });
        const seen: string[] = [];

        await installPack(ctx, { source_items: { sourceItems: [] }, attribute_sets: [] }, (kind) => seen.push(kind));

        expect(seen).toEqual(['attribute_sets', 'source_items']);
    });

    it('refuses a pack holding a kind it cannot install, before writing anything', async () => {
        const ctx = await fakeContext();

        await expect(installPack(ctx, { categories: { categories: [] }, customers: [], cart_rules: [] })).rejects.toThrow(
            new UnsupportedKindsError(['customers', 'cart_rules']),
        );
        expect(ctx.sent).toStrictEqual([]);
    });

    it('names, in order, every catalog kind it installs', () => {
        expect(INSTALLABLE_KINDS).toEqual([
            'attribute_sets',
            'product_attributes',
            'attribute_assign_to_set',
            'categories',
            'stocks',
            'sources',
            'stock_source_links',
            'products',
            'source_items',
        ]);
    });
});

describe('removePack', () => {
    async function recorded(files: ReturnType<typeof memoryFiles>) {
        const recorder = await openInstallRecord(files, PROJECT, PACK, NOW);
        await recorder.record({ kind: 'categories', id: '41' });
        await recorder.record({ kind: 'products', id: 'vrrack' });
    }

    it('takes back what the record lists, newest first, then deletes the record', async () => {
        const files = memoryFiles();
        await recorded(files);
        const ctx = await fakeContext();

        const result = await removePack(ctx, files, { projectPath: PROJECT, pack: PACK });

        expect(ctx.sent).toEqual<SentCall[]>([
            { method: 'DELETE', path: 'products/vrrack', body: undefined },
            { method: 'DELETE', path: 'categories/41', body: undefined },
        ]);
        expect(result).toEqual({ removed: 2, noRecord: false });
        expect(files.data.has(installRecordPath(PROJECT, PACK))).toBe(false);
    });

    it('answers that there is no record when this engine never installed the pack', async () => {
        const ctx = await fakeContext();

        await expect(removePack(ctx, memoryFiles(), { projectPath: PROJECT, pack: PACK })).resolves.toEqual({ removed: 0, noRecord: true });
        expect(ctx.sent).toStrictEqual([]);
    });

    it('stops at an object Commerce refuses, keeping it and the older ones on the record', async () => {
        const files = memoryFiles();
        await recorded(files);
        const ctx = await fakeContext({}, (call) => {
            if (call.path === 'categories/41') throw new CommerceReadError('Commerce answered 500', 500);
            return true;
        });

        await expect(removePack(ctx, files, { projectPath: PROJECT, pack: PACK })).rejects.toThrow(
            'Could not take back categories 41: Commerce answered 500',
        );
        expect((await readInstallRecord(files, PROJECT, PACK))?.created).toEqual([{ kind: 'categories', id: '41' }]);
    });
});
