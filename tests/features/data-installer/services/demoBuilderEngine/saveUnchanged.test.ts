/**
 * A save that would change nothing writes nothing (walk F89, F124): once a save into the demo's own
 * pack has read the store, it compares what it read with the version the demo uses, row by row.
 */

import { saveStoreChanges } from '@/features/data-installer/services/demoBuilderEngine/saveStore';
import { NOTHING_TO_SAVE, unchangedSince } from '@/features/data-installer/services/demoBuilderEngine/saveUnchanged';
import { PACK } from './demoBuilderEngine.testUtils';
import { deps } from './storeChanges.testUtils';

const category = (name: string) => ({ categories: [{ category: { name, path: 'Default Category' } }] });

describe('unchangedSince', () => {
    it('is unchanged when every data type holds the same rows', () => {
        expect(unchangedSince({ categories: category('Server Racks') }, { categories: category('Server Racks') }, false)).toBe(true);
    });

    it('CONTROL: is changed when a row differs, a row is added, or a data type is new', () => {
        expect(unchangedSince({ categories: category('Server Racks') }, { categories: category('Server Racks Renamed') }, false)).toBe(false);
        expect(
            unchangedSince(
                { categories: category('Server Racks') },
                { categories: { categories: [...category('Server Racks').categories, ...category('Cables').categories] } },
                false,
            ),
        ).toBe(false);
        expect(unchangedSince({ categories: category('Server Racks') }, { categories: category('Server Racks'), customers: [{ email: 'a@b.c' }] }, false)).toBe(false);
    });

    it('CONTROL: is changed when the save would write a settings layer, and when there is nothing to compare', () => {
        expect(unchangedSince({ categories: category('Server Racks') }, { categories: category('Server Racks') }, true)).toBe(false);
        expect(unchangedSince({}, {}, false)).toBe(false);
    });
});

describe('a save into the demo’s own pack with nothing changed', () => {
    const ownPack = { pack: PACK, saveAs: { id: { name: PACK.name, version: 'next' }, displayName: 'Acme Demo' } };

    /** The rows a first save wrote: the store as it is, which a second save then reads again. */
    async function savedOnce(): Promise<Record<string, unknown>> {
        const first = await deps();
        await saveStoreChanges(first.d, ownPack, first.write);
        return Object.fromEntries(first.written[0].items.map((item) => [item.dataType, item.records]));
    }

    it('writes nothing, keeps the version the demo uses, and says so', async () => {
        const { d, written, write } = await deps(true, {}, await savedOnce());

        const result = await saveStoreChanges(d, ownPack, write);

        expect(result.unchanged).toBe(true);
        expect(result.saved).toEqual(PACK);
        expect(result.sentence).toBe(NOTHING_TO_SAVE);
        expect(written).toStrictEqual([]);
    });

    it('CONTROL: saves a new version when the store differs from the version the demo uses', async () => {
        const { d, written, write } = await deps();

        const result = await saveStoreChanges(d, ownPack, write);

        expect(result.unchanged).toBeUndefined();
        expect(written).toHaveLength(1);
    });
});
