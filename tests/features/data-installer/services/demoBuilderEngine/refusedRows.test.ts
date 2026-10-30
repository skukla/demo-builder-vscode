/**
 * One refused row does not stop the rest (step 14 item 3): the row is skipped, the install carries
 * on, and the note names each skipped row with Commerce's reason; a row that needs a skipped one is
 * skipped with it, by name. What is the store's fault still stops the install.
 */

import { CommerceReadError } from '@/features/app-builder/services/erpFillReaders';
import { installAssignments, installAttributeSets, parseAssignmentRows, parseAttributeSetRows } from '@/features/data-installer/services/demoBuilderEngine/attributeSetsKind';
import { filterBy } from '@/features/data-installer/services/demoBuilderEngine/b2bReads';
import { installCategories, parseCategoryPack } from '@/features/data-installer/services/demoBuilderEngine/categoriesKind';
import { installCoupons, parseCouponRows } from '@/features/data-installer/services/demoBuilderEngine/couponsKind';
import { installCustomers, parseCustomerRows } from '@/features/data-installer/services/demoBuilderEngine/customerKinds';
import { MissingNameError, newCatalogSession } from '@/features/data-installer/services/demoBuilderEngine/kindContext';
import { installProducts, parseProductRows } from '@/features/data-installer/services/demoBuilderEngine/productsKind';
import { isRowRefusal, reasonOf, skippedLine } from '@/features/data-installer/services/demoBuilderEngine/refusedRows';
import { installPack } from '@/features/data-installer/services/demoBuilderEngine/runPack';
import { installAssignments as installCatalogAssignments } from '@/features/data-installer/services/demoBuilderEngine/sharedCatalogKinds';
import { installStockSourceLinks, parseStockSourceLinks } from '@/features/data-installer/services/demoBuilderEngine/stockKinds';
import { by, type SentCall, childSearch, fakeContext, page } from './demoBuilderEngine.testUtils';

const EMPTY = { items: [], total_count: 0 };
const refused = (path: string, body: object) => new CommerceReadError(`Commerce answered 400 for ${path}: ${JSON.stringify(body)}`, 400);
const product = (sku: string, extra: object = {}) => ({ product: { sku, name: sku, type_id: 'simple', attribute_set_id: 4, ...extra } });

describe('what is the row\'s fault', () => {
    it.each([
        ['a 400', new CommerceReadError('Commerce answered 400 for products: {}', 400), true],
        ['a 404', new CommerceReadError('Commerce answered 404 for products/attribute-sets/attributes: {}', 404), true],
        ['a 409', new CommerceReadError('x', 409), true],
        ['a 422', new CommerceReadError('x', 422), true],
        ['a name the store lacks', new MissingNameError('categories', 'racks', 'The store has no category with the url key racks.'), true],
        ['a 401', new CommerceReadError('x', 401), false],
        ['a 403', new CommerceReadError('x', 403), false],
        ['a 429', new CommerceReadError('x', 429), false],
        ['a 500', new CommerceReadError('x', 500), false],
        ['no answer at all', new CommerceReadError('Commerce did not answer products: timed out'), false],
        ['anything else', new Error('Commerce did not answer the new cart rule Spring\'s id.'), false],
    ])('%s: %s', (_label, error, rows) => {
        expect(isRowRefusal(error)).toBe(rows);
    });

    it("gives Commerce's own message, with its parameters filled in", () => {
        const error = refused('products', { message: 'The value of attribute "%1" must be set.', parameters: ['color'] });

        expect(reasonOf(newCatalogSession(), error)).toBe('The value of attribute "color" must be set.');
    });

    it('says one line naming each skipped row and why', () => {
        expect(skippedLine([{ kind: 'products', key: 'p2', reason: 'Invalid SKU.' }, { kind: 'categories', key: 'Default Category/Racks/Wall', reason: 'its parent category Racks was skipped' }])).toBe(
            'Skipped 2 rows, and installed the rest: products p2 (Invalid SKU); categories Default Category/Racks/Wall (its parent category Racks was skipped).',
        );
        expect(skippedLine([])).toBeUndefined();
    });
});

