/**
 * The source_items kind: quantities are set only for products this install made, in batches
 * (DI-5). Rows are Bodea `main`'s own shape, read from the service on 2026-10-27.
 */

import { PRODUCT_KIND } from '@/features/data-installer/services/demoBuilderEngine/productKinds';
import { installSourceItems, parseSourceItems } from '@/features/data-installer/services/demoBuilderEngine/sourceItemsKind';
import { fakeContext } from './demoBuilderEngine.testUtils';

const item = (sku: string) => ({ sku, source_code: 'default', quantity: 1000, status: 1, extension_attributes: {} });

describe('installSourceItems', () => {
    it('sets quantities only for products this install made', async () => {
        const ctx = await fakeContext();
        await ctx.recorder.record({ kind: PRODUCT_KIND, id: 'vrrack' });

        await installSourceItems(ctx, parseSourceItems({ sourceItems: [item('vrrack'), item('theirs')] }));

        expect(ctx.sent).toEqual([{ method: 'POST', path: 'inventory/source-items', body: { sourceItems: [item('vrrack')] } }]);
    });

    it('sends a long list in batches of 100', async () => {
        const ctx = await fakeContext();
        const skus = Array.from({ length: 250 }, (_, i) => `sku-${i}`);
        for (const sku of skus) await ctx.recorder.record({ kind: PRODUCT_KIND, id: sku });

        await installSourceItems(ctx, parseSourceItems({ sourceItems: skus.map(item) }));

        expect(ctx.sent.map((c) => (c.body as { sourceItems: unknown[] }).sourceItems.length)).toEqual([100, 100, 50]);
    });

    // 2026-11-06, live: Luma's 1,901 quantities took 54 s as 20 calls one after another, at about 2.7 s a call.
    it('keeps five calls in flight, and says how far it has got', async () => {
        const ctx = await fakeContext();
        const skus = Array.from({ length: 1_100 }, (_, i) => `sku-${i}`);
        for (const sku of skus) await ctx.recorder.record({ kind: PRODUCT_KIND, id: sku });
        let inFlight = 0;
        let most = 0;
        const sent: number[] = [];
        ctx.send = async (_method, _path, body) => {
            inFlight += 1;
            most = Math.max(most, inFlight);
            await new Promise((resolve) => setImmediate(resolve));
            inFlight -= 1;
            sent.push((body as { sourceItems: unknown[] }).sourceItems.length);
            return [];
        };
        const said: string[] = [];
        ctx.progress = (line) => void said.push(line);

        await installSourceItems(ctx, parseSourceItems({ sourceItems: skus.map(item) }));

        expect(most).toBe(5);
        expect(sent.reduce((a, b) => a + b, 0)).toBe(1_100);
        expect(said.at(-1)).toBe('1,100 of 1,100 stock quantities');
    });

    it('sends nothing when the install made none of the products', async () => {
        const ctx = await fakeContext();

        await installSourceItems(ctx, parseSourceItems({ sourceItems: [item('theirs')] }));

        expect(ctx.sent).toStrictEqual([]);
    });

    it('refuses rows with no quantity', () => {
        expect(() => parseSourceItems({ sourceItems: [{ sku: 'x', source_code: 'default' }] })).toThrow(/stock quantities/);
    });
});
