/**
 * Installing a pack again (step 05): what this engine made is brought up to the pack where the
 * pack changed, what the pack no longer has is taken out, what is new is added, and anything
 * the SC changed in the Admin is kept, never overwritten, and said in one line.
 *
 * Each case drives `installPack` over a fake store whose record already lists what an earlier
 * install made, with the two hashes that install left: the store's copy (`fingerprint`) and the
 * pack's row (`wrote`). The product answers are trimmed `GET products` items in the captured
 * Bodea shape (`CommerceProduct`).
 */

import type { CreatedObject } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import { fingerprintRow } from '@/features/data-installer/services/demoBuilderEngine/fingerprint';
import { keptLine } from '@/features/data-installer/services/demoBuilderEngine/repeatInstall';
import { installPack } from '@/features/data-installer/services/demoBuilderEngine/runPack';
import { packedFingerprint } from '@/features/data-installer/services/demoBuilderEngine/storeCopies';
import type { CommerceProduct } from '@/types/commerceWire';
import { type SentCall, fakeContext, page } from './demoBuilderEngine.testUtils';

const skuIn = (skus: string) =>
    page('products', `&searchCriteria[filterGroups][0][filters][0][field]=sku&searchCriteria[filterGroups][0][filters][0][value]=${encodeURIComponent(skus)}&searchCriteria[filterGroups][0][filters][0][conditionType]=in`);

const SETS = { [page('products/attribute-sets/sets/list')]: { items: [{ attribute_set_id: 4, attribute_set_name: 'Default' }], total_count: 1 } };

/** The store's product as installed: what `GET products` answers for it. */
const AS_INSTALLED: CommerceProduct = { id: 11, sku: 'vrrack', name: 'VR Rack', price: 7500, attribute_set_id: 4, type_id: 'simple' };
/** The same product in pack form, which is what its fingerprint is made from. */
const AS_INSTALLED_ROW = { product: { sku: 'vrrack', name: 'VR Rack', price: 7500, attribute_set_id: 'Default', type_id: 'simple' } };
/** The pack's row as it was installed. */
const PACK_ROW = { product: { sku: 'vrrack', name: 'VR Rack', price: 7500, attribute_set_id: 'Default', type_id: 'simple' } };

const recorded = (extra: Partial<CreatedObject> = {}): CreatedObject => ({
    kind: 'products',
    id: 'vrrack',
    key: 'vrrack',
    fingerprint: fingerprintRow(AS_INSTALLED_ROW),
    wrote: packedFingerprint('products', PACK_ROW),
    ...extra,
});

async function store(product: CommerceProduct | undefined, objects: CreatedObject[] = [recorded()]) {
    const ctx = await fakeContext({ ...SETS, [skuIn('vrrack')]: { items: product ? [product] : [], total_count: product ? 1 : 0 } });
    for (const object of objects) await ctx.recorder.record(object);
    ctx.session.websiteId = 1;
    return ctx;
}

const writes = (sent: SentCall[]) => sent.map((c) => `${c.method} ${c.path}`);