describe('a row Commerce refuses is skipped and the rest go in', () => {
    it('makes the products after the refused one, and the outcome names it with Commerce\'s reason', async () => {
        const ctx = await fakeContext({}, (call: SentCall) => {
            if ((call.body as { product: { sku: string } }).product.sku === 'p2') throw refused('products', { message: 'The value of attribute "%1" must be set.', parameters: ['color'] });
            return {};
        });
        ctx.session.websiteId = 1;

        const outcome = await installPack(ctx, { products: [product('p1'), product('p2'), product('p3')] });

        expect(ctx.recorder.created.map((o) => o.id)).toEqual(['p1', 'p3']);
        expect(ctx.recorder.pending).toStrictEqual([]);
        expect(outcome.skipped).toEqual([{ kind: 'products', key: 'p2', reason: 'The value of attribute "color" must be set.' }]);
    });

    it('stops the install on what is the store\'s fault: no answer, a 5xx, or Commerce refusing who we are', async () => {
        for (const error of [new CommerceReadError('Commerce did not answer products: timed out'), new CommerceReadError('x', 503), new CommerceReadError('x', 401)]) {
            const ctx = await fakeContext({}, () => {
                throw error;
            });
            ctx.session.websiteId = 1;

            await expect(installPack(ctx, { products: [product('p1'), product('p2')] })).rejects.toBe(error);
            expect(ctx.sent).toHaveLength(1);
        }
    });
});

