/**
 * Replacing a storefront's pages after its store changed (EDS-44).
 *
 * Reset's catalog half, in reset's order, without the rest of reset: the old store's
 * generated product pages come off Helix, Demo Builder's category pages are swapped for
 * the new store's, the new store's product pages are published, and only then is the
 * store-change marker cleared. It ends with ONE sentence for the SC.
 *
 * Real: the product-page removal (`removeProductPages`) and the category step
 * (`replaceCatalogMenuStep`). Faked at the boundary: Helix, the DA.live pages (in
 * memory), the category read, the shared-repository check, and the product-page publish
 * (`prewarmCatalog`, wired by the deps factory and asserted there).
 */

import { COMPONENT_IDS } from '@/core/constants';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import { applyCatalogMenuStep, type CatalogMenuSite } from '@/features/eds/services/catalogMenu/catalogMenuStep';
import type { CatalogCategory } from '@/features/eds/services/catalogMenu/categoryPages';
import type { PrewarmResult } from '@/features/eds/services/catalogPrewarmService';
import {
    replaceStoreScopePages,
    type StoreScopePagesDeps,
} from '@/features/eds/services/storefront/storeScopePages';
import type { Project } from '@/types/base';
import { createMockLogger } from '../../../../helpers/loggerFake';
import { createMockProject } from '../../../../helpers/projectFake';
import { fakeStorefront, type FakeStorefront } from '../catalogMenu/catalogMenuService.testUtils';

const NAV = '<body><header></header><main><div><p>Brand</p></div><div><ul><li>Deals</li></ul></div></main></body>';
const categories = (prefix: string, n: number): CatalogCategory[] =>
    Array.from({ length: n }, (_, i) => ({
        id: `${prefix}${i}`,
        name: `${prefix} ${i}`,
        urlPath: `${prefix}-${i}`,
        level: 2,
        parentId: '2',
    }));
const OLD_STORE = categories('old', 2);
const NEW_STORE = categories('new', 11);
const OLD_PRODUCT_PAGES = Array.from({ length: 30 }, (_, i) => `/products/old-${i}/sku-${i}`);

function project(overrides: Partial<Project> = {}): Project {
    return createMockProject({
        name: 'shop',
        path: '/p/shop',
        componentSelections: { backend: 'adobe-commerce-accs' },
        componentConfigs: { 'adobe-commerce-accs': { ACCS_WEBSITE_CODE: 'citisignal' } },
        commerceStoreStructure: {
            websites: [
                { id: 1, code: 'base', name: 'Main Website' },
                { id: 2, code: 'citisignal', name: 'CitiSignal' },
            ],
            storeGroups: [],
            storeViews: [],
        },
        componentInstances: {
            [COMPONENT_IDS.EDS_STOREFRONT]: {
                id: COMPONENT_IDS.EDS_STOREFRONT,
                name: 'EDS Storefront',
                type: 'frontend',
                status: 'ready',
                metadata: { githubRepo: 'me/shop' },
            },
        },
        edsStorefrontState: {
            envVars: { ACCS_WEBSITE_CODE: 'citisignal' },
            lastPublished: '2026-10-15T00:00:00.000Z',
            catalogPagesPending: { fromWebsiteCode: 'base', fromStoreCode: 'main', fromStoreViewCode: 'default' },
        },
        edsStorefrontStatusSummary: 'stale',
        ...overrides,
    });
}

const published = (n: number): PrewarmResult => ({ attempted: n, succeeded: n, failed: 0, skipped: false });

/** A storefront set up on the old store, with its pages and the calls made on it. */
async function setUp(p: Project, over: Partial<StoreScopePagesDeps> = {}) {
    const order: string[] = [];
    const s: FakeStorefront = fakeStorefront({ '/nav': NAV });
    const catalogMenu: CatalogMenuSite = { pages: s.port, hasBlock: async () => true, readCategories: async () => OLD_STORE };
    await applyCatalogMenuStep(p, catalogMenu);
    s.written.length = 0;
    const unpublishPages = jest.fn(async (_o: string, _r: string, _b: string, paths: string[]) => {
        order.push('remove product pages');
        return { total: paths.length, liveFailed: 0, previewFailed: 0 };
    });
    const logger = createMockLogger();
    const deps: StoreScopePagesDeps = {
        site: { repoOwner: 'me', repoName: 'shop' },
        productPages: {
            helix: { listPublishedPaths: jest.fn(async () => OLD_PRODUCT_PAGES), unpublishPages },
            listAuthoredProductPages: jest.fn(async () => ['/products/default']),
            otherProjectsOnRepo: jest.fn(async () => []),
            logger,
        },
        catalogMenu: {
            pages: {
                ...s.port,
                write: async (path, html) => {
                    order.push('category pages');
                    await s.port.write(path, html);
                },
            },
            hasBlock: async () => true,
            readCategories: async () => NEW_STORE,
        },
        publishProductPages: jest.fn(async (onProgress) => {
            order.push('publish product pages');
            onProgress({ operation: 'catalog-prewarm', message: 'Warming product pages: 1 of 39 pages', current: 1, total: 39 });
            return published(39);
        }),
        persist: jest.fn(async (saved: Project) => {
            order.push(`persist (pending: ${saved.edsStorefrontState?.catalogPagesPending !== undefined})`);
        }),
        logger,
        ...over,
    };
    return { deps, order, s, unpublishPages };
}

