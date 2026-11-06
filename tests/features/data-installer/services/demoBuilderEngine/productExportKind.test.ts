/**
 * productExportKind — the Data Installer service's `product_export` kind installed through Commerce's
 * Import API, as the service sends it, with the engine's record kept.
 *
 * The fake imports the way the live Import API did on the ACCS sandbox (2026-11-06): with skip-errors it
 * answers a count that includes refused rows; a configurable whose children are not made yet is refused;
 * a stop-on-errors call names its refused row ("Row 1: …") and imports one that passes. Rows are Luma's
 * own export columns, trimmed.
 */

import { CommerceReadError } from '@/features/app-builder/services/erpFillReaders';
import {
    PARENTS_PER_IMPORT,
    parseProductExport,
    installProductExport,
    PRODUCTS_PER_IMPORT,
} from '@/features/data-installer/services/demoBuilderEngine/productExportKind';
import { fakeContext } from './demoBuilderEngine.testUtils';

type Row = Record<string, unknown> & { sku: string; product_type: string };

const SKU_LIST =
    /^products\?.*\[conditionType\]=in&searchCriteria\[filterGroups\]\[0\]\[filters\]\[0\]\[value\]=([^&]*)/u;
const BAD = 'material=Kevlar';

const child = (sku: string, extra: Partial<Row> = {}): Row => ({
    sku,
    product_type: 'simple',
    attribute_set_code: 'Top',
    categories: 'Luma Catalog/Men/Tops,Luma Catalog/Collections/Eco Friendly',
    product_websites: 'base',
    name: sku,
    price: '52.000000',
    ...extra,
});
const parent = (sku: string, kids: string[]): Row => ({
    sku,
    product_type: 'configurable',
    attribute_set_code: 'Top',
    categories: 'Luma Catalog/Men/Tops',
    product_websites: 'base',
    name: sku,
    configurable_variations: kids.map((k) => `sku=${k},size=XS`).join('|'),
});
const pack = (rows: Row[]) => ({
    source: { entity: 'catalog_product', behavior: 'append', items: rows },
});

/** A store with these SKUs, taking imports as the live Import API does; `imports` holds each call's rows. */
async function store(existing: string[] = [], bareConfigurables: string[] = []) {
    const skus = new Set(existing.map((s) => s.toLowerCase()));
    const imports: Array<{ strategy: string; items: Row[] }> = [];
    let nextCategory = 300;
    const ctx = await fakeContext({}, (call) => {
        if (call.path === 'categories') return { id: nextCategory++ };
        return {};
    });
    ctx.session.websiteCode = 'justrite_test_website';
    ctx.session.storeCode = 'justrite_test_store_us';
    ctx.session.rootCategory = { id: 2, name: 'Default Category' };
    const takes = (row: Row) =>
        !String(row.additional_attributes ?? '').includes(BAD) &&
        (row.product_type !== 'configurable' ||
            String(row.configurable_variations)
                .split('|')
                .every((v) => skus.has(v.split(',')[0].slice(4).toLowerCase())));
    ctx.get = async (path) => {
        const list = SKU_LIST.exec(path);
        if (list) {
            const items = decodeURIComponent(list[1])
                .split(',')
                .filter((s) => skus.has(s.toLowerCase()))
                .map((sku, i) => ({ id: i + 1, sku }));
            return { items, total_count: items.length };
        }
        if (path.startsWith('categories/list?')) return { items: [] };
        // A configurable's options: one the store made bare answers none, as Commerce did (2026-11-06).
        const options = /^configurable-products\/([^/]+)\/options\/all$/u.exec(path);
        if (options) return bareConfigurables.includes(decodeURIComponent(options[1])) ? [] : [{ label: 'Size' }];
        throw new CommerceReadError(`Commerce answered 404 for ${path}`, 404);
    };
    const send = ctx.send;
    ctx.send = async (method, path, body, route) => {
        if (path !== 'import/json') return send(method, path, body, route);
        const source = (body as { source: { validation_strategy: string; items: Row[] } }).source;
        imports.push({ strategy: source.validation_strategy, items: source.items });
        // Validated together, before any is made: a configurable's children must already be there.
        const taken = source.items.filter(takes);
        if (
            source.validation_strategy === 'validation-stop-on-errors' &&
            taken.length < source.items.length
        ) {
            return [
                "Row 1: Value for 'material' attribute contains incorrect value, see acceptable values on settings specified for Admin",
            ];
        }
        for (const row of taken) skus.add(row.sku.toLowerCase());
        return [`Entities Processed: ${source.items.length}`];
    };
    return { ctx, imports, skus };
}

describe('parseProductExport', () => {
    it("reads the service's import body, and refuses one that is not catalog_product", () => {
        expect(parseProductExport(pack([child('MH01-XS-Black')]))).toHaveLength(1);
        expect(() => parseProductExport({ source: { entity: 'customer', items: [] } })).toThrow(
            /product_export rows are not in the shape Commerce takes/
        );
    });
});

