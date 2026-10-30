/**
 * Shared catalogs and their assignments (datapack-engine step 08). Rows are Bodea's; the catalog
 * list item is the captured `CATALOG_14`. What a catalog holds is answered in the shapes the setup
 * guide's catalog step read live on 2026-10-29: companies as a JSON-encoded string of ids,
 * categories as numbers, products as SKUs.
 */

import { CommerceReadError } from '@/features/app-builder/services/erpFillReaders';
import type { CommerceSharedCatalog } from '@/types/commerceWire';
import { filterBy } from '@/features/data-installer/services/demoBuilderEngine/b2bReads';
import { ownedKey } from '@/features/data-installer/services/demoBuilderEngine/kindContext';
import {
    CATALOG_CATEGORIES_KIND,
    CATALOG_COMPANIES_KIND,
    CATALOG_KIND,
    CATALOG_PRODUCTS_KIND,
    flatAssignments,
    groupedAssignments,
    installAssignments,
    installCatalogs,
    parseCatalogRows,
    removeAssignmentPair,
    removeCatalog,
} from '@/features/data-installer/services/demoBuilderEngine/sharedCatalogKinds';
import {
    BODEA_CATALOG_CATEGORIES,
    BODEA_CATALOG_PRODUCTS,
    BODEA_CATALOG_ROWS,
    BODEA_COMPANY_ASSIGNMENT_ROWS,
    CATALOG_14,
} from '../../../../helpers/commerceB2bFixtures';
import { fakeContext, page } from './demoBuilderEngine.testUtils';

const CATALOGS = page('sharedCatalog');
const PUBLIC = { id: 1, name: 'Default (General)', customer_group_id: 1, type: 1 };
const SAVVY = { ...CATALOG_14, id: 40, name: 'ServerSavvy Solutions', customer_group_id: 31 };
const lookupGroup = (code: string) =>
    page(
        'customerGroups/search',
        `&searchCriteria[filterGroups][0][filters][0][field]=customer_group_code&searchCriteria[filterGroups][0][filters][0][value]=${encodeURIComponent(code)}`,
    );

function held(id: number, parts: { companies?: string[]; categories?: number[]; products?: string[] } = {}): Record<string, unknown> {
    return {
        [`sharedCatalog/${id}/companies`]: JSON.stringify(parts.companies ?? []),
        [`sharedCatalog/${id}/categories`]: parts.categories ?? [],
        [`sharedCatalog/${id}/products`]: parts.products ?? [],
    };
}

