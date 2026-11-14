/**
 * "N added" (step-07 E1, P4-Q3): what the SC added by hand since the install, counted by type, read
 * the way a save finds what it takes beyond the record (`demoUses.ts`): the rows of this demo the
 * installed datapack does not hold. Reads only.
 *
 * The store is `memoryStore` with the full cycle's pack installed (`packCycle.testUtils.ts`), which
 * holds every REST data type, so "nothing added" after a plain install is checked for each of them.
 * Another demo shares the instance, as on Scratch 1028: its product sits on website 2, and its
 * customer is in a group of its own.
 */

import { GRID, configStore } from './storeConfig.testUtils';
import { PACK, PROJECT, memoryFiles } from './demoBuilderEngine.testUtils';
import { type MemoryStore, memoryStore } from './memoryStore.testUtils';
import { PACK_ROWS, TARGET, commerce, opened } from './packCycle.testUtils';
import { addedSinceInstall } from '@/features/data-installer/services/demoBuilderEngine/demoAdditions';
import { installPack } from '@/features/data-installer/services/demoBuilderEngine/runPack';
import type { StoreChangesDeps } from '@/features/data-installer/services/demoBuilderEngine/storeAccess';
import { forgetPackReads } from '@/features/data-installer/services/packReadCache';
import type { CommerceProduct } from '@/types/commerceWire';

beforeEach(() => forgetPackReads());

/** The full cycle's pack installed into an empty store, and the deps a changes read opens it with. */
async function installed(): Promise<{ store: MemoryStore; deps: StoreChangesDeps }> {
    const store = memoryStore();
    const access = commerce(store, configStore({ default: { [GRID]: '12' } }));
    const files = memoryFiles();
    await installPack(await opened(access, files, []), PACK_ROWS);
    const deps: StoreChangesDeps = {
        commerce: async () => access,
        readPack: async () => PACK_ROWS,
        describe: async () => ({ displayName: 'Cycle' }),
        projectPath: PROJECT,
        target: TARGET,
        files,
        log: () => undefined,
    };
    return { store, deps };
}

const product = (sku: string, name: string, website: number): CommerceProduct => ({
    sku,
    name,
    type_id: 'simple',
    attribute_set_id: 4,
    extension_attributes: { website_ids: [website] },
});

describe('what the SC added by hand since the install', () => {
    it('is nothing right after the install: the datapack holds every row of every type it put in', async () => {
        const { deps } = await installed();

        expect(await addedSinceInstall(deps, PACK)).toStrictEqual([]);
    });

    it("counts a product added on the project's website, by type, with its name", async () => {
        const { store, deps } = await installed();
        store.products.set('hand-tee', product('hand-tee', 'Hand Tee', 1));

        expect(await addedSinceInstall(deps, PACK)).toStrictEqual([
            { kind: 'products', count: 1, names: ['Hand Tee'] },
        ]);
    });

    it("leaves out another demo's records on the same instance", async () => {
        const { store, deps } = await installed();
        store.products.set('their-phone', product('their-phone', 'Their Phone', 2));
        store.groups.set(90, { id: 90, code: 'Their VIP', tax_class_id: 3 });
        store.customers.set(91, {
            id: 91,
            email: 'them@else.example.com',
            firstname: 'Th',
            lastname: 'Em',
            website_id: 2,
            group_id: 90,
        });

        expect(await addedSinceInstall(deps, PACK)).toStrictEqual([]);
    });

    it('is nothing when Demo Builder has no install record of the datapack: nothing can be told apart', async () => {
        const { deps } = await installed();

        expect(
            await addedSinceInstall(deps, { name: 'never-installed', version: '1' })
        ).toStrictEqual([]);
    });
});
