/**
 * Moving onto a newer version that changed nothing (walk F223, live 2026-11-17): the install record
 * is carried onto the newer version, and every object the store holds exactly as the newer version's
 * row is hashed afresh from the store, under the newer version's name for it.
 *
 * The live case: a category recorded as "ZZ Customer Picks 2" was renamed "ZZ Customer Picks 3" in the
 * Admin, and a newer version saved from the store held "ZZ Customer Picks 3". The update found nothing
 * to write and moved the project on, but the record kept the old name and hash, so every Uninstall
 * after it asked about "1 item changed since install" that had not changed.
 *
 * Run as the update handler runs it: the check (`previewChanges` with `recordOf`), the record carried
 * (`copyInstallRecord`), then the removal's own check (`previewChanges` on the newer version, read as
 * `changesFromPreview`, what `get-datapack-removal-changes` answers).
 */

import { PACK, PROJECT, NOW, noneUnder } from './demoBuilderEngine.testUtils';
import { deps } from './storeChanges.testUtils';
import { changesFromPreview } from '@/features/data-installer/removalChanges';
import { fingerprintRow } from '@/features/data-installer/services/demoBuilderEngine/fingerprint';
import {
    type CreatedObject,
    openInstallRecord,
    readInstallRecord,
} from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import { copyInstallRecord } from '@/features/data-installer/services/demoBuilderEngine/installRecordUpdate';
import { previewChanges } from '@/features/data-installer/services/demoBuilderEngine/storeChanges';
import { packedFingerprint } from '@/features/data-installer/services/demoBuilderEngine/storeCopies';
import { updateChanges } from '@/features/data-installer/updateChanges';

const NEWER = { name: PACK.name, version: '1.3.0' };

/** A category under the store's root, in pack form: as a save writes it, and as the store's copy reads. */
const categoryRow = (name: string) => ({
    category: { name, path: 'Default Category', is_active: true },
});

/** A recorded category, hashed as an install hashes it: the store's copy, and the row it was made from. */
const recordedCategory = (
    id: string,
    name: string,
    over: Partial<CreatedObject> = {}
): CreatedObject => ({
    kind: 'categories',
    id,
    key: name,
    fingerprint: fingerprintRow(categoryRow(name)),
    wrote: packedFingerprint('categories', categoryRow(name)),
    ...over,
});

const PICKS_2 = 'ZZ Customer Picks 2';
const PICKS_3 = 'ZZ Customer Picks 3';

/** The store: Picks renamed in the Admin to what the newer version holds; Racks renamed to what it does not. */
const STORE = {
    'categories/41': { id: 41, name: PICKS_3, path: '1/2/41', is_active: true },
    'categories/42': { id: 42, name: 'Server Racks', path: '1/2/42', is_active: true },
    ...noneUnder(2, { [PICKS_3]: 'zz-customer-picks-3', Racks: 'racks' }),
};

async function installedOlder(created: CreatedObject[], newerRows: unknown[]) {
    const harness = await deps(false, STORE, { categories: { categories: newerRows } });
    const recorder = await openInstallRecord(harness.files, PROJECT, PACK, NOW);
    for (const object of created) await recorder.record(object);
    return harness;
}

/** The update's check and its confirm: nothing to write, so the record moves onto the newer version. */
async function moveUpToDate(harness: Awaited<ReturnType<typeof installedOlder>>) {
    const check = await previewChanges(harness.d, NEWER, 'library', undefined, {
        recordOf: PACK,
        rebase: true,
    });
    expect(updateChanges(check)).toStrictEqual([]);
    await expect(
        copyInstallRecord(harness.files, PROJECT, PACK, NEWER, check.rebased)
    ).resolves.toBe(true);
    return (await readInstallRecord(harness.files, PROJECT, NEWER))?.created ?? [];
}

const removalChanges = async (harness: Awaited<ReturnType<typeof installedOlder>>) =>
    changesFromPreview(await previewChanges(harness.d, NEWER, 'library'));

describe('moving onto a newer version that changed nothing (F223)', () => {
    it("records the newer version's name and the store's hash for an object the store holds as the newer row, so removal finds no change", async () => {
        const harness = await installedOlder(
            [recordedCategory('41', PICKS_2, { adopted: true })],
            [categoryRow(PICKS_3)]
        );

        const created = await moveUpToDate(harness);

        expect(created).toEqual([
            {
                kind: 'categories',
                id: '41',
                key: PICKS_3,
                adopted: true,
                fingerprint: fingerprintRow(categoryRow(PICKS_3)),
                wrote: packedFingerprint('categories', categoryRow(PICKS_3)),
            },
        ]);
        expect(await removalChanges(harness)).toStrictEqual({ count: 0, kinds: [] });
    });

    it('CONTROL: an object the SC edited away from the newer row keeps its old hash and still counts as a change', async () => {
        const racks = recordedCategory('42', 'Racks');
        const harness = await installedOlder(
            [recordedCategory('41', PICKS_2, { adopted: true }), racks],
            [categoryRow(PICKS_3), categoryRow('Racks')]
        );

        const created = await moveUpToDate(harness);

        expect(created.find((o) => o.id === '42')).toEqual(racks);
        expect(created.find((o) => o.id === '41')?.key).toBe(PICKS_3);
        expect(await removalChanges(harness)).toEqual({
            count: 1,
            kinds: [{ kind: 'categories', count: 1, names: ['Racks'] }],
        });
    });
});