describe('replaceStoreScopePages', () => {
    it('removes the old product pages, swaps the category pages, publishes the new product pages, then clears the marker', async () => {
        const p = project();
        const { deps, order } = await setUp(p);

        const result = await replaceStoreScopePages(p, deps);

        expect([...new Set(order)]).toEqual([
            'remove product pages',
            'category pages',
            'publish product pages',
            'persist (pending: false)',
        ]);
        expect(result.sentence).toBe(
            'Now on CitiSignal: 11 category pages and 39 product pages published. 30 old product pages removed.',
        );
        expect(result.counts).toEqual({ categoryPages: 11, productPages: 39, oldProductPagesRemoved: 30 });
        expect(p.edsStorefrontState?.catalogPagesPending).toBeUndefined();
        expect(p.edsStorefrontStatusSummary).toBe('published');
    });

    it('hands the removal the Helix site by GitHub owner and repo', async () => {
        const p = project();
        const { deps, unpublishPages } = await setUp(p);

        await replaceStoreScopePages(p, deps);

        expect(unpublishPages).toHaveBeenCalledWith('me', 'shop', 'main', OLD_PRODUCT_PAGES);
    });

    it('keeps a category page the SC edited, and says so', async () => {
        const p = project();
        const { deps, s } = await setUp(p);
        s.pages.set('/old-0', '<body><main><div><h1>Edited by hand</h1></div></main></body>');

        const result = await replaceStoreScopePages(p, deps);

        expect(s.pages.get('/old-0')).toContain('Edited by hand');
        expect(result.sentence).toMatch(/ Kept "\/old-0": you edited it\.$/);
    });

    it('respects the shared-repository refusal: no product page is removed, and the sentence says why', async () => {
        const p = project();
        const { deps, unpublishPages } = await setUp(p);
        deps.productPages.otherProjectsOnRepo = jest.fn(async () => ['Other Demo']);

        const result = await replaceStoreScopePages(p, deps);

        expect(unpublishPages).not.toHaveBeenCalled();
        expect(result.sentence).toContain('Product pages were left published: the project "Other Demo" also publishes');
        expect(result.counts.oldProductPagesRemoved).toBe(0);
        // The rest still ran.
        expect(result.sentence).toMatch(/^Now on CitiSignal: 11 category pages and 39 product pages published\./);
    });

    it('names the store by its code when the store structure does not name it', async () => {
        const p = project({ commerceStoreStructure: undefined });
        const { deps } = await setUp(p);

        const result = await replaceStoreScopePages(p, deps);

        expect(result.sentence).toMatch(/^Now on citisignal: /);
    });

    it('says when the product pages were not published, and why', async () => {
        const p = project();
        const { deps } = await setUp(p, {
            publishProductPages: jest.fn(async () => ({
                attempted: 0,
                succeeded: 0,
                failed: 0,
                skipped: true,
                skipReason: 'empty catalog',
            })),
        });

        const result = await replaceStoreScopePages(p, deps);

        expect(result.sentence).toMatch(/^Now on CitiSignal: 11 category pages published\./);
        expect(result.sentence).toContain('Product pages were not published (empty catalog).');
    });

    it('never throws: a failing step is said in the sentence and the rest still runs', async () => {
        const p = project();
        const { deps } = await setUp(p, {
            publishProductPages: jest.fn(async () => {
                throw new Error('Catalog Service timed out');
            }),
            persist: jest.fn(async () => {
                throw new Error('disk full');
            }),
        });
        deps.catalogMenu.readCategories = async () => {
            throw new Error('Catalog Service returned HTTP 503');
        };

        const result = await replaceStoreScopePages(p, deps);

        expect(result.sentence).toContain('30 old product pages removed.');
        expect(result.sentence).toContain('Category pages were not written: Catalog Service returned HTTP 503.');
        expect(result.sentence).toContain('Product pages were not published (Catalog Service timed out).');
    });

    // Named as the same jobs are everywhere else (progress vocabulary slice 3, owner
    // 2026-10-16): the category pages ARE the catalog menu, and publishing a page per
    // product is the warm-up Reset and Republish already call "Warming product pages".
    it('reports one stage per step, in order, with the product pages counted', async () => {
        const p = project();
        const { deps } = await setUp(p);
        const report = jest.fn();

        await replaceStoreScopePages(p, deps, report);

        const stages = [...new Set(report.mock.calls.map(([stage]) => stage))];
        expect(stages).toEqual([
            OPERATION_STAGES.removingProductPages.label,
            OPERATION_STAGES.updatingCatalogMenu.label,
            OPERATION_STAGES.warmingProductPages.label,
        ]);
        expect(report).toHaveBeenCalledWith(
            OPERATION_STAGES.removingProductPages.label,
            "Removing the old store's product pages (30)",
        );
        expect(report).toHaveBeenCalledWith(OPERATION_STAGES.warmingProductPages.label, 'Warming product pages: 1 of 39 pages', {
            index: 1,
            total: 39,
        });
    });

});
