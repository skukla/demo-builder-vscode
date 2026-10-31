/**
 * Clearing an ACO instance's demo data (PL-60): the storefront search finds what the project's view
 * shows, installed packs' keys are left to their packs, and the clearing deletes exactly what the
 * SC was shown. Two rules carry the weight:
 *
 * - a search that fails or answers with errors REFUSES the plan: "could not list" never reads as
 *   "nothing to clear" (the ingestion script this follows treated a failure as the end of the list);
 * - nothing an installed pack on the same instance holds is planned.
 *
 * The search answers are the shapes `commerce-demo-ingestion/aco/delete-everything.js` reads from
 * ACO's `productSearch` and `categorySearch`. No live call has checked them (live-check.md).
 */

import { ACO_SETTINGS, fakeAco } from './acoFakes.testUtils';
import { AcoApiError } from '@/features/data-installer/services/aco/acoClient';
import { type AcoSearch, AcoSearchError, createAcoSearch, planAcoWipe, runAcoWipe } from '@/features/data-installer/services/aco/acoWipe';
import type { InstallRecord } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import type { AcoStorefrontSettings } from '@/types/aco';

/** A search answering these keys; `'unlisted'` for a search that does not answer categories. */
function search(skus: string[], slugs: string[] | 'unlisted' = []): AcoSearch {
    return { productSkus: async () => skus, categorySlugs: async () => (slugs === 'unlisted' ? undefined : slugs) };
}

/** An ACO install record on `instance` that loaded these products and categories. */
function acoRecord(instance: AcoStorefrontSettings, skus: string[], slugs: string[] = []): InstallRecord {
    return {
        format: 1,
        pack: { name: 'aco_citisignal_new', version: 'v1' },
        engine: 'demo-builder',
        startedAt: '2026-10-31T10:00:00.000Z',
        aco: { tenantId: instance.tenantId, region: instance.region, environment: instance.environment },
        created: [
            ...skus.map((sku) => ({ kind: 'aco_products', id: JSON.stringify({ sku, source: { locale: 'en-US' } }), key: sku })),
            ...slugs.map((slug) => ({ kind: 'aco_categories', id: JSON.stringify({ slug, source: { locale: 'en-US' } }), key: slug })),
        ],
    };
}

describe('planning a clear', () => {
    it('names what the view shows, less what an installed pack holds, under a token', async () => {
        const plan = await planAcoWipe(search(['S1', 'S2', 'PACK-1'], ['phones', 'pack-cat']), ACO_SETTINGS, [acoRecord(ACO_SETTINGS, ['PACK-1'], ['pack-cat'])]);

        expect(plan.skus).toEqual(['S1', 'S2']);
        expect(plan.slugs).toEqual(['phones']);
        expect(plan.preview).toMatchObject({
            products: { count: 2, names: ['S1', 'S2'] },
            categories: { count: 1, names: ['phones'] },
            categoriesUnlisted: false,
            installed: 1,
            total: 3,
        });
        expect(plan.preview.token).toMatch(/^[0-9a-f-]{36}$/);
        expect(plan.preview.limit).toMatch(/Only what this catalog view shows/);
    });

    it("plans another instance's pack keys for deletion here: that record is not this instance's — control", async () => {
        const other = { ...ACO_SETTINGS, tenantId: 'OtherTenant1' };
        const plan = await planAcoWipe(search(['PACK-1']), ACO_SETTINGS, [acoRecord(other, ['PACK-1'])]);

        expect(plan.skus).toEqual(['PACK-1']);
        expect(plan.preview.installed).toBe(0);
    });

    it('says categories could not be listed, and plans none, when the search does not answer them', async () => {
        const plan = await planAcoWipe(search(['S1'], 'unlisted'), ACO_SETTINGS, []);

        expect(plan.slugs).toStrictEqual([]);
        expect(plan.preview.categoriesUnlisted).toBe(true);
    });

    it('shows five names of a long list and counts the rest', async () => {
        const skus = Array.from({ length: 12 }, (_v, i) => `SKU-${i}`);
        const plan = await planAcoWipe(search(skus), ACO_SETTINGS, []);

        expect(plan.preview.products).toEqual({ count: 12, names: skus.slice(0, 5) });
    });
});

/** A fetch answering each GraphQL request with the next body, recording what was sent. */
function fakeFetch(bodies: Array<{ status?: number; body?: unknown }>) {
    const sent: Array<{ url: string; init: RequestInit }> = [];
    const doFetch = (async (url: string, init: RequestInit) => {
        sent.push({ url, init });
        const next = bodies.shift() ?? { body: {} };
        return new Response(JSON.stringify(next.body ?? {}), { status: next.status ?? 200 });
    }) as unknown as typeof fetch;
    return { doFetch, sent };
}

