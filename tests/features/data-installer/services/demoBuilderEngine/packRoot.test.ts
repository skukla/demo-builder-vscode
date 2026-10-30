/**
 * Where a pack's own root goes (datapack-engine step 12): under the store's root when no other
 * store shows it, a root of its own when one does, and on a repeat install wherever the record
 * says the first install put it.
 */

import type { CreatedObject } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import {
    type StoreRoot,
    placeCategories,
    readStoreRoot,
    rootPlacement,
    underStoreRootLine,
} from '@/features/data-installer/services/demoBuilderEngine/packRoot';
import { FRESCOPA, OWN_TARGET, SHARED_TARGET, categoryStore } from './categoryStore.testUtils';
import { memoryFiles } from './demoBuilderEngine.testUtils';

const SHARED: StoreRoot = { storeCode: 'justrite_test_store', storeName: 'JustRite Test Store', rootId: 119, sharedWith: ['the store justrite_store (website justrite)'] };
const OWN: StoreRoot = { storeCode: 'bodea_store', storeName: 'Bodea Store', rootId: 150, sharedWith: [] };
const NO_ROOT = { categories: FRESCOPA.categories };

describe('readStoreRoot', () => {
    it('names the store, its root, and the other store showing the same root', async () => {
        const store = categoryStore();
        const ctx = await store.ctx(memoryFiles(), SHARED_TARGET);

        await expect(readStoreRoot(ctx.get, SHARED_TARGET)).resolves.toEqual(SHARED);
    });

    it('answers no other store for a root only this store shows (the Admin store is never counted)', async () => {
        const store = categoryStore();
        const ctx = await store.ctx(memoryFiles(), OWN_TARGET);

        await expect(readStoreRoot(ctx.get, OWN_TARGET)).resolves.toEqual(OWN);
    });

    it('answers undefined for a store view the store does not have', async () => {
        const ctx = await categoryStore().ctx(memoryFiles(), OWN_TARGET);

        await expect(readStoreRoot(ctx.get, { websiteCode: 'bodea', storeCode: 'nope' })).resolves.toBeUndefined();
    });
});

describe('rootPlacement', () => {
    const made = (key?: string): CreatedObject => ({ kind: 'categories', id: '300', ...(key !== undefined ? { key } : {}) });

    it.each([
        ['a pack with no root of its own', NO_ROOT, [], OWN, undefined],
        ['a first install, the root the store\'s own', FRESCOPA, [], OWN, 'store'],
        ['a first install, the root shared', FRESCOPA, [], SHARED, 'own'],
        ['a first install, the store unread', FRESCOPA, [], undefined, 'own'],
        ['a repeat install whose record holds the root', FRESCOPA, [made('(root)'), made('Coffee')], OWN, 'own'],
        ['a repeat install whose record holds categories and no root', FRESCOPA, [made('Coffee')], SHARED, 'store'],
        ['a record from before keys were kept', FRESCOPA, [made()], OWN, 'own'],
    ])('%s', (_label, categories, created, storeRoot, expected) => {
        expect(rootPlacement(categories, created as CreatedObject[], storeRoot)).toBe(expected);
    });
});

describe('placeCategories', () => {
    it("drops the pack's root under the store's root, and only there", () => {
        const items = { categories: FRESCOPA, products: [] };

        expect(placeCategories(items, 'store')).toEqual({ categories: { categories: FRESCOPA.categories }, products: [] });
        expect(placeCategories(items, 'own')).toBe(items);
        expect(placeCategories(items, undefined)).toBe(items);
    });
});

describe('underStoreRootLine', () => {
    it("says where the pack's categories went, only when they went under the store's root", () => {
        expect(underStoreRootLine('store', FRESCOPA, OWN)).toBe("Frescopa's categories went under the root category of the store Bodea Store, so its storefront shows them.");
        expect(underStoreRootLine('own', FRESCOPA, SHARED)).toBeUndefined();
    });
});
