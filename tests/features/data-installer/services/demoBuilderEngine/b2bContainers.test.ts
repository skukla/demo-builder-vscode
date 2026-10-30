/**
 * The container rule for the customer and B2B kinds (datapack-engine step 08, owner 2026-10-29
 * as step 05's): a company, shared catalog or customer group this engine made is kept while it
 * holds something the engine did not make or is not taking out in the same removal, and says so
 * in one line. The whole-pack removal, a reinstall and the preview all decide through
 * `decideRemovals`, so these go through it too.
 *
 * Not captured live: `GET hierarchy/{id}`, the customer and company searches. What a catalog holds
 * is answered in the shapes read live on 2026-10-29 (step 06).
 */

import { filterBy } from '@/features/data-installer/services/demoBuilderEngine/b2bReads';
import type { CreatedObject } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import { containersLine, decideRemovals } from '@/features/data-installer/services/demoBuilderEngine/removers';
import { fakeContext, page } from './demoBuilderEngine.testUtils';

const obj = (kind: string, id: string, extra: Partial<CreatedObject> = {}): CreatedObject => ({ kind, id, ...extra });
const CATALOGS = page('sharedCatalog');

describe('a company the pack made', () => {
    const COMPANY = obj('b2b_companies', '30', { key: 'Altura', previous: { superUserId: 52 } });

    it('is taken out when it holds only its own admin and customers being taken out with it', async () => {
        const ctx = await fakeContext({ 'hierarchy/30': [{ entity_id: 52, entity_type: 'customer', children: [{ entity_id: 53, entity_type: 'customer' }] }] });

        const { take, kept } = await decideRemovals(ctx.get, [COMPANY, obj('customers', '53'), obj('customers', '52')]);

        expect(kept).toStrictEqual([]);
        expect(take).toHaveLength(3);
    });

    it('is kept while it holds a customer the pack did not make, and says so', async () => {
        const ctx = await fakeContext({
            'hierarchy/30': [{ entity_id: 52, entity_type: 'customer', children: [{ entity_id: 77, entity_type: 'customer' }] }],
            'company/30': { company_name: 'Altura' },
        });

        const { take, kept } = await decideRemovals(ctx.get, [COMPANY, obj('customers', '52')]);

        expect(take).toEqual([obj('customers', '52')]);
        expect(containersLine(kept)).toBe('Kept the company Altura: it holds 1 customer you added.');
    });

    it('is kept when who is in it cannot be read', async () => {
        const ctx = await fakeContext({ 'hierarchy/30': { unexpected: true } });

        const { kept } = await decideRemovals(ctx.get, [COMPANY]);

        expect(containersLine(kept)).toBe('Kept the company Altura: Demo Builder could not read who is in it.');
    });
});

describe('a shared catalog the pack made', () => {
    const CATALOG = obj('b2b_shared_catalogs', '41', { key: 'Platinum Buyer', previous: { held: { companies: [], products: [], categories: [2] } } });

    function holding(parts: { companies?: string[]; categories?: number[]; products?: string[] }): Record<string, unknown> {
        return {
            'sharedCatalog/41/companies': JSON.stringify(parts.companies ?? []),
            'sharedCatalog/41/categories': parts.categories ?? [],
            'sharedCatalog/41/products': parts.products ?? [],
        };
    }

    it('is taken out holding what it held when made and what the pack assigned, going with it', async () => {
        const ctx = await fakeContext(holding({ categories: [2, 50], products: ['vrrack'] }));

        const { kept } = await decideRemovals(ctx.get, [obj('b2b_shared_catalog_products', '41/vrrack'), obj('b2b_shared_catalog_categories', '41/50'), CATALOG]);

        expect(kept).toStrictEqual([]);
    });

    it("is kept while it holds the SC's own company and product, naming both", async () => {
        const ctx = await fakeContext(holding({ companies: ['9'], products: ['vrrack', 'my-own'] }));

        const { take, kept } = await decideRemovals(ctx.get, [obj('b2b_shared_catalog_products', '41/vrrack'), CATALOG]);

        expect(take).toEqual([obj('b2b_shared_catalog_products', '41/vrrack')]);
        expect(containersLine(kept)).toBe('Kept the shared catalog Platinum Buyer: it holds 1 product and 1 company you added.');
    });
});

describe('a customer group the pack made', () => {
    const GROUP = obj('customer_groups', '31', { key: 'Platinum Buyer' });

    function store(parts: { customers?: unknown[]; companies?: unknown[]; catalogs?: unknown[] }) {
        return fakeContext({
            [page('customers/search', filterBy('group_id', 31))]: { items: parts.customers ?? [] },
            [page('company', filterBy('customer_group_id', 31))]: { items: parts.companies ?? [] },
            [CATALOGS]: { items: parts.catalogs ?? [] },
        });
    }

    it('is taken out when only things being taken out with it use it', async () => {
        const ctx = await store({ customers: [{ id: 52 }], companies: [{ id: 30 }], catalogs: [{ id: 41, name: 'Platinum Buyer', customer_group_id: 31 }] });

        const { kept } = await decideRemovals(ctx.get, [obj('b2b_companies', '30'), obj('b2b_shared_catalogs', '41'), obj('customers', '52'), GROUP]);

        expect(kept).toStrictEqual([]);
    });

    it("is kept while the SC's own customers use it: deleting it would move them to another group", async () => {
        const ctx = await store({ customers: [{ id: 52 }, { id: 80 }, { id: 81 }] });

        const { kept } = await decideRemovals(ctx.get, [obj('customers', '52'), GROUP]);

        expect(containersLine(kept)).toBe('Kept the customer group Platinum Buyer: it holds 2 customers you added.');
    });

    it("is kept while a catalog the pack did not make uses it", async () => {
        const ctx = await store({ catalogs: [{ id: 3, name: 'Theirs', customer_group_id: 31 }, { id: 4, name: 'Other', customer_group_id: 1 }] });

        const { kept } = await decideRemovals(ctx.get, [GROUP]);

        expect(containersLine(kept)).toBe('Kept the customer group Platinum Buyer: it holds 1 shared catalog you added.');
    });
});