describe('installProductExport', () => {
    it("makes the categories, then the children, then their configurable, with the service's substitutions", async () => {
        const { ctx, imports } = await store();
        const rows = [
            parent('MH01', ['MH01-XS-Black', 'MH01-XS-Gray']),
            child('MH01-XS-Black'),
            child('MH01-XS-Gray'),
        ];

        await installProductExport(ctx, parseProductExport(pack(rows)));

        expect(imports.map((call) => call.items.map((r) => r.sku))).toEqual([
            ['MH01-XS-Black', 'MH01-XS-Gray'],
            ['MH01'],
        ]);
        expect(imports[0].items[0]).toMatchObject({
            product_websites: 'justrite_test_website',
            // Every path's root, not only the first's (the service replaces the first alone).
            categories: 'Default Category/Men/Tops,Default Category/Collections/Eco Friendly',
        });
        const created = ctx.recorder.created;
        expect(created.filter((o) => o.kind === 'categories').map((o) => o.key)).toEqual([
            'Men',
            'Collections',
            'Men/Tops',
            'Collections/Eco Friendly',
        ]);
        expect(created.filter((o) => o.kind === 'products')).toEqual([
            { kind: 'products', id: 'MH01-XS-Black', key: 'MH01-XS-Black' },
            { kind: 'products', id: 'MH01-XS-Gray', key: 'MH01-XS-Gray' },
            { kind: 'products', id: 'MH01', key: 'MH01' },
        ]);
        expect(ctx.recorder.pending).toStrictEqual([]);
    });

    it("skips a row Commerce refuses, in Commerce's words, and records the rest", async () => {
        const { ctx, imports } = await store();

        await installProductExport(
            ctx,
            parseProductExport(pack([child('MS01', { additional_attributes: BAD }), child('MS02')]))
        );

        expect(ctx.recorder.created.filter((o) => o.kind === 'products').map((o) => o.id)).toEqual([
            'MS02',
        ]);
        expect(ctx.session.skipped).toEqual([
            {
                kind: 'product_export',
                key: 'MS01',
                reason: "Value for 'material' attribute contains incorrect value, see acceptable values on settings specified for Admin",
            },
        ]);
        // The refused row alone, stopping on its error, for the reason.
        expect(imports[1]).toMatchObject({
            strategy: 'validation-stop-on-errors',
            items: [expect.objectContaining({ sku: 'MS01' })],
        });
        expect(ctx.recorder.pending).toStrictEqual([]);
    });

    it('leaves a SKU the store already has alone, and a product the pack made that the SC deleted since', async () => {
        const { ctx, imports } = await store(['THEIRS']);
        await ctx.recorder.record({ kind: 'products', id: 'DELETED', key: 'DELETED' });

        await installProductExport(
            ctx,
            parseProductExport(pack([child('THEIRS'), child('DELETED'), child('NEW')]))
        );

        expect(imports.flatMap((call) => call.items.map((r) => r.sku))).toEqual(['NEW']);
        expect(ctx.logged).toContain('left THEIRS alone: the store already has it');
        expect(ctx.recorder.created.filter((o) => o.kind === 'products').map((o) => o.id)).toEqual(['DELETED', 'NEW']);
    });

    it(`sends ${PRODUCTS_PER_IMPORT} rows to a call, and says how far it has got`, async () => {
        const { ctx, imports } = await store();
        const progressed: string[] = [];
        ctx.progress = (line) => void progressed.push(line);
        const rows = Array.from({ length: 150 }, (_, i) =>
            child(`S${i}`, { categories: undefined })
        );

        await installProductExport(ctx, parseProductExport(pack(rows)));

        expect(imports.map((call) => call.items.length)).toEqual([100, 50]);
        expect(progressed).toEqual(['100 of 150 products', '150 of 150 products']);
    });

    it(`sends parents ${PARENTS_PER_IMPORT} to a call, and keeps a product's store-view row in its product's call`, async () => {
        const { ctx, imports } = await store();
        const kids = Array.from({ length: 101 }, (_, i) => child(`K${i}`, { categories: undefined }));
        const viewRow = { ...child('K100', { categories: undefined }), store_view_code: 'luma_fr', name: 'K100 FR' };
        const parents = Array.from({ length: 30 }, (_, i) => ({ ...parent(`P${i}`, ['K0']), categories: undefined }));

        await installProductExport(ctx, parseProductExport(pack([...kids, viewRow, ...parents])));

        expect(imports.map((call) => call.items.length)).toEqual([100, 2, PARENTS_PER_IMPORT, 10]);
        expect(imports[1].items.map((r) => [r.sku, r.store_view_code ?? ''])).toEqual([
            ['K100', ''],
            ['K100', 'justrite_test_store_us'],
        ]);
    });

    // Live, 2026-11-06: 80 of 147 configurables made with children linked and no options.
    it('imports a configurable made without its options again alone, and names it when it stays bare', async () => {
        const { ctx, imports } = await store([], ['MH02']);
        const rows = [child('MH01-XS', { categories: undefined }), { ...parent('MH01', ['MH01-XS']), categories: undefined }, { ...parent('MH02', ['MH01-XS']), categories: undefined }];

        await installProductExport(ctx, parseProductExport(pack(rows)));

        expect(imports.map((call) => [call.strategy, call.items.map((r) => r.sku)])).toEqual([
            ['validation-skip-errors', ['MH01-XS']],
            ['validation-skip-errors', ['MH01', 'MH02']],
            ['validation-stop-on-errors', ['MH02']],
        ]);
        expect(ctx.session.skipped).toEqual([{ kind: 'product_export', key: 'MH02', reason: 'Commerce made it with its children but without its options, twice' }]);
    });

    it('leaves the products pending when the import call gets no answer, for the next run to settle', async () => {
        const { ctx } = await store();
        ctx.send = async () => {
            throw new CommerceReadError('Commerce did not respond to import/json: timed out');
        };

        await expect(
            installProductExport(
                ctx,
                parseProductExport(pack([child('MS03', { categories: undefined })]))
            )
        ).rejects.toThrow('timed out');
        expect(ctx.recorder.pending.map((p) => p.key)).toEqual(['MS03']);
    });
});
