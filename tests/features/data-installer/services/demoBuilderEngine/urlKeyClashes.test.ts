/**
 * A pack's categories that would take a url key the store already uses (owner, 2026-10-30): read
 * first, refused before any write. Only categories going under the store's root can collide; a
 * pack's own root is attached to no store. The store is the step 12 fake (`categoryStore`), whose
 * `categories/list` answers by `parent_id` with `name` or `url_key`.
 */

import type { CreatedObject } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import { readStoreRoot } from '@/features/data-installer/services/demoBuilderEngine/packRoot';
import { installPack } from '@/features/data-installer/services/demoBuilderEngine/runPack';
import {
    type ClashScope,
    UrlKeyClashError,
    clashLine,
    findUrlKeyClashes,
    packUrlKey,
    placedClashes,
} from '@/features/data-installer/services/demoBuilderEngine/urlKeyClashes';
import type { StoreCategory } from '@/features/data-installer/services/demoBuilderEngine/productLookups';
import { FRESCOPA, OWN_TARGET, categoryStore } from './categoryStore.testUtils';
import { memoryFiles } from './demoBuilderEngine.testUtils';

/** The store's own category "Coffee Beans" under Bodea's root 150, url key "coffee". */
function storeWithCoffeeKey() {
    const store = categoryStore();
    const mine: StoreCategory = {
        id: 900,
        name: 'Coffee Beans',
        parent_id: 150,
        path: '1/150/900',
        children: '',
        custom_attributes: [{ attribute_code: 'url_key', value: 'coffee' }],
    };
    store.categories.set(900, mine);
    return store;
}

/** The check's scope for a first install under `root`, or one whose record holds `created`. */
const under = (storeRootId: number, created: CreatedObject[] = []): ClashScope => ({ storeRootId, created, owned: new Map() });

const withKey = (name: string, path: string, urlKey: string) => ({
    category: { name, path, is_active: true, custom_attributes: [{ attribute_code: 'url_key', value: urlKey }] },
});

describe('packUrlKey', () => {
    it("takes the pack's own url key, else makes one from the name as Commerce does", () => {
        expect(packUrlKey(withKey('Coffee', 'Frescopa', 'beans').category)).toBe('beans');
        expect(packUrlKey({ name: 'Hot & Iced Drinks!', path: 'Frescopa' })).toBe('hot-iced-drinks');
    });
});

describe('findUrlKeyClashes', () => {
    it("names a category the install would create on a url key the store's category already has", async () => {
        const store = storeWithCoffeeKey();
        const ctx = await store.ctx(memoryFiles(), OWN_TARGET);

        await expect(findUrlKeyClashes(ctx.get, FRESCOPA.categories, under(150))).resolves.toEqual([
            { name: 'Coffee', urlKey: 'coffee', storeCategory: 'Coffee Beans' },
        ]);
    });

    it('does not count a category of the same name, which the install reuses', async () => {
        const store = storeWithCoffeeKey();
        store.categories.set(900, { ...store.categories.get(900)!, name: 'Coffee' });
        const ctx = await store.ctx(memoryFiles(), OWN_TARGET);

        await expect(findUrlKeyClashes(ctx.get, FRESCOPA.categories, under(150))).resolves.toStrictEqual([]);
    });

    it("does not count a category this pack's install record holds (made before, renamed in the Admin since)", async () => {
        const ctx = await storeWithCoffeeKey().ctx(memoryFiles(), OWN_TARGET);

        await expect(findUrlKeyClashes(ctx.get, FRESCOPA.categories, under(150, [{ kind: 'categories', id: '900' }]))).resolves.toStrictEqual([]);
    });

    it('checks nothing under a category the install would create, which cannot hold one already', async () => {
        const store = storeWithCoffeeKey();
        // "espresso" under the SC's Coffee Beans: the pack's Espresso sits under its own new Coffee.
        store.categories.set(901, { id: 901, name: 'Mine', parent_id: 900, path: '1/150/900/901', children: '', custom_attributes: [{ attribute_code: 'url_key', value: 'espresso' }] });
        const ctx = await store.ctx(memoryFiles(), OWN_TARGET);
        const categories = [withKey('Coffee', 'Frescopa', 'new-coffee'), withKey('Espresso', 'Frescopa/Coffee', 'espresso')];

        await expect(findUrlKeyClashes(ctx.get, categories, under(150))).resolves.toStrictEqual([]);
    });

    it('positive control: the same key one level down collides under a category the install reuses', async () => {
        const store = storeWithCoffeeKey();
        store.categories.set(901, { id: 901, name: 'Mine', parent_id: 900, path: '1/150/900/901', children: '', custom_attributes: [{ attribute_code: 'url_key', value: 'espresso' }] });
        const ctx = await store.ctx(memoryFiles(), OWN_TARGET);
        const categories = [withKey('Coffee Beans', 'Frescopa', 'coffee'), withKey('Espresso', 'Frescopa/Coffee Beans', 'espresso')];

        await expect(findUrlKeyClashes(ctx.get, categories, under(150))).resolves.toEqual([{ name: 'Espresso', urlKey: 'espresso', storeCategory: 'Mine' }]);
    });
});

describe('placedClashes', () => {
    it("checks nothing when the pack's categories keep a root of their own", async () => {
        const ctx = await storeWithCoffeeKey().ctx(memoryFiles(), OWN_TARGET);

        await expect(placedClashes(ctx.get, { categories: FRESCOPA }, 'own', under(150))).resolves.toStrictEqual([]);
    });

    it('checks a pack with no root of its own, whose categories always go under the store root', async () => {
        const ctx = await storeWithCoffeeKey().ctx(memoryFiles(), OWN_TARGET);

        const found = await placedClashes(ctx.get, { categories: { categories: FRESCOPA.categories } }, undefined, under(150));

        expect(found.map((c) => c.name)).toEqual(['Coffee']);
    });
});

describe('the install', () => {
    it('stops before any write, saying what to change in the Admin', async () => {
        const store = storeWithCoffeeKey();
        const ctx = await store.ctx(memoryFiles(), OWN_TARGET);
        // Bodea's root is its own, so Frescopa's categories go under it (step 12).
        ctx.session.storeRoot = await readStoreRoot(ctx.get, OWN_TARGET);

        await expect(installPack(ctx, { categories: FRESCOPA })).rejects.toBeInstanceOf(UrlKeyClashError);

        expect(store.sent).toStrictEqual([]);
        expect(ctx.recorder.created).toStrictEqual([]);
    });

    it('positive control: the same pack installs on a store with no such key', async () => {
        const store = categoryStore();
        const ctx = await store.ctx(memoryFiles(), OWN_TARGET);
        ctx.session.storeRoot = await readStoreRoot(ctx.get, OWN_TARGET);

        await installPack(ctx, { categories: FRESCOPA });

        expect(store.sent.map((c) => c.method)).toEqual(['POST', 'POST']);
    });
});

describe('clashLine', () => {
    it('says which category, which key, whose, and where to change it', () => {
        expect(clashLine([])).toBeUndefined();
        expect(clashLine([{ name: 'Coffee', urlKey: 'coffee', storeCategory: 'Coffee Beans' }])).toBe(
            'Commerce would refuse one of the pack\'s categories: Coffee (url key "coffee", already used by the store\'s category Coffee Beans). ' +
                "In the Admin, Catalog > Categories, change the store's category's URL Key (Search Engine Optimization), then install.",
        );
        expect(new UrlKeyClashError([{ name: 'Coffee', urlKey: 'coffee', storeCategory: 'Coffee Beans' }]).message).toMatch(/^Nothing was installed\. Commerce would refuse/u);
    });
});