describe('installing a pack again', () => {
    it('brings a product up to the pack when the pack changed and the store is as it was left', async () => {
        const ctx = await store(AS_INSTALLED);
        const changed = { product: { ...PACK_ROW.product, price: 6900 } };

        const outcome = await installPack(ctx, { products: [changed] });

        expect(writes(ctx.sent)).toEqual(['PUT products/vrrack']);
        expect((ctx.sent[0].body as { product: { price: number; attribute_set_id: number } }).product).toMatchObject({ price: 6900, attribute_set_id: 4 });
        expect(ctx.recorder.byKey('products', 'vrrack')?.wrote).toBe(packedFingerprint('products', changed));
        expect(outcome.kept).toStrictEqual([]);
    });

    it('never sends the pack\'s stock block on an update, so a product\'s quantities are not reset', async () => {
        const ctx = await store(AS_INSTALLED);
        const changed = { product: { ...PACK_ROW.product, price: 6900, extension_attributes: { stock_item: { is_in_stock: true } } } };

        await installPack(ctx, { products: [changed] });

        expect((ctx.sent[0].body as { product: { extension_attributes: object } }).product.extension_attributes).not.toHaveProperty('stock_item');
    });

    it('keeps a product the SC changed in the Admin, even when the pack changed it too', async () => {
        const ctx = await store({ ...AS_INSTALLED, price: 5000 });

        const outcome = await installPack(ctx, { products: [{ product: { ...PACK_ROW.product, price: 6900 } }] });

        expect(ctx.sent).toStrictEqual([]);
        expect(outcome.kept).toEqual([{ kind: 'products', key: 'vrrack' }]);
        expect(ctx.recorder.byKey('products', 'vrrack')?.fingerprint).toBe(fingerprintRow(AS_INSTALLED_ROW));
    });

    it('writes nothing when neither the pack nor the store changed', async () => {
        const ctx = await store(AS_INSTALLED);

        const outcome = await installPack(ctx, { products: [PACK_ROW] });

        expect(ctx.sent).toStrictEqual([]);
        expect(outcome.kept).toStrictEqual([]);
    });

    it('takes out a product the pack no longer has, when it is as it was left', async () => {
        const ctx = await store(AS_INSTALLED);

        await installPack(ctx, { products: [] });

        expect(writes(ctx.sent)).toEqual(['DELETE products/vrrack']);
        expect(ctx.recorder.has('products', 'vrrack')).toBe(false);
    });

    it('keeps a product the pack no longer has when the SC changed it', async () => {
        const ctx = await store({ ...AS_INSTALLED, name: 'VR Rack (demo)' });

        const outcome = await installPack(ctx, { products: [] });

        expect(ctx.sent).toStrictEqual([]);
        expect(outcome.kept).toEqual([{ kind: 'products', key: 'vrrack' }]);
    });

    it('keeps a product the SC deleted deleted, and keeps it on the record so the next install does too', async () => {
        const ctx = await store(undefined);

        const outcome = await installPack(ctx, { products: [PACK_ROW] });

        expect(ctx.sent).toStrictEqual([]);
        expect(outcome.kept).toEqual([{ kind: 'products', key: 'vrrack' }]);
        expect(ctx.recorder.has('products', 'vrrack')).toBe(true);
    });

    it('leaves a kind the request did not ask for alone', async () => {
        const ctx = await store(AS_INSTALLED);

        await installPack(ctx, { attribute_sets: [] });

        expect(ctx.sent).toStrictEqual([]);
        expect(ctx.recorder.has('products', 'vrrack')).toBe(true);
    });

    it('changes nothing it made before it kept hashes, and keeps them from now on', async () => {
        const ctx = await store(AS_INSTALLED, [{ kind: 'products', id: 'vrrack' }]);

        await installPack(ctx, { products: [{ product: { ...PACK_ROW.product, price: 6900 } }] });

        expect(ctx.sent).toStrictEqual([]);
        expect(ctx.recorder.byKey('products', 'vrrack')).toEqual({
            kind: 'products',
            id: 'vrrack',
            key: 'vrrack',
            fingerprint: fingerprintRow(AS_INSTALLED_ROW),
            wrote: packedFingerprint('products', { product: { ...PACK_ROW.product, price: 6900 } }),
        });
    });

    it('records both hashes for a product it makes, read back after the write', async () => {
        const ctx = await store(AS_INSTALLED, []);

        await installPack(ctx, { products: [PACK_ROW] });

        expect(writes(ctx.sent)).toEqual(['POST products']);
        expect(ctx.recorder.byKey('products', 'vrrack')).toMatchObject({
            key: 'vrrack',
            fingerprint: fingerprintRow(AS_INSTALLED_ROW),
            wrote: packedFingerprint('products', PACK_ROW),
        });
    });
});

describe('quantities when installing again', () => {
    const CABLE = { product: { sku: 'cable', name: 'Cable', price: 10, attribute_set_id: 'Default', type_id: 'simple' } };
    const quantity = (sku: string) => ({ sku, source_code: 'default', quantity: 5, status: 1 });

    it('sets them only for products made in this install, never over the SC\'s own stock changes', async () => {
        const ctx = await store(AS_INSTALLED);

        await installPack(ctx, { products: [PACK_ROW, CABLE], source_items: { sourceItems: [quantity('vrrack'), quantity('cable')] } });

        const sentQuantities = ctx.sent.filter((c) => c.path === 'inventory/source-items').map((c) => c.body);
        expect(sentQuantities).toEqual([{ sourceItems: [quantity('cable')] }]);
    });

    it('still sets them for a product an install that stopped part-way made, so a re-run finishes it', async () => {
        const ctx = await store(AS_INSTALLED, [{ kind: 'products', id: 'vrrack' }]);

        await installPack(ctx, { products: [PACK_ROW], source_items: { sourceItems: [quantity('vrrack')] } });

        expect(ctx.sent).toEqual([{ method: 'POST', path: 'inventory/source-items', body: { sourceItems: [quantity('vrrack')] } }]);
    });

    it('sends none for a product the SC deleted, which Commerce would refuse', async () => {
        const ctx = await store(undefined);

        await installPack(ctx, { products: [PACK_ROW], source_items: { sourceItems: [quantity('vrrack')] } });

        expect(ctx.sent).toStrictEqual([]);
    });
});

