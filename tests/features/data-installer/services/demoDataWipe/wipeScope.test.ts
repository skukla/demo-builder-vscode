/**
 * Which stores a wipe covers (datapack-engine step 10, owner 2026-10-30): the SC picks stores,
 * ticking a website ticks all of its stores, and what the chosen set owns is judged against the
 * whole set: a root category is cleared only when every store using it is chosen.
 */

import { choicesOf, resolveWipeScope, storeOfView } from '@/features/data-installer/services/demoDataWipe/wipeScope';
import { WipeScopeError } from '@/features/data-installer/services/demoDataWipe/wipeReads';
import type { CommerceStoreStructure } from '@/types/commerceStore';
import { SANDBOX_GROUPS, SANDBOX_VIEWS, SANDBOX_WEBSITES } from '../../../../helpers/commerceWipeFixtures';

const STRUCTURE: CommerceStoreStructure = { websites: SANDBOX_WEBSITES, storeGroups: SANDBOX_GROUPS, storeViews: SANDBOX_VIEWS };

describe('resolveWipeScope', () => {
    it('ticks every store of a website named without a store, so the website is wholly chosen', () => {
        const scope = resolveWipeScope(STRUCTURE, [{ websiteCode: 'bodea' }]);

        expect(scope.stores.map((s) => s.code)).toEqual(['bodea_store', 'bodea_outlet']);
        expect(scope.websites).toEqual({ whole: [3], part: [] });
        expect([...scope.viewIds]).toEqual([3, 4]);
        expect([...scope.clearedRoots]).toEqual(['150', '160']);
    });

    it('marks a website partly chosen when only some of its stores are', () => {
        const scope = resolveWipeScope(STRUCTURE, [{ websiteCode: 'bodea', storeCode: 'bodea_store' }]);

        expect(scope.websites).toEqual({ whole: [], part: [3] });
        expect([...scope.viewIds]).toEqual([3]);
        expect([...scope.clearedRoots]).toEqual(['150']);
        expect(scope.otherRoots.has('160')).toBe(true);
    });

    it('does not clear a root another store not chosen also uses, and names that store', () => {
        const scope = resolveWipeScope(STRUCTURE, [{ websiteCode: 'justrite_test_website', storeCode: 'justrite_test_store' }]);

        expect([...scope.clearedRoots]).toStrictEqual([]);
        expect(scope.sharedRoots.get('119')).toEqual(['the store justrite_store (website justrite)']);
    });

    it('clears a shared root once every store using it is chosen', () => {
        const scope = resolveWipeScope(STRUCTURE, [{ websiteCode: 'justrite_test_website' }, { websiteCode: 'justrite' }]);

        expect([...scope.clearedRoots]).toEqual(['119']);
        expect(scope.sharedRoots.size).toBe(0);
    });

    it('keeps one key for the same stores, whichever way and order they were named', () => {
        const a = resolveWipeScope(STRUCTURE, [{ websiteCode: 'bodea' }]);
        const b = resolveWipeScope(STRUCTURE, [{ websiteCode: 'bodea', storeCode: 'bodea_outlet' }, { websiteCode: 'bodea', storeCode: 'bodea_store' }]);

        expect(b.key).toBe(a.key);
    });

    it.each([
        [[{ websiteCode: 'nope' }], 'The store has no website nope.'],
        [[{ websiteCode: 'bodea', storeCode: 'justrite_store' }], 'The website bodea has no store justrite_store.'],
        [[], 'Name at least one store to clear.'],
    ])('refuses %j', (choices, message) => {
        expect(() => resolveWipeScope(STRUCTURE, choices)).toThrow(new WipeScopeError(message));
    });
});

describe('storeOfView', () => {
    it("finds the store a project's store view belongs to, on its website only", () => {
        expect(storeOfView(STRUCTURE, 'bodea', 'bodea_outlet_en')?.code).toBe('bodea_outlet');
        expect(storeOfView(STRUCTURE, 'justrite', 'bodea_outlet_en')).toBeUndefined();
    });
});

describe('choicesOf', () => {
    it('lists every website and store with its views, ticks the chosen and locks the claimed', () => {
        const scope = resolveWipeScope(STRUCTURE, [{ websiteCode: 'bodea', storeCode: 'bodea_store' }]);

        const choices = choicesOf(STRUCTURE, scope, new Map([[2, 'JustRite records it.']]));

        expect(choices.map((w) => w.code)).toEqual(['base', 'justrite', 'bodea', 'justrite_test_website']);
        expect(choices[2]).toEqual({
            code: 'bodea',
            name: 'Bodea',
            stores: [
                { code: 'bodea_store', name: 'Bodea Store', views: ['Bodea English'], ticked: true },
                { code: 'bodea_outlet', name: 'Bodea Outlet', views: ['Bodea Outlet English'], ticked: false },
            ],
        });
        expect(choices[1].stores[0]).toEqual({ code: 'justrite_store', name: 'JustRite Store', views: ['JustRite US'], ticked: false, claimedBy: 'JustRite records it.' });
    });

    it('lists the choices with nothing ticked when no stores were chosen', () => {
        expect(choicesOf(STRUCTURE, undefined, new Map()).flatMap((w) => w.stores).some((s) => s.ticked)).toBe(false);
    });
});
