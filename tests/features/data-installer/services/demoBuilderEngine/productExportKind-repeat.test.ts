/**
 * Installing a `product_export` pack again (2026-11-06): its products are hashed as product records
 * are, so a reinstall brings an unchanged product up to the pack through one import call, keeps one the
 * SC edited in the Admin, and leaves one the pack no longer changed alone.
 *
 * The fake store keeps products by SKU, makes or updates them from import rows as the Import API does,
 * and answers SKU searches with the products themselves, as `GET products` does.
 */

import { CommerceReadError } from '@/features/app-builder/services/erpFillReaders';
import { installProductExport, parseProductExport } from '@/features/data-installer/services/demoBuilderEngine/productExportKind';
import { recordFingerprints } from '@/features/data-installer/services/demoBuilderEngine/recordFingerprints';
import { applyUpdates, planRepeat } from '@/features/data-installer/services/demoBuilderEngine/repeatInstall';
import { fakeContext } from './demoBuilderEngine.testUtils';

type Row = Record<string, string>;
/** A search for a list of SKUs, whichever order its filter's parts come in (both are sent). */
const SKU_LIST = /^products\?(?=.*\[conditionType\]=in).*\[field\]=sku.*?\[value\]=([^&]*)/u;

const row = (sku: string, name: string): Row => ({ sku, product_type: 'simple', attribute_set_code: 'Default', name, price: '10.000000' });
const pack = (rows: Row[]) => ({ product_export: { source: { entity: 'catalog_product', behavior: 'append', items: rows } } });

async function store() {
    const products = new Map<string, { id: number; sku: string; name: string; type_id: string; price: number }>();
    const imports: Row[][] = [];
    const ctx = await fakeContext();
    ctx.session.websiteCode = 'base';
    ctx.session.rootCategory = { id: 2, name: 'Default Category' };
    ctx.get = async (path) => {
        const list = SKU_LIST.exec(path);
        if (list) {
            const items = decodeURIComponent(list[1]).split(',').map((sku) => products.get(sku.toLowerCase())).filter(Boolean);
            return { items, total_count: items.length };
        }
        if (path.startsWith('categories/list?')) return { items: [] };
        throw new CommerceReadError(`Commerce answered 404 for ${path}`, 404);
    };
    ctx.send = async (_method, path, body) => {
        if (path !== 'import/json') return {};
        const items = (body as { source: { items: Row[] } }).source.items;
        imports.push(items);
        for (const r of items) products.set(r.sku.toLowerCase(), { id: products.get(r.sku.toLowerCase())?.id ?? products.size + 1, sku: r.sku, name: r.name, type_id: 'simple', price: 10 });
        return [`Entities Processed: ${items.length}`];
    };
    return { ctx, products, imports };
}

describe('installing a product_export pack again', () => {
    it("brings an unchanged product up to the pack in one import call, and keeps one the SC edited in the Admin", async () => {
        const { ctx, products, imports } = await store();
        const first = pack([row('EDITED', 'Hoodie'), row('PLAIN', 'Tee'), row('SAME', 'Cap')]);
        await installProductExport(ctx, parseProductExport(first.product_export));
        await recordFingerprints(ctx, first);
        expect(ctx.recorder.created.every((o) => o.fingerprint !== undefined && o.wrote !== undefined)).toBe(true);

        // The SC renames one in the Admin; the pack's next version renames that one and another.
        const edited = products.get('edited');
        if (edited) edited.name = 'Hoodie (SC)';
        imports.length = 0;
        const second = pack([row('EDITED', 'Hoodie v2'), row('PLAIN', 'Tee v2'), row('SAME', 'Cap')]);
        const plans = await planRepeat(ctx, second, ctx.recorder.created);
        await applyUpdates(ctx, plans, 'product_export');

        expect(plans.find((p) => p.kind === 'products')?.objects.map((o) => [o.object.id, o.outcome])).toEqual([
            ['EDITED', 'leave-edited'],
            ['PLAIN', 'update'],
            ['SAME', 'unchanged'],
        ]);
        expect(imports.map((call) => call.map((r) => [r.sku, r.name]))).toEqual([[['PLAIN', 'Tee v2']]]);
        expect(products.get('edited')?.name).toBe('Hoodie (SC)');
        expect(ctx.logged).toContain('brought products PLAIN up to the pack');
    });
});
