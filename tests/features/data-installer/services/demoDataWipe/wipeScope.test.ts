/**
 * Which websites a wipe covers (datapack-simplification step 06): always whole websites, every
 * store of each; a root category is cleared only when every store using it, on any website, is
 * chosen.
 */

import { resolveWipeScope } from '@/features/data-installer/services/demoDataWipe/wipeScope';
import { WipeScopeError } from '@/features/data-installer/services/demoDataWipe/wipeReads';
import type { CommerceStoreStructure } from '@/types/commerceStore';
import { SANDBOX_GROUPS, SANDBOX_VIEWS, SANDBOX_WEBSITES } from '../../../../helpers/commerceWipeFixtures';

const STRUCTURE: CommerceStoreStructure = { websites: SANDBOX_WEBSITES, storeGroups: SANDBOX_GROUPS, storeViews: SANDBOX_VIEWS };

describe('resolveWipeScope', () => {
    it('takes every store of a website, and clears the roots only its stores use', () => {
        const scope = resolveWipeScope(STRUCTURE, ['bodea']);

        expect(scope.stores.map((s) => s.code)).toEqual(['bodea_store', 'bodea_outlet']);
        expect(scope.websiteIds).toEqual([3]);
        expect([...scope.viewIds]).toEqual([3, 4]);
        expect([...scope.clearedRoots]).toEqual(['150', '160']);
        expect([...scope.sharedRoots]).toStrictEqual([]);
    });

    it('does not clear a root a store of a website not chosen also uses', () => {
        const scope = resolveWipeScope(STRUCTURE, ['justrite_test_website']);

        expect([...scope.clearedRoots]).toStrictEqual([]);
        expect([...scope.sharedRoots]).toEqual(['119']);
    });

    it('clears a shared root once every website using it is chosen', () => {
        const scope = resolveWipeScope(STRUCTURE, ['justrite_test_website', 'justrite']);

        expect([...scope.clearedRoots]).toEqual(['119']);
        expect(scope.sharedRoots.size).toBe(0);
    });

    it('keeps one key for the same websites, whichever order they were named in', () => {
        expect(resolveWipeScope(STRUCTURE, ['justrite', 'bodea']).key).toBe(resolveWipeScope(STRUCTURE, ['bodea', 'justrite', 'bodea']).key);
        expect(resolveWipeScope(STRUCTURE, ['bodea', 'justrite']).key).toBe('bodea,justrite');
    });

    it.each([
        [['nope'], 'Commerce has no website nope.'],
        [[], 'Name at least one website to clear.'],
    ])('refuses %j', (codes, message) => {
        expect(() => resolveWipeScope(STRUCTURE, codes)).toThrow(new WipeScopeError(message));
    });
});
