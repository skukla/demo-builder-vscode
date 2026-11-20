/**
 * Reads an install and a save no longer repeat (2026-11-09, Luma on Scratch 1028):
 *
 * - a save's record moved onto the new version (`rebaseRecord`) read every recorded object from the
 *   store again, 36 s, moments after the capture read the same store through the same converters;
 * - the install check (`checkAfterInstall`) read all 2,048 products again, 14.8 s, 10 s after the
 *   install's read-back (`recordFingerprints`) read them to hash them.
 *
 * Each is proven here on `memoryStore` with the full cycle's pack, which holds every REST data type
 * (`packCycle.testUtils.ts`): the answer built from what was already read equals the answer read
 * again, and the reads it makes are counted.
 */

import { GRID, configStore } from './storeConfig.testUtils';
import { memoryFiles } from './demoBuilderEngine.testUtils';
import { memoryStore } from './memoryStore.testUtils';
import { PACK_ROWS, commerce, opened } from './packCycle.testUtils';
import { capturePack } from '@/features/data-installer/services/demoBuilderEngine/capture';
import type { KindContext } from '@/features/data-installer/services/demoBuilderEngine/kindContext';
import { rebaseRecord } from '@/features/data-installer/services/demoBuilderEngine/recordFingerprints';
import { installPack } from '@/features/data-installer/services/demoBuilderEngine/runPack';
import { checkAfterInstall } from '@/features/data-installer/services/demoBuilderEngine/verifyInstall';

/** The full cycle's pack installed into an empty store, and a context on it that counts its reads. */
async function installed() {
    const store = memoryStore();
    const access = commerce(store, configStore({ default: { [GRID]: '12' } }));
    const files = memoryFiles();
    const asked: string[] = [];
    const counting = {
        get: (path: string) => (asked.push(path), access.get(path)),
        send: access.send,
    };
    const install = await opened(counting, files, []);
    const outcome = await installPack(install, PACK_ROWS);
    return { store, counting, files, asked, install, outcome };
}

const productSearches = (paths: readonly string[]) =>
    paths.filter((p) => p.startsWith('products?'));

describe("a save's record, built from the capture", () => {
    it('equals the record read back from the store, for every recorded kind, and reads no product, category or attribute', async () => {
        const { store, counting, files, asked } = await installed();
        // The SC's edits since the install, so the record moves with the store, not with the pack.
        const tee = store.products.get('cycle-tee');
        if (tee) tee.price = 24;
        const racks = [...store.categories.values()].find((c) => c.name === 'Cycle Racks');
        if (racks) racks.name = 'Cycle Stands';
        const ctx: KindContext = await opened(counting, files, []);
        const created = ctx.recorder.created;
        const captured = await capturePack(ctx, created, PACK_ROWS);

        const before = asked.length;
        const fromCapture = await rebaseRecord(ctx, created, captured.items, captured);
        const readsFromCapture = asked.slice(before);
        const readBack = await rebaseRecord(ctx, created, captured.items);

        expect(fromCapture).toEqual(readBack);
        // The control: every kind the pack made is on the record compared, so "equal" covers each.
        expect(new Set(fromCapture.map((o) => o.kind))).toEqual(
            new Set(created.map((o) => o.kind))
        );
        expect(fromCapture.find((o) => o.kind === 'categories')?.key).toBe('Cycle Stands');
        expect(productSearches(readsFromCapture)).toStrictEqual([]);
        expect(
            readsFromCapture.filter(
                (p) => p.startsWith('categories') || p.startsWith('products/attributes/')
            )
        ).toStrictEqual([]);
        expect(readsFromCapture.length).toBeLessThan(
            asked.length - before - readsFromCapture.length
        );
    });
});

describe('the install check, after a first install', () => {
    it("reads no product the install's read-back read, and finds what reading them again finds", async () => {
        const { counting, asked, install, outcome } = await installed();
        const ctx: KindContext = { ...install, ...counting };

        const before = asked.length;
        const reused = await checkAfterInstall(ctx, PACK_ROWS, outcome.kept, outcome.productsRead);
        const readsReused = asked.slice(before);
        const readAgain = await checkAfterInstall(ctx, PACK_ROWS, outcome.kept);

        expect(outcome.productsRead?.map((p) => p.sku).sort()).toEqual(['cycle-gift', 'cycle-tee']);
        expect(reused).toEqual(readAgain);
        // Both name the same two select values as differing: this store keeps no select value in the
        // form the check reads them back in, either way. The verdict being the same is the point.
        expect(reused.check).toMatchObject({ verdict: 'differs', checked: 2, valuesDiffer: { count: 2 } });
        expect(productSearches(readsReused)).toStrictEqual([]);
        // The control: checking without them reads the products by SKU.
        expect(
            productSearches(asked.slice(before + readsReused.length)).some((p) =>
                p.includes('[field]=sku')
            )
        ).toBe(true);
    });

    // Only the read-back's copy is changed, so a difference found can only have come from it.
    it('judges each product as the read-back read it', async () => {
        const { counting, install, outcome } = await installed();
        const tee = outcome.productsRead?.find((p) => p.sku === 'cycle-tee');
        if (tee) tee.price = 99;

        const checked = await checkAfterInstall(
            { ...install, ...counting },
            PACK_ROWS,
            outcome.kept,
            outcome.productsRead
        );

        expect(checked.check?.pricesDiffer).toEqual({
            count: 1,
            examples: [{ sku: 'cycle-tee', pack: 20, store: 99 }],
        });
    });

    // An unchanged reinstall hashes nothing new, so its read-back reads no product: the check reads them all, as before.
    it('has nothing to reuse after a reinstall that changed nothing', async () => {
        const { counting, files } = await installed();

        const again = await installPack(await opened(counting, files, []), PACK_ROWS);

        expect(again.productsRead).toBeUndefined();
    });
});