const page = (skus: string[], totalPages: number) => ({ body: { data: { productSearch: { page_info: { total_pages: totalPages }, items: skus.map((sku) => ({ productView: { sku } })) } } } });

describe('the storefront search', () => {
    it("reads every page through the storefront's endpoint and headers", async () => {
        const { doFetch, sent } = fakeFetch([page(['A', 'B'], 2), page(['C'], 2)]);

        await expect(createAcoSearch(ACO_SETTINGS, doFetch).productSkus()).resolves.toEqual(['A', 'B', 'C']);
        expect(sent).toHaveLength(2);
        expect(sent[0].url).toBe('https://na1-sandbox.api.commerce.adobe.com/TenantAbc123/graphql');
        expect(sent[0].init.headers).toMatchObject({ 'AC-View-ID': ACO_SETTINGS.catalogViewId, 'AC-Source-Locale': 'en-US', 'AC-Environment-Id': 'TenantAbc123' });
        expect(JSON.parse(String(sent[1].init.body)).variables).toEqual({ page: 2, pageSize: 200 });
        // A space, not "*" (which answers "No index found"), nor the untested empty phrase.
        expect(JSON.parse(String(sent[0].init.body)).query).toContain('productSearch(phrase: " "');
        // No token: ACO's storefront GraphQL takes none (BuildRight, ACO-OAUTH-DISCOVERY.md).
        expect(sent[0].init.headers).not.toHaveProperty('Authorization');
    });

    // The script this follows stopped quietly and kept what it had; a clear must not.
    it.each([
        ['a status that is not OK', { status: 403, body: {} }],
        ['GraphQL errors', { body: { errors: [{ message: 'AC-View-ID is required' }] } }],
        ['an answer with no product list', { body: { data: {} } }],
    ])('refuses on %s rather than reading it as an empty catalog', async (_label, answer) => {
        const { doFetch } = fakeFetch([answer]);

        await expect(createAcoSearch(ACO_SETTINGS, doFetch).productSkus()).rejects.toBeInstanceOf(AcoSearchError);
    });

    it('answers no category list, not an error, when categorySearch refuses', async () => {
        const { doFetch } = fakeFetch([{ body: { errors: [{ message: 'Cannot query field categorySearch' }] } }]);

        await expect(createAcoSearch(ACO_SETTINGS, doFetch).categorySlugs()).resolves.toBeUndefined();
    });
});

describe('the clearing', () => {
    it("deletes the plan's prices, products and categories, in that order, by their delete payloads", async () => {
        const settings = { ...ACO_SETTINGS, priceBookId: 'US-Retail' };
        const plan = await planAcoWipe(search(['S1'], ['phones']), settings, []);
        const aco = fakeAco();

        await expect(runAcoWipe(plan, aco)).resolves.toEqual({ prices: 1, products: 1, categories: 1 });
        expect(aco.calls).toEqual([
            { path: '/v1/catalog/products/prices/delete', rows: [{ sku: 'S1', priceBookId: 'US-Retail' }] },
            { path: '/v1/catalog/products/delete', rows: [{ sku: 'S1', source: { locale: 'en-US' } }] },
            { path: '/v1/catalog/categories/delete', rows: [{ slug: 'phones', source: { locale: 'en-US' } }] },
        ]);
    });

    it('sends no price deletes when the view names no price book', async () => {
        const plan = await planAcoWipe(search(['S1']), ACO_SETTINGS, []);
        const aco = fakeAco();

        await expect(runAcoWipe(plan, aco)).resolves.toMatchObject({ prices: 0, products: 1 });
        expect(aco.calls.map((c) => c.path)).toEqual(['/v1/catalog/products/delete']);
    });

    // A product ACO deleted between the check and the clear (its deletes are asynchronous) is gone,
    // which is what the clear wants: the same rule a pack's removal has.
    it('carries on past a 404, reading the row as already gone', async () => {
        const plan = await planAcoWipe(search(['S1'], ['phones']), ACO_SETTINGS, []);
        const aco = fakeAco((call) => (call.path === '/v1/catalog/products/delete' ? new AcoApiError('ACO answered 404', 'ingestion', 404) : undefined));

        await expect(runAcoWipe(plan, aco)).resolves.toMatchObject({ products: 1, categories: 1 });
    });

    it('stops on any other refusal — control', async () => {
        const plan = await planAcoWipe(search(['S1']), ACO_SETTINGS, []);
        const aco = fakeAco(() => new AcoApiError('ACO answered 403', 'ingestion', 403));

        await expect(runAcoWipe(plan, aco)).rejects.toBeInstanceOf(AcoApiError);
    });

    it('sends nothing for an empty plan — control', async () => {
        const aco = fakeAco();

        await runAcoWipe(await planAcoWipe(search([], []), ACO_SETTINGS, []), aco);

        expect(aco.calls).toStrictEqual([]);
    });
});