describe('a row other rows need takes them with it, by name', () => {
    it('skips the children of a refused category and the products in it, saying which they needed', async () => {
        const ctx = await fakeContext(
            {
                [childSearch(2, 'Racks')]: { items: [] },
                [childSearch(2, 'Desks')]: { items: [] },
                [page('categories/list', by('url_key', 'racks'))]: EMPTY,
            },
            (call: SentCall) => {
                if (call.path === 'categories') {
                    if ((call.body as { category: { name: string } }).category.name === 'Racks') throw refused('categories', { message: 'URL key for specified store already exists.' });
                    return { id: 50 };
                }
                return {};
            },
        );
        ctx.session.websiteId = 1;
        const racks = { name: 'Racks', path: 'Default Category', custom_attributes: [{ attribute_code: 'url_key', value: 'racks' }] };

        await installCategories(ctx, parseCategoryPack({ categories: [{ category: racks }, { category: { name: 'Wall', path: 'Default Category/Racks' } }, { category: { name: 'Desks', path: 'Default Category' } }] }));
        await installProducts(ctx, parseProductRows([product('vrrack', { custom_attributes: [{ attribute_code: 'category_ids', value: 'racks' }] }), product('desk')]));

        expect(ctx.session.skipped).toEqual([
            { kind: 'categories', key: expect.any(String), names: ['Racks', 'racks'], reason: 'URL key for specified store already exists.' },
            { kind: 'categories', key: expect.any(String), names: ['Wall'], reason: 'its parent category Racks was skipped' },
            { kind: 'products', key: 'vrrack', reason: 'it needs the category racks, which was skipped' },
        ]);
        expect(ctx.recorder.created.map((o) => `${o.kind} ${o.id}`)).toEqual(['categories 50', 'products desk']);
    });

    it('skips the products and assignments of a refused attribute set', async () => {
        const ctx = await fakeContext({ [page('products/attribute-sets/sets/list')]: { items: [{ attribute_set_id: 4, attribute_set_name: 'Default' }], total_count: 1 } }, (call: SentCall) => {
            if (call.path === 'products/attribute-sets') throw refused(call.path, { message: 'An attribute set named "Coolers" already exists.' });
            return {};
        });
        ctx.session.websiteId = 1;

        await installAttributeSets(ctx, parseAttributeSetRows([{ attributeSet: { attribute_set_name: 'Coolers' } }]));
        await installAssignments(ctx, parseAssignmentRows([{ attributeSetId: 'Coolers', attributeCode: 'fabric' }]));
        await installProducts(ctx, parseProductRows([product('cooler', { attribute_set_id: 'Coolers' })]));

        expect(ctx.session.skipped?.map((r) => `${r.kind} ${r.key}: ${r.reason}`)).toEqual([
            'attribute_sets Coolers: An attribute set named "Coolers" already exists.',
            'attribute_assign_to_set Coolers/fabric: it needs the attribute set Coolers, which was skipped',
            'products cooler: it needs the attribute set Coolers, which was skipped',
        ]);
    });

    it("skips a coupon whose cart rule was skipped, and a customer whose group was", async () => {
        const ctx = await fakeContext({
            [page('coupons/search', filterBy('code', 'SPRING10'))]: EMPTY,
            [page('salesRules/search', filterBy('name', 'Spring'))]: EMPTY,
            [page('customers/search', filterBy('email', 'ann@example.com'))]: EMPTY,
            [page('customerGroups/search', by('customer_group_code', 'Platinum'))]: EMPTY,
        });
        ctx.session.websiteId = 1;
        ctx.session.skipped = [{ kind: 'cart_rules', key: 'Spring', reason: 'x' }, { kind: 'customer_groups', key: 'Platinum', reason: 'y' }];

        await installCoupons(ctx, parseCouponRows([{ coupon: { code: 'SPRING10', rule_id: 'Spring' } }]));
        await installCustomers(ctx, parseCustomerRows([{ customer: { email: 'ann@example.com', firstname: 'Ann', lastname: 'Lee', group_id: 'Platinum' } }]));

        expect(ctx.session.skipped.slice(2).map((r) => `${r.kind} ${r.key}: ${r.reason}`)).toEqual([
            'coupons SPRING10: it needs the cart rule Spring, which was skipped',
            'customers ann@example.com: it needs the customer group Platinum, which was skipped',
        ]);
        expect(ctx.sent).toStrictEqual([]);
    });

    it('skips a stock link to a skipped stock, and a catalog assignment of a skipped product, sending neither', async () => {
        const ctx = await fakeContext({
            'inventory/sources?searchCriteria[pageSize]=200': { items: [] },
            'inventory/stocks?searchCriteria[pageSize]=200': { items: [] },
            'inventory/stock-source-links?searchCriteria[pageSize]=200': { items: [] },
            [page('sharedCatalog')]: { items: [{ id: 41, name: 'Retail' }] },
            'sharedCatalog/41/companies': '[]',
            'sharedCatalog/41/categories': [],
            'sharedCatalog/41/products': [],
        });
        ctx.session.skipped = [{ kind: 'stocks', key: 'Racks Stock', reason: 'x' }, { kind: 'products', key: 'vrrack', reason: 'y' }];

        await installStockSourceLinks(ctx, parseStockSourceLinks({ stockSourceLinks: [{ stockSourceLink: { stock_id: 'Racks Stock', source_code: 'default' } }] }));
        await installCatalogAssignments(ctx, 'b2b_shared_catalog_products', { catalogs: [{ name: 'Retail', products: [{ sku: 'vrrack' }, { sku: 'desk' }] }] });

        expect(ctx.session.skipped.slice(2).map((r) => `${r.kind}: ${r.reason}`)).toEqual([
            'stock_source_links: it needs the stock Racks Stock, which was skipped',
            'b2b_shared_catalog_products: it needs the product vrrack, which was skipped',
        ]);
        expect(ctx.sent).toEqual([{ method: 'POST', path: 'sharedCatalog/41/assignProducts', body: { products: [{ sku: 'desk' }] } }]);
    });
});
