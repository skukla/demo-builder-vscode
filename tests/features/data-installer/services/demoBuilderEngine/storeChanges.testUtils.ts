/**
 * The fake store and save wiring the "Save store changes" suites share (step 05, step 14): a store
 * holding one category the pack made, the pack's rows, and a `writePackToStore` stand-in that
 * keeps the file it is handed.
 */

import type { PackWriteOutcome } from '@/features/data-installer/services/datapackTransfer';
import type { DatapackFile } from '@/features/data-installer/services/datapackZip';
import { fingerprintRow } from '@/features/data-installer/services/demoBuilderEngine/fingerprint';
import { openInstallRecord } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import type { StoreChangesDeps } from '@/features/data-installer/services/demoBuilderEngine/storeAccess';
import { packedFingerprint } from '@/features/data-installer/services/demoBuilderEngine/storeCopies';
import { NOW, PACK, PROJECT, fakeContext, memoryFiles, noneUnder, page } from './demoBuilderEngine.testUtils';

/** The demo's own pack a save writes into (step 07). */
export const SAVE_AS = { id: { name: 'acme-demo-1a2b3c', version: '20261029-183000' }, displayName: 'Acme Demo' };

export const STORE: Record<string, unknown> = {
    'store/websites': [{ id: 1, code: 'base', name: 'Main Website', default_group_id: 1 }],
    'store/storeGroups': [{ id: 1, root_category_id: 2 }],
    'store/storeViews': [{ id: 1, code: 'default', website_id: 1, store_group_id: 1 }],
    'categories/2': { id: 2, name: 'Default Category', path: '1/2' },
    'categories/41': { id: 41, name: 'Server Racks', path: '1/2/41', is_active: true },
    [page('products/attribute-sets/sets/list')]: { items: [], total_count: 0 },
    ...noneUnder(2, { Racks: 'racks', Cables: 'cables' }),
};
export const RACKS = { category: { name: 'Racks', path: 'Default Category', is_active: true } };
export const ITEMS = { categories: { categories: [RACKS, { category: { name: 'Cables', path: 'Default Category' } }] } };

export async function deps(record = true, reads: Record<string, unknown> = {}, items: Record<string, unknown> = ITEMS) {
    const ctx = await fakeContext({ ...STORE, ...reads });
    const files = memoryFiles();
    if (record) {
        const recorder = await openInstallRecord(files, PROJECT, PACK, NOW);
        await recorder.record({ kind: 'categories', id: '41', key: 'Racks', fingerprint: fingerprintRow(RACKS), wrote: packedFingerprint('categories', RACKS) });
    }
    const written: DatapackFile[] = [];
    const d: StoreChangesDeps = {
        commerce: async () => ({ get: ctx.get, send: ctx.send }),
        readPack: jest.fn(async () => items),
        describe: async () => ({ displayName: 'Bodea', description: 'Bodea main' }),
        projectPath: PROJECT,
        target: { websiteCode: 'base', storeCode: 'default' },
        files,
        log: () => undefined,
        now: () => new Date('2026-10-29T18:30:00Z'),
    };
    const write = async (file: DatapackFile): Promise<PackWriteOutcome> => {
        written.push(file);
        return { pack: 'created', stored: file.items.map((i) => i.dataType), failed: [] };
    };
    return { d, ctx, files, written, write };
}

