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

/**
 * A fake ACO storefront GraphQL that answers by query, in the shapes a real sandbox answered on
 * 2026-10-31 (read-only): `productSearch` items carry `__typename` (`ComplexProductView` for a
 * configurable), `variants` pages by `cursor`, and `categoryTree` lists `slug`s. Anything listed
 * in `refuse` answers with that body instead.
 */
function fakeAcoSearch(store: {
    pages: string[][];
    parents?: Record<string, string[][]>;
    categories?: string[];
    refuse?: Partial<Record<'products' | 'variants' | 'categories', { status?: number; body?: unknown }>>;
}) {
    const sent: Array<{ url: string; init: RequestInit }> = [];
    const doFetch = (async (url: string, init: RequestInit) => {
        sent.push({ url, init });
        const { query, variables } = JSON.parse(String(init.body)) as { query: string; variables?: Record<string, unknown> };
        const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
        const which = query.includes('productSearch') ? 'products' : query.includes('variants(') ? 'variants' : 'categories';
        const refused = store.refuse?.[which];
        if (refused) return reply(refused.body ?? {}, refused.status ?? 200);
        if (which === 'products') {
            const page = Number(variables?.page ?? 1);
            const items = (store.pages[page - 1] ?? []).map((sku) => ({ productView: { sku, __typename: store.parents?.[sku] ? 'ComplexProductView' : 'SimpleProductView' } }));
            return reply({ data: { productSearch: { page_info: { current_page: page, total_pages: store.pages.length }, items } } });
        }
        if (which === 'variants') {
            const pages = store.parents?.[String(variables?.sku)] ?? [];
            const at = variables?.cursor ? Number(variables.cursor) : 0;
            const cursor = at + 1 < pages.length ? String(at + 1) : null;
            return reply({ data: { variants: { cursor, variants: (pages[at] ?? []).map((sku) => ({ product: { sku } })) } } });
        }
        return reply({ data: { categoryTree: (store.categories ?? []).map((slug) => ({ slug })) } });
    }) as unknown as typeof fetch;
    return { doFetch, sent };
}

describe('the storefront search', () => {
    it("reads every page through the storefront's endpoint and headers, with no token", async () => {
        const { doFetch, sent } = fakeAcoSearch({ pages: [['A', 'B'], ['C']] });

        await expect(createAcoSearch(ACO_SETTINGS, doFetch).productSkus()).resolves.toEqual(['A', 'B', 'C']);
        expect(sent).toHaveLength(2);
        expect(sent[0].url).toBe('https://na1-sandbox.api.commerce.adobe.com/TenantAbc123/graphql');
        // The storefront's own headers, nothing more: no AC-Environment-Id and no token (neither is
        // needed, measured against a real sandbox 2026-10-31).
        expect(sent[0].init.headers).toStrictEqual({ 'Content-Type': 'application/json', 'AC-View-ID': ACO_SETTINGS.catalogViewId, 'AC-Source-Locale': 'en-US' });
        expect(JSON.parse(String(sent[1].init.body)).variables).toEqual({ page: 2, pageSize: 200 });
        // A space; "*" answers an empty list with no error.
        expect(JSON.parse(String(sent[0].init.body)).query).toContain('productSearch(phrase: " "');
    });

    // Search lists a configurable but never its variants; they come through the parent, every page.
    it("adds each configurable's variants, following the cursor", async () => {
        const { doFetch } = fakeAcoSearch({ pages: [['TEE-CONFIG', 'MUG']], parents: { 'TEE-CONFIG': [['TEE-S', 'TEE-M'], ['TEE-L']] } });

        await expect(createAcoSearch(ACO_SETTINGS, doFetch).productSkus()).resolves.toEqual(['TEE-CONFIG', 'MUG', 'TEE-S', 'TEE-M', 'TEE-L']);
    });

    // A live run refused 200 ("Page size exceeds the maximum allowed"); 100 is what it takes.
    it('asks variants 100 a page, the most ACO takes', async () => {
        const { doFetch, sent } = fakeAcoSearch({ pages: [['TEE-CONFIG']], parents: { 'TEE-CONFIG': [['TEE-S']] } });

        await createAcoSearch(ACO_SETTINGS, doFetch).productSkus();

        const variantsQuery = sent.map((c) => JSON.parse(String(c.init.body)).query as string).find((q) => q.includes('variants('));
        expect(variantsQuery).toContain('pageSize: 100');
    });

    it('asks no variants of a simple product — control', async () => {
        const { doFetch, sent } = fakeAcoSearch({ pages: [['MUG']] });

        await createAcoSearch(ACO_SETTINGS, doFetch).productSkus();

        expect(sent.map((c) => JSON.parse(String(c.init.body)).query).filter((q: string) => q.includes('variants('))).toStrictEqual([]);
    });

    it('lists categories from categoryTree', async () => {
        const { doFetch } = fakeAcoSearch({ pages: [[]], categories: ['phones', 'phones/cases'] });

        await expect(createAcoSearch(ACO_SETTINGS, doFetch).categorySlugs()).resolves.toEqual(['phones', 'phones/cases']);
    });

    // The script this follows stopped quietly and kept what it had; a clear must not.
    it.each([
        ['a status that is not OK', 'products', { status: 403, body: {} }],
        ['GraphQL errors (a price book the view does not allow)', 'products', { body: { errors: [{ message: 'Price book not in the channel allowed list!' }] } }],
        ['an answer with no product list', 'products', { body: { data: {} } }],
        ["a parent's variants refused", 'variants', { body: { errors: [{ message: 'boom' }] } }],
    ] as const)('refuses on %s rather than reading it as an empty catalog', async (_label, which, answer) => {
        const { doFetch } = fakeAcoSearch({ pages: [['TEE-CONFIG']], parents: { 'TEE-CONFIG': [['TEE-S']] }, refuse: { [which]: answer } });

        await expect(createAcoSearch(ACO_SETTINGS, doFetch).productSkus()).rejects.toBeInstanceOf(AcoSearchError);
    });

    it('answers no category list, not an error, when the category query refuses', async () => {
        const { doFetch } = fakeAcoSearch({ pages: [[]], refuse: { categories: { status: 400, body: { errors: [{ message: 'Cannot query field' }] } } } });

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
