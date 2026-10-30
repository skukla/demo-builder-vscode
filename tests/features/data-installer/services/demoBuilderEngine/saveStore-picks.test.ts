/**
 * Saving with picks (step 14, items 10 and 11): a store Demo Builder did not fill, saved as what is
 * picked alone; a pack Demo Builder installed, saved with what the SC added by hand and picked; a
 * pick never joins the install record; and the pick list leaves out what the pack holds already.
 *
 * The store is the engine suites' path-table fake (`storeChanges.testUtils.ts`): one category the
 * pack made (41, "Server Racks"), and, here, one the SC made by hand (42, "Cables").
 */

import { installRecordPath, readInstallRecord } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import { listPickable, saveStoreChanges } from '@/features/data-installer/services/demoBuilderEngine/saveStore';
import { PACK, PROJECT } from './demoBuilderEngine.testUtils';
import { RACKS, SAVE_AS, deps } from './storeChanges.testUtils';

const BY_HAND = { 'categories/42': { id: 42, name: 'Cables', path: '1/2/42', is_active: true } };
const TREE = {
    'categories/list?searchCriteria[currentPage]=1&searchCriteria[pageSize]=100': {
        items: [
            { id: 2, name: 'Default Category', path: '1/2' },
            { id: 41, name: 'Server Racks', path: '1/2/41' },
            { id: 42, name: 'Cables', path: '1/2/42' },
        ],
        total_count: 3,
    },
};

/** The installed version: the one category the pack made. */
const PACK_ROWS = { categories: { categories: [RACKS] } };

const categoriesIn = (records: unknown) => ((records as { categories: Array<{ category: { name: string } }> }).categories ?? []).map((r) => r.category.name);

describe('a save of picks from a store Demo Builder did not fill', () => {
    it('saves what is picked, and writes no install record: the engine made none of it', async () => {
        const { d, files, written, write } = await deps(false, BY_HAND);

        const result = await saveStoreChanges(d, { saveAs: SAVE_AS, picks: { categories: ['42'] } }, write);

        expect(categoriesIn(written[0].items.find((i) => i.dataType === 'categories')?.records)).toEqual(['Cables']);
        expect(written[0]).not.toHaveProperty('description');
        expect(files.data.has(installRecordPath(PROJECT, SAVE_AS.id))).toBe(false);
        expect(result).not.toHaveProperty('readFrom');
        expect(d.readPack).not.toHaveBeenCalled();
    });

    it('says only where it saved, since no pack was installed to be unchanged', async () => {
        const { d, write } = await deps(false, BY_HAND);

        const result = await saveStoreChanges(d, { saveAs: SAVE_AS, picks: { categories: ['42'] } }, write);

        expect(result.sentence).toBe('Saved to the Acme Demo pack.');
    });

    it('refuses, writing nothing, when nothing is picked', async () => {
        const { d, written, write } = await deps(false);

        await expect(saveStoreChanges(d, { saveAs: SAVE_AS, picks: {} }, write)).rejects.toThrow('Pick at least one thing from the store to save. Nothing was saved.');
        expect(written).toStrictEqual([]);
    });

    it('refuses, writing nothing, when the store holds none of what was picked', async () => {
        const { d, written, write } = await deps(false);

        await expect(saveStoreChanges(d, { saveAs: SAVE_AS, picks: { categories: ['99'] } }, write)).rejects.toThrow('The store holds none of what was picked, so there is nothing to save.');
        expect(written).toStrictEqual([]);
    });
});

describe('a save of a pack Demo Builder installed, with picks', () => {
    it('saves the pack and what was picked, and moves only what the engine made onto the record', async () => {
        const { d, files, written, write } = await deps(true, BY_HAND, PACK_ROWS);

        await saveStoreChanges(d, { pack: PACK, saveAs: SAVE_AS, picks: { categories: ['42'] } }, write);

        expect(categoriesIn(written[0].items.find((i) => i.dataType === 'categories')?.records)).toEqual(['Server Racks', 'Cables']);
        const moved = await readInstallRecord(files, PROJECT, SAVE_AS.id);
        // Removing the new version must leave the SC's own category: it is not the engine's.
        expect(moved?.created.map((o) => o.id)).toEqual(['41']);
    });

    it('says what it left out of the store, because nothing picked it', async () => {
        const { d, write } = await deps(true, { ...BY_HAND, ...TREE }, PACK_ROWS);

        const result = await saveStoreChanges(d, { pack: PACK, saveAs: SAVE_AS }, write);

        expect(result.leftOut).toContainEqual({ kind: 'categories', count: 1, names: ['Cables'] });
        expect(result.sentence).toMatch(/^Saved to the Acme Demo pack\. Bodea is unchanged\. Left out, because nothing picked them: 1 category \(Cables\)/u);
    });
});

describe('listPickable', () => {
    it('lists what the SC made by hand: the pack holds the rest, and says how many', async () => {
        const { d } = await deps(true, TREE, PACK_ROWS);

        const page = await listPickable(d, 'categories', PACK);

        expect(page).toEqual({ items: [{ id: '42', displayName: 'Cables', key: 'Cables' }], totalCount: 2, excludedCount: 0, inPackCount: 1 });
    });

    it('lists the whole kind for a store Demo Builder did not fill', async () => {
        const { d } = await deps(false, TREE);

        const page = await listPickable(d, 'categories');

        expect(page.items.map((i) => i.id)).toEqual(['41', '42']);
        expect(page.inPackCount).toBe(0);
    });
});