describe('a category the pack no longer has', () => {
    const CATEGORY = { id: 41, name: 'Racks', path: '1/2/41', is_active: true, children: '', custom_attributes: [] };
    const ROW = { category: { name: 'Racks', path: 'Default Category', is_active: true, custom_attributes: [] } };
    const ROOT = { id: 2, name: 'Default Category', path: '1/2' };

    async function categoryStore(children: string) {
        const ctx = await fakeContext({ 'categories/41': { ...CATEGORY, children }, 'categories/2': ROOT });
        await ctx.recorder.record({
            kind: 'categories',
            id: '41',
            key: 'Racks',
            fingerprint: fingerprintRow({ category: { name: 'Racks', path: 'Default Category', is_active: true, custom_attributes: [] } }),
            wrote: packedFingerprint('categories', ROW),
        });
        return ctx;
    }

    it('is taken out when nothing else is in it', async () => {
        const ctx = await categoryStore('');

        await installPack(ctx, { categories: { categories: [] } });

        expect(writes(ctx.sent)).toEqual(['DELETE categories/41']);
    });

    it('is kept when the SC has put a category of their own in it, since Commerce would take that too', async () => {
        const ctx = await categoryStore('77');

        const outcome = await installPack(ctx, { categories: { categories: [] } });

        expect(ctx.sent).toStrictEqual([]);
        // Said the way a whole-pack removal says it, not as an edit of the SC's.
        expect(outcome.kept).toStrictEqual([]);
        expect(outcome.containers).toEqual([expect.objectContaining({ kind: 'category', name: 'Racks', count: 1, holds: 'category' })]);
    });
});

describe('things the SC renamed or deleted in the Admin', () => {
    const RACKS = { category: { name: 'Racks', path: 'Default Category', is_active: true, custom_attributes: [] } };
    const CHILD = { category: { name: 'Wall Racks', path: 'Default Category/Racks', is_active: true, custom_attributes: [] } };

    it('does not make a second category when the SC renamed the one this engine made', async () => {
        const ctx = await fakeContext({
            'categories/41': { id: 41, name: 'Server Racks', path: '1/2/41', is_active: true, children: '42', custom_attributes: [] },
            'categories/42': { id: 42, name: 'Wall Racks', path: '1/2/41/42', is_active: true, children: '', custom_attributes: [] },
            'categories/2': { id: 2, name: 'Default Category', path: '1/2' },
        });
        await ctx.recorder.record({ kind: 'categories', id: '41', key: 'Racks', fingerprint: fingerprintRow(RACKS), wrote: packedFingerprint('categories', RACKS) });
        await ctx.recorder.record({
            kind: 'categories',
            id: '42',
            key: 'Racks/Wall Racks',
            fingerprint: fingerprintRow({ category: { ...CHILD.category, path: 'Default Category/Server Racks' } }),
            wrote: packedFingerprint('categories', CHILD),
        });

        const outcome = await installPack(ctx, { categories: { categories: [RACKS, CHILD] } });

        expect(ctx.sent).toStrictEqual([]);
        expect(outcome.kept).toEqual([{ kind: 'categories', key: 'Racks' }]);
    });

    it('leaves a category the SC deleted deleted, and what the pack hangs under it', async () => {
        const ctx = await fakeContext({ 'categories/2': { id: 2, name: 'Default Category', path: '1/2' } });
        await ctx.recorder.record({ kind: 'categories', id: '41', key: 'Racks', fingerprint: fingerprintRow(RACKS), wrote: packedFingerprint('categories', RACKS) });

        const outcome = await installPack(ctx, { categories: { categories: [RACKS, CHILD] } });

        expect(ctx.sent).toStrictEqual([]);
        expect(outcome.kept).toEqual([{ kind: 'categories', key: 'Racks' }]);
    });

    it('does not make again an attribute the SC deleted', async () => {
        const ROW = { attribute: { attribute_code: 'bodea_fabric', frontend_input: 'select', options: [{ label: 'Wool' }] } };
        const ctx = await fakeContext();
        await ctx.recorder.record({ kind: 'product_attributes', id: 'bodea_fabric', key: 'bodea_fabric', fingerprint: 'as-made', wrote: packedFingerprint('product_attributes', ROW) });

        const outcome = await installPack(ctx, { product_attributes: [ROW] });

        expect(ctx.sent).toStrictEqual([]);
        expect(outcome.kept).toEqual([{ kind: 'product_attributes', key: 'bodea_fabric' }]);
    });
});

describe('keptLine', () => {
    it('says what was kept in one plain line', () => {
        expect(keptLine([])).toBeUndefined();
        expect(keptLine([{ kind: 'products', key: 'vrrack' }])).toBe('Kept 1 thing you had changed in the Admin.');
        expect(keptLine([{ kind: 'products', key: 'a' }, { kind: 'categories', key: 'b' }])).toBe('Kept 2 things you had changed in the Admin.');
    });
});
