/**
 * Saving with picks (step 14, items 10 and 11): a store Demo Builder did not fill, saved as what is
 * picked alone, its record listing what it took as the store's own (walk F187); a pack Demo Builder
 * installed, saved with what the SC added by hand and picked, a pick never joining its record; and
 * the pick list leaves out what the pack holds already.
 *
 * The store is the engine suites' path-table fake (`storeChanges.testUtils.ts`): one category the
 * pack made (41, "Server Racks"), and, here, one the SC made by hand (42, "Cables").
 */

import { openInstallRecord, readInstallRecord } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import { forgetPackReads } from '@/features/data-installer/services/packReadCache';
import { listPickable, saveStoreChanges } from '@/features/data-installer/services/demoBuilderEngine/saveStore';
import { NOW, PACK, PROJECT } from './demoBuilderEngine.testUtils';
import { RACKS, SAVE_AS, deps } from './storeChanges.testUtils';

// Pack reads are kept between callers (walk F82): each test starts with none kept.
beforeEach(() => forgetPackReads());

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
    // Walk F187 (owner, 2026-11-16): the demo now uses it and the store holds it, so a save after a
    // rename must find it. Its record lists what it took, marked adopted: no removal takes any of it.
    it('saves what is picked, and records what it took as the store\'s own', async () => {
        const { d, files, written, write } = await deps(false, BY_HAND);

        const result = await saveStoreChanges(d, { saveAs: SAVE_AS, picks: { categories: ['42'] } }, write);

        expect(categoriesIn(written[0].items.find((i) => i.dataType === 'categories')?.records)).toEqual(['Cables']);
        expect(written[0]).not.toHaveProperty('description');
        const record = await readInstallRecord(files, PROJECT, SAVE_AS.id);
        expect(record?.created).toEqual([expect.objectContaining({ kind: 'categories', id: '42', adopted: true, fingerprint: expect.any(String) })]);
        expect(record?.target).toBeDefined();
        expect(result).not.toHaveProperty('readFrom');
        expect(d.readPack).not.toHaveBeenCalled();
    });

    it('says only where it saved, since no pack was installed to be unchanged', async () => {
        const { d, write } = await deps(false, BY_HAND);

        const result = await saveStoreChanges(d, { saveAs: SAVE_AS, picks: { categories: ['42'] } }, write);

        expect(result.sentence).toBe('Saved as Acme Demo.');
    });

    it('refuses, writing nothing, when nothing is picked', async () => {
        const { d, written, write } = await deps(false);

        await expect(saveStoreChanges(d, { saveAs: SAVE_AS, picks: {} }, write)).rejects.toThrow('Select at least one item from Commerce to save. Nothing was saved.');
        expect(written).toStrictEqual([]);
    });

    it('refuses, writing nothing, when the store holds none of what was picked', async () => {
        const { d, written, write } = await deps(false);

        await expect(saveStoreChanges(d, { saveAs: SAVE_AS, picks: { categories: ['99'] } }, write)).rejects.toThrow('Commerce holds none of what was picked, so there is nothing to save.');
        expect(written).toStrictEqual([]);
    });
});

// step-07 E2 (S3-a): a kind ticked whole is listed inside the save, under Export from Commerce,
// rather than read on Next.
describe('a save of whole kinds from a store Demo Builder did not fill', () => {
    it('lists each whole kind inside the save and saves all of it, beside the ids picked', async () => {
        const { d, written, write } = await deps(false, { ...BY_HAND, ...TREE });

        await saveStoreChanges(d, { saveAs: SAVE_AS, wholeKinds: ['categories'] }, write);

        expect(categoriesIn(written[0].items.find((i) => i.dataType === 'categories')?.records)).toEqual(['Server Racks', 'Cables']);
    });

    it("shows the whole kind's row under Export from Commerce from the save's first rows", async () => {
        const { d, write } = await deps(false, { ...BY_HAND, ...TREE });
        const report = jest.fn();

        await saveStoreChanges(d, { saveAs: SAVE_AS, wholeKinds: ['categories'] }, write, report);

        const first = report.mock.calls.find((call) => Array.isArray(call[3]))?.[3] as Array<{ label: string; types?: Array<{ label: string }> }>;
        expect(first[0].label).toBe('Export from Commerce');
        expect(first[0].types?.map((type) => type.label)).toContain('Categories');
    });

    it('stops, writing nothing, when a whole kind cannot be listed', async () => {
        const { d, ctx, written, write } = await deps(false, BY_HAND);
        const refusing = async (path: string): Promise<unknown> => {
            if (path.startsWith('categories/list')) throw new Error('Commerce answered 503.');
            return ctx.get(path);
        };
        d.commerce = async () => ({ get: refusing as typeof ctx.get, send: ctx.send });

        await expect(saveStoreChanges(d, { saveAs: SAVE_AS, wholeKinds: ['categories'] }, write)).rejects.toThrow(
            "Commerce's categories could not be listed, so nothing was saved: Commerce answered 503.",
        );
        expect(written).toStrictEqual([]);
    });

    it('CONTROL: a whole kind counts as something chosen: no "Select at least one item"', async () => {
        const { d, write } = await deps(false, { ...BY_HAND, ...TREE });

        await expect(saveStoreChanges(d, { saveAs: SAVE_AS, wholeKinds: ['categories'] }, write)).resolves.toMatchObject({ saved: SAVE_AS.id });
    });
});

