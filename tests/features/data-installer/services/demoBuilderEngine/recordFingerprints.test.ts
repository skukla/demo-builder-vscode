/**
 * After "Save store changes to this pack", the store and the new version start out as one
 * another: every object the record lists is hashed again from the store as it is now, and
 * against the row the new version holds for it (step 05). One the SC deleted is dropped.
 */

import { fingerprintRow } from '@/features/data-installer/services/demoBuilderEngine/fingerprint';
import { rebaseRecord } from '@/features/data-installer/services/demoBuilderEngine/recordFingerprints';
import { packedFingerprint } from '@/features/data-installer/services/demoBuilderEngine/storeCopies';
import { fakeContext } from './demoBuilderEngine.testUtils';

describe('rebaseRecord', () => {
    it('hashes each object afresh against the saved rows, and drops one the store no longer has', async () => {
        const ctx = await fakeContext({
            'categories/41': { id: 41, name: 'Server Racks', path: '1/2/41', is_active: true },
            'categories/2': { id: 2, name: 'Default Category', path: '1/2' },
        });
        const saved = { categories: { categories: [{ category: { name: 'Server Racks', path: 'Default Category', is_active: true } }] } };

        const created = await rebaseRecord(
            ctx,
            [
                { kind: 'categories', id: '41', key: 'Racks', fingerprint: 'old', wrote: 'old' },
                { kind: 'categories', id: '42', key: 'Gone', fingerprint: 'old', wrote: 'old' },
            ],
            saved,
        );

        const row = saved.categories.categories[0];
        expect(created).toEqual([
            {
                kind: 'categories',
                id: '41',
                key: 'Server Racks',
                fingerprint: fingerprintRow({ category: { name: 'Server Racks', path: 'Default Category', is_active: true } }),
                wrote: packedFingerprint('categories', row),
            },
        ]);
    });

    it('keeps what a setting held before the install, so removal still puts it back', async () => {
        const ctx = await fakeContext({
            'inventory/sources?searchCriteria[pageSize]=200': { items: [{ source_code: 'east', name: 'East', enabled: true }] },
            'inventory/stocks?searchCriteria[pageSize]=200': { items: [] },
            'inventory/stock-source-links?searchCriteria[pageSize]=200': { items: [] },
        });

        const [source] = await rebaseRecord(ctx, [{ kind: 'sources', id: 'east', previous: { enabled: false } }], {
            sources: { sources: [{ source: { source_code: 'east', name: 'East', enabled: true } }] },
        });

        expect(source).toMatchObject({ kind: 'sources', id: 'east', key: 'east', previous: { enabled: false } });
    });
});
