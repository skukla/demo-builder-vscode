/**
 * What a save says and refuses before anything is stored (step 14):
 *
 * - item 13: the new version's rows are checked by the install's own parsers first, and a kind
 *   the install would refuse stops the save with the install's reason, nothing stored;
 * - item 14: an id capture could not turn into a name is kept, as before, and named in the
 *   save's sentence and its result.
 */

import { saveStoreChanges } from '@/features/data-installer/services/demoBuilderEngine/saveStore';
import { packRowRefusals } from '@/features/data-installer/services/demoBuilderEngine/runPack';
import { resultLines, saveNote, savingLine } from '@/features/data-installer/services/demoBuilderEngine/saveOutcome';
import { PACK } from './demoBuilderEngine.testUtils';
import { SAVE_AS, deps } from './storeChanges.testUtils';

describe('a save names the ids it kept because it could not name them', () => {
    // Category 41 sits under 88, which the store no longer has: its path keeps 88 as an id.
    const ORPHANED = { 'categories/41': { id: 41, name: 'Server Racks', path: '1/2/88/41', is_active: true } };

    it('keeps the id in the row, and says which ids it kept in the sentence and the result', async () => {
        const { d, written, write } = await deps(true, ORPHANED);

        const result = await saveStoreChanges(d, { pack: PACK, saveAs: SAVE_AS }, write);

        expect(written[0].items).toEqual([
            { dataType: 'categories', records: { categories: [{ category: expect.objectContaining({ name: 'Server Racks', path: 'Default Category/88' }) }] } },
        ]);
        expect(result.unnamed).toEqual(['category 88']);
        expect(result.sentence).toBe(
            'Saved as Acme Demo. Bodea is unchanged. 1 id could not be turned into a name and was kept as it is (category 88); on another store it may point at something else.',
        );
    });

    it('says nothing about ids when every one was named', async () => {
        const { d, write } = await deps();

        const result = await saveStoreChanges(d, { pack: PACK, saveAs: SAVE_AS }, write);

        expect(result.unnamed).toStrictEqual([]);
        expect(result.sentence).toBe('Saved as Acme Demo. Bodea is unchanged.');
    });
});

describe('a save is checked by the install before it is stored', () => {
    it('stops, storing nothing, when the install would refuse a kind, and says which and why', async () => {
        const { d, written, write } = await deps(true, { 'categories/41': { id: 41, name: '', path: '1/2/41', is_active: true } });

        await expect(saveStoreChanges(d, { pack: PACK, saveAs: SAVE_AS }, write)).rejects.toThrow(
            /^Nothing was saved, because the datapack could not be installed again: categories: The datapack's categories are not in the shape Commerce takes: /u,
        );
        expect(written).toStrictEqual([]);
    });
});

describe('packRowRefusals, as a save checks a version', () => {
    it('answers none for rows every install parser takes, and passes a kind it has no parser for', () => {
        const rows = {
            categories: { categories: [{ category: { name: 'Racks', path: 'Default Category' } }] },
            products: [{ product: { sku: 'VR-Rack', name: 'VR Rack', attribute_set_id: 'Default', type_id: 'simple', price: 10 } }],
            something_new: 'not checked',
        };

        expect(packRowRefusals(rows)).toStrictEqual([]);
    });

    it('names each kind the install would refuse, in its own words', () => {
        expect(packRowRefusals({ products: [{ product: {} }], coupons: 'not a list' })).toEqual([
            { kind: 'products', reason: expect.stringMatching(/^The datapack's products are not in the shape Commerce takes/u) },
            { kind: 'coupons', reason: expect.stringMatching(/^The datapack's coupons are not in the shape Commerce takes/u) },
        ]);
    });
});

describe("the saving step's own line", () => {
    it('names what is going into the pack', () => {
        expect(savingLine(['customer_groups'])).toBe('Customer Groups');
        expect(savingLine(['products', 'categories', 'customer_groups'])).toBe('Products, Categories, Customer Groups');
    });

    it('counts once the names would not read at a glance', () => {
        expect(savingLine(['products', 'categories', 'customer_groups', 'source_items'])).toBe('4 data types');
    });
});

// Owner, 2026-11-05: the result named every item the SC had not picked; a new pack holds what was
// picked, and a save into the demo's own pack says what it left out by count.
describe("the result window's lines", () => {
    const LEFT = [{ kind: 'products' as const, count: 139, names: ['NFPA 704'] }, { kind: 'categories' as const, count: 1, names: ['Signs'] }];

    it('counts what was left out, with no names', () => {
        expect(resultLines(LEFT, undefined, [])).toEqual(['Left out, because nothing selected them: 139 products, 1 category.']);
    });

    it('says nothing for a save that left nothing out', () => {
        expect(resultLines([], undefined, [])).toStrictEqual([]);
    });
});

// Owner, 2026-11-05: the result lists what the pack holds, one data type per line, count first.
describe('saveNote', () => {
    const ACME = { name: 'acme-1a2b3c', displayName: 'Acme Test' };

    // J3-1 (owner, 2026-11-12): a save into your own pack ends on its title, "Saved to Acme Test";
    // a body line would say it again (rule 3), and the SC never manages versions (Phase 2).
    it('a save into your own pack has no line: its title says where it went', () => {
        expect(saveNote(ACME, { name: 'acme-1a2b3c' }, 'Scratch 1028')).toBeUndefined();
    });

    // Owner, 2026-11-09 (F85): "Saved as" says where it went; the pack it came from needs no line.
    it('a new pack from another says where it went and that the demo now uses it', () => {
        expect(saveNote(ACME, { name: 'luma' }, 'Scratch 1028')).toBe('Saved as Acme Test. Scratch 1028 now uses it.');
    });

    it('a first pack, from nothing, says only that the demo now uses it', () => {
        expect(saveNote(ACME, undefined, 'Scratch 1028')).toBe('Scratch 1028 now uses Acme Test.');
    });
});