describe('a save of a pack Demo Builder installed, with whole kinds', () => {
    // As the handler refuses it (`PICKS_WITH_PACK`): a save from a pack takes everything the demo uses.
    it('refuses, writing nothing', async () => {
        const { d, written, write } = await deps(true, { ...BY_HAND, ...TREE }, PACK_ROWS);

        await expect(saveStoreChanges(d, { pack: PACK, saveAs: SAVE_AS, wholeKinds: ['categories'] }, write)).rejects.toThrow(
            'A save from a datapack takes everything this demo uses, so no whole data types can be sent with one. Nothing was saved.',
        );
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

    it('takes what the SC made in the demo with nothing picked, and leaves nothing out (walk F85)', async () => {
        const { d, files, written, write } = await deps(true, { ...BY_HAND, ...TREE }, PACK_ROWS);

        const result = await saveStoreChanges(d, { pack: PACK, saveAs: SAVE_AS }, write);

        expect(categoriesIn(written[0].items.find((i) => i.dataType === 'categories')?.records)).toEqual(['Server Racks', 'Cables']);
        expect(result.leftOut).toStrictEqual([]);
        expect(result.sentence).toBe('Saved as Acme Demo. Bodea is unchanged.');
        // Removing the new version must still leave the SC's own category: it is not the engine's.
        expect((await readInstallRecord(files, PROJECT, SAVE_AS.id))?.created.map((o) => o.id)).toEqual(['41']);
    });
});

// Walk F187 (owner, 2026-11-16): build in the Admin, Create, rename in the Admin, Update. The second
// save found nothing: Create kept no record, and the store's category no longer had the datapack's name.
describe('a datapack Create made, saved again after a rename in the Admin', () => {
    async function createdThenRenamed(keepRecord: boolean) {
        const made = await deps(false, BY_HAND);
        await saveStoreChanges(made.d, { saveAs: SAVE_AS, picks: { categories: ['42'] } }, made.write);
        const rows = Object.fromEntries(made.written[0].items.map((i) => [i.dataType, i.records]));
        const renamed = await deps(false, { 'categories/42': { ...BY_HAND['categories/42'], name: 'Cables 2' } }, rows);
        if (keepRecord) for (const [file, text] of made.files.data) renamed.files.data.set(file, text);
        // As the live walk had it: an install that matched everything kept an empty record (F183).
        else await (await openInstallRecord(renamed.files, PROJECT, SAVE_AS.id, NOW)).keep();
        return renamed;
    }
    const NEXT = { id: { name: SAVE_AS.id.name, version: '20261029-190000' }, displayName: 'Acme Demo' };

    it('follows the renamed category into the new version, still the store\'s own', async () => {
        const { d, files, written, write } = await createdThenRenamed(true);

        await saveStoreChanges(d, { pack: SAVE_AS.id, saveAs: NEXT }, write);

        expect(categoriesIn(written[0].items.find((i) => i.dataType === 'categories')?.records)).toEqual(['Cables 2']);
        expect((await readInstallRecord(files, PROJECT, NEXT.id))?.created).toEqual([expect.objectContaining({ kind: 'categories', id: '42', adopted: true })]);
    });

    it('CONTROL: with the empty record an install that matched everything keeps, the save finds nothing', async () => {
        const { d, write } = await createdThenRenamed(false);

        await expect(saveStoreChanges(d, { pack: SAVE_AS.id, saveAs: NEXT }, write)).rejects.toThrow('Commerce no longer holds anything acme-demo-1a2b3c@20261029-183000 made');
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