describe('installCatalogs', () => {
    it("makes a custom catalog with the group it names by code, and records what it held once made", async () => {
        const ctx = await fakeContext(
            { [CATALOGS]: { items: [PUBLIC] }, [lookupGroup('Platinum Buyer')]: { items: [{ id: 32, code: 'Platinum Buyer' }] }, ...held(41, { categories: [2] }) },
            () => 41,
        );

        await installCatalogs(ctx, parseCatalogRows([BODEA_CATALOG_ROWS[1]]));

        expect(ctx.sent).toEqual([
            { method: 'POST', path: 'sharedCatalog', body: { sharedCatalog: { name: 'Platinum Buyer', type: 0, store_id: 0, tax_class_id: 3, customer_group_id: 32 } } },
        ]);
        expect(ctx.recorder.created).toEqual([
            { kind: CATALOG_KIND, id: '41', key: 'Platinum Buyer', previous: { held: { companies: [], products: [], categories: [2] } } },
        ]);
    });

    it('never makes a public catalog, whatever type the row names', async () => {
        const ctx = await fakeContext({ [CATALOGS]: { items: [] }, ...held(41) }, () => 41);

        await installCatalogs(ctx, parseCatalogRows([{ sharedCatalog: { name: 'Public Copy', type: 1 } }]));

        expect((ctx.sent[0].body as { sharedCatalog: { type: number } }).sharedCatalog.type).toBe(0);
    });

    it('leaves a catalog the store has by that name', async () => {
        const ctx = await fakeContext({ [CATALOGS]: { items: [PUBLIC, SAVVY] } });

        await installCatalogs(ctx, parseCatalogRows([BODEA_CATALOG_ROWS[0]]));

        expect(ctx.sent).toStrictEqual([]);
    });

    // The service reads Commerce's refusal as "already there" (SharedCatalogImportProcessor.js
    // L9-32). The list item carries the group (CATALOG_14, captured), so this looks first.
    describe('when the customer group already has a catalog', () => {
        const WHOLESALE = { ...CATALOG_14, id: 14, name: 'Wholesale', customer_group_id: 32 };
        const PLATINUM_GROUP = { [lookupGroup('Platinum Buyer')]: { items: [{ id: 32, code: 'Platinum Buyer' }] } };

        it("uses the group's catalog, makes and records nothing, and assigns the pack's members to it", async () => {
            const ctx = await fakeContext({ [CATALOGS]: { items: [PUBLIC, WHOLESALE] }, ...PLATINUM_GROUP, ...held(14) });

            await installCatalogs(ctx, parseCatalogRows([BODEA_CATALOG_ROWS[1]]));
            await installAssignments(ctx, CATALOG_PRODUCTS_KIND, { catalogs: [{ name: 'Platinum Buyer', products: [{ sku: 'vrrack' }] }] });

            expect(ctx.sent).toEqual([{ method: 'POST', path: 'sharedCatalog/14/assignProducts', body: { products: [{ sku: 'vrrack' }] } }]);
            // The catalog is the store's, so removal never takes it; the pair it added is the pack's.
            expect(ctx.recorder.created).toEqual([{ kind: CATALOG_PRODUCTS_KIND, id: '14/vrrack', key: 'Platinum Buyer/vrrack' }]);
            expect(ctx.logged).toContain('used shared catalog Wholesale for Platinum Buyer: its customer group already has that catalog');
        });

        // The refusal's words are the service's test's (`SharedCatalogImportProcessor.test.js`
        // L175), not a captured Commerce answer.
        it("reads Commerce's refusal as already there, and records nothing", async () => {
            let listed: CommerceSharedCatalog[] = [PUBLIC];
            const ctx = await fakeContext({ [CATALOGS]: () => ({ items: listed }), ...PLATINUM_GROUP }, () => {
                listed = [PUBLIC, WHOLESALE];
                throw new CommerceReadError('Commerce answered 400 for sharedCatalog: {"message":"A catalog already exists with customer group Platinum Buyer."}', 400);
            });

            await installCatalogs(ctx, parseCatalogRows([BODEA_CATALOG_ROWS[1]]));

            expect(ctx.sent.map((c) => `${c.method} ${c.path}`)).toEqual(['POST sharedCatalog']);
            expect(ctx.recorder.created).toStrictEqual([]);
            expect(ctx.session.catalogStandIns?.get('Platinum Buyer')).toBe(14);
        });

        it('still stops on any other refusal', async () => {
            const ctx = await fakeContext({ [CATALOGS]: { items: [PUBLIC] }, ...PLATINUM_GROUP }, () => {
                throw new CommerceReadError('Commerce answered 400 for sharedCatalog: {"message":"Invalid tax class."}', 400);
            });

            await expect(installCatalogs(ctx, parseCatalogRows([BODEA_CATALOG_ROWS[1]]))).rejects.toThrow(/Invalid tax class/);
        });
    });

    it('is taken back by its id', async () => {
        const ctx = await fakeContext({});

        await removeCatalog(ctx.send, '41');

        expect(ctx.sent).toEqual([{ method: 'DELETE', path: 'sharedCatalog/41', body: undefined }]);
    });
});

