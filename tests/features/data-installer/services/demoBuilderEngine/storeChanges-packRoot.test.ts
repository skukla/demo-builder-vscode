/**
 * "What installing would change" for a pack with a root of its own (datapack-engine step 12): the
 * preview places the root as the install would, so it never counts a root the install will not
 * make, and says beforehand where the categories go or which Admin step installing asks for.
 */

import type { StoreChangesDeps } from '@/features/data-installer/services/demoBuilderEngine/storeAccess';
import { previewChanges } from '@/features/data-installer/services/demoBuilderEngine/storeChanges';
import { FRESCOPA, OWN_TARGET, SHARED_TARGET, categoryStore } from './categoryStore.testUtils';
import { PACK, PROJECT, memoryFiles } from './demoBuilderEngine.testUtils';

async function preview(target: typeof OWN_TARGET) {
    const store = categoryStore();
    const files = memoryFiles();
    const { get, send } = await store.ctx(files, target);
    const deps: StoreChangesDeps = {
        commerce: async () => ({ get, send }),
        readPack: async () => ({ categories: FRESCOPA }),
        describe: async () => ({ displayName: 'Frescopa' }),
        projectPath: PROJECT,
        target,
        log: () => undefined,
        files,
    };
    return previewChanges(deps, PACK, 'library');
}

describe('previewChanges and a pack root', () => {
    it("under the store's own root: two categories to add, not the root, and where they go", async () => {
        const answer = await preview(OWN_TARGET);

        expect(answer.kinds).toEqual([expect.objectContaining({ kind: 'categories', add: { count: 2, names: ['Coffee', 'Coffee/Espresso'] } })]);
        expect(answer.root).toBe("Frescopa's categories would go under the root category of the store Bodea Store, so its storefront shows them.");
    });

    it('a shared root: the root counts too, and the Admin step installing asks for is named', async () => {
        const answer = await preview(SHARED_TARGET);

        expect(answer.kinds).toEqual([expect.objectContaining({ kind: 'categories', add: { count: 3, names: ['(root)', 'Coffee', 'Coffee/Espresso'] } })]);
        expect(answer.root).toBe(
            "The store JustRite Test Store shares its root category with the store justrite_store (website justrite), so Frescopa's categories would go in as a root of their own, and installing asks for one step in the Admin: Stores > All Stores > JustRite Test Store, Root Category: Frescopa.",
        );
    });
});