describe('the assignment kinds', () => {
    it("flattens a pack's rows to one pair each, once, and groups them back into the pack's form", () => {
        const pairs = flatAssignments(CATALOG_CATEGORIES_KIND, BODEA_CATALOG_CATEGORIES);

        expect(pairs).toEqual([
            { catalog: 'ServerSavvy Solutions', member: 'racks' },
            { catalog: 'ServerSavvy Solutions', member: 'switching' },
        ]);
        expect(groupedAssignments(CATALOG_CATEGORIES_KIND, pairs)).toEqual({
            catalogs: [{ name: 'ServerSavvy Solutions', categories: [{ id: 'racks' }, { id: 'switching' }] }],
        });
        expect(groupedAssignments(CATALOG_COMPANIES_KIND, flatAssignments(CATALOG_COMPANIES_KIND, BODEA_COMPANY_ASSIGNMENT_ROWS))).toEqual(BODEA_COMPANY_ASSIGNMENT_ROWS);
        expect(groupedAssignments(CATALOG_PRODUCTS_KIND, flatAssignments(CATALOG_PRODUCTS_KIND, BODEA_CATALOG_PRODUCTS))).toEqual(BODEA_CATALOG_PRODUCTS);
    });

    it('assigns the companies a catalog lacks in one call, by their ids, and records each pair', async () => {
        const ctx = await fakeContext({
            [CATALOGS]: { items: [PUBLIC, SAVVY] },
            ...held(1, { companies: ['5'] }),
            [page('company', filterBy('company_name', 'Altura'))]: { items: [{ id: 5, company_name: 'Altura' }] },
            [page('company', filterBy('company_name', 'RackMaster'))]: { items: [{ id: 6, company_name: 'RackMaster' }] },
        });

        await installAssignments(ctx, CATALOG_COMPANIES_KIND, [BODEA_COMPANY_ASSIGNMENT_ROWS[0]]);

        // Altura is in the public catalog already: left, and not recorded.
        expect(ctx.sent).toEqual([{ method: 'POST', path: 'sharedCatalog/1/assignCompanies', body: { companies: [{ id: 6 }] } }]);
        expect(ctx.recorder.created).toEqual([{ kind: CATALOG_COMPANIES_KIND, id: '1/6', key: 'Default (General)/RackMaster' }]);
    });

    it('assigns products by SKU and leaves out a pair the SC took out since', async () => {
        const ctx = await fakeContext({ [CATALOGS]: { items: [SAVVY] }, ...held(40) });
        ctx.session.owned = new Map([[ownedKey(CATALOG_PRODUCTS_KIND, 'ServerSavvy Solutions/accessmesh'), null]]);

        await installAssignments(ctx, CATALOG_PRODUCTS_KIND, BODEA_CATALOG_PRODUCTS);

        expect(ctx.sent).toEqual([{ method: 'POST', path: 'sharedCatalog/40/assignProducts', body: { products: [{ sku: 'vrrack' }] } }]);
        expect(ctx.recorder.created).toEqual([{ kind: CATALOG_PRODUCTS_KIND, id: '40/vrrack', key: 'ServerSavvy Solutions/vrrack' }]);
    });

    // The service trims a product's SKU before sending it (SharedCatalogProductsProcessor.js L198).
    it('trims the spaces around a SKU before comparing and sending it, and keeps its case', async () => {
        const ctx = await fakeContext({ [CATALOGS]: { items: [SAVVY] }, ...held(40, { products: ['vrrack'] }) });

        await installAssignments(ctx, CATALOG_PRODUCTS_KIND, { catalogs: [{ name: 'ServerSavvy Solutions', products: [{ sku: ' vrrack ' }, { sku: 'AccessMesh\t' }] }] });

        expect(ctx.sent).toEqual([{ method: 'POST', path: 'sharedCatalog/40/assignProducts', body: { products: [{ sku: 'AccessMesh' }] } }]);
        expect(ctx.recorder.created).toEqual([{ kind: CATALOG_PRODUCTS_KIND, id: '40/AccessMesh', key: 'ServerSavvy Solutions/AccessMesh' }]);
    });

    it('refuses a SKU that is only spaces, before anything reaches Commerce', () => {
        expect(() => flatAssignments(CATALOG_PRODUCTS_KIND, { catalogs: [{ name: 'ServerSavvy Solutions', products: [{ sku: '   ' }] }] })).toThrow(/shared catalog products/);
    });

    it('stops, naming it, at a catalog the store does not have', async () => {
        const ctx = await fakeContext({ [CATALOGS]: { items: [PUBLIC] } });

        await expect(installAssignments(ctx, CATALOG_PRODUCTS_KIND, BODEA_CATALOG_PRODUCTS)).rejects.toThrow(/no shared catalog named ServerSavvy Solutions/);
        expect(ctx.sent).toStrictEqual([]);
    });

    it('takes a pair back by unassigning it, and counts a catalog already gone as done', async () => {
        const ctx = await fakeContext({});

        await removeAssignmentPair(ctx.send, CATALOG_COMPANIES_KIND, '1/6');
        await removeAssignmentPair(ctx.send, CATALOG_CATEGORIES_KIND, '40/41');
        await removeAssignmentPair(ctx.send, CATALOG_PRODUCTS_KIND, '40/sku/with-slash');

        expect(ctx.sent).toEqual([
            { method: 'POST', path: 'sharedCatalog/1/unassignCompanies', body: { companies: [{ id: 6 }] } },
            { method: 'POST', path: 'sharedCatalog/40/unassignCategories', body: { categories: [{ id: 41 }] } },
            { method: 'POST', path: 'sharedCatalog/40/unassignProducts', body: { products: [{ sku: 'sku/with-slash' }] } },
        ]);
    });
});
