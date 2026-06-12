/**
 * Catalog pre-warming service tests.
 *
 * Covers the gate logic (skip cases), happy-path enumeration + bulk
 * pre-warm, and non-fatal degradation when sub-steps fail.
 *
 * The service is non-fatal end-to-end: any failure returns either
 * `{ skipped: true, skipReason }` or `{ skipped: false, failed: N }` and
 * NEVER throws to the caller. These tests pin that contract.
 */

import { prewarmCatalog } from '@/features/eds/services/catalogPrewarmService';
import type { Project } from '@/types/base';

const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
};

/** Minimal ACCS project shape that satisfies extractConfigParams. */
function makeAccsProject(overrides: Partial<Project> = {}): Project {
    return {
        name: 'test-project',
        componentSelections: { backend: 'adobe-commerce-accs' },
        componentConfigs: {
            'adobe-commerce-accs': {
                ACCS_GRAPHQL_ENDPOINT: 'https://catalog.example.com/graphql',
                ACCS_STORE_VIEW_CODE: 'default',
                ACCS_STORE_CODE: 'main_website_store',
                ACCS_WEBSITE_CODE: 'base',
                ACCS_CUSTOMER_GROUP: '',
            },
        },
        ...overrides,
    } as Project;
}

const ACCS_OVERLAY = 'https://example.adobeioruntime.net/api/v1/web/accs-discovery/render-pdp?org=skukla&site=citisignal-b2b';
const DA_ORG = 'skukla';
const DA_SITE = 'citisignal-b2b';

describe('prewarmCatalog — gate / skip cases', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        global.fetch = jest.fn();
    });

    it('skips when overlayUrl is undefined (BYOM disabled)', async () => {
        const result = await prewarmCatalog(
            makeAccsProject(), undefined, DA_ORG, DA_SITE, mockLogger as never,
        );
        expect(result).toEqual({ attempted: 0, succeeded: 0, failed: 0, skipped: true, skipReason: 'BYOM disabled' });
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('skips when overlay URL fails to parse to a prepublish URL', async () => {
        const result = await prewarmCatalog(
            makeAccsProject(), 'not-a-url', DA_ORG, DA_SITE, mockLogger as never,
        );
        expect(result.skipped).toBe(true);
        expect(result.skipReason).toContain('invalid overlay URL');
    });

    it('skips PaaS storefronts (v1 ACCS-only — PaaS in follow-up)', async () => {
        const paasProject = {
            ...makeAccsProject(),
            componentSelections: { backend: 'adobe-commerce-paas' },
        } as Project;

        const result = await prewarmCatalog(
            paasProject, ACCS_OVERLAY, DA_ORG, DA_SITE, mockLogger as never,
        );

        expect(result.skipped).toBe(true);
        expect(result.skipReason).toContain('non-ACCS backend');
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('skips when no Commerce endpoint is configured', async () => {
        const noEndpointProject = makeAccsProject({
            componentConfigs: {
                'adobe-commerce-accs': {
                    ACCS_STORE_VIEW_CODE: 'default',
                    // ACCS_GRAPHQL_ENDPOINT intentionally missing
                },
            },
        });
        const result = await prewarmCatalog(
            noEndpointProject, ACCS_OVERLAY, DA_ORG, DA_SITE, mockLogger as never,
        );
        expect(result.skipped).toBe(true);
        expect(result.skipReason).toContain('no commerce endpoint');
    });
});

describe('prewarmCatalog — happy path', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        global.fetch = jest.fn();
    });

    it('enumerates catalog and pre-warms every SKU; reports correct totals', async () => {
        // First call (catalog enumeration): returns 3 products on page 1, page_info says 1 total page
        // Subsequent calls (prepublish-pdp): 3 POSTs that all return 200
        (global.fetch as jest.Mock)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    data: {
                        productSearch: {
                            items: [
                                { productView: { sku: 'SKU1', urlKey: 'orchard-2' } },
                                { productView: { sku: 'SKU2', urlKey: 'widow-3' } },
                                { productView: { sku: 'SKU3', urlKey: 'nebula-1' } },
                            ],
                            page_info: { total_pages: 1, current_page: 1 },
                        },
                    },
                }),
            })
            .mockResolvedValue({ ok: true });

        const result = await prewarmCatalog(
            makeAccsProject(), ACCS_OVERLAY, DA_ORG, DA_SITE, mockLogger as never,
        );

        expect(result).toEqual({ attempted: 3, succeeded: 3, failed: 0, skipped: false });
        expect(global.fetch).toHaveBeenCalledTimes(4); // 1 enumeration + 3 prewarm
    });

    it('lowercases urlKey and sku in the pre-warm path (Helix content-bus normalizes lowercase)', async () => {
        // Critical for cold-path UX: if we pre-warm at the mixed-case
        // path, browsers hitting the lowercase URL still 404. The eager
        // redirect snippet relies on lowercase being warm. Pin that
        // pre-warming always lowercases both segments.
        (global.fetch as jest.Mock)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    data: {
                        productSearch: {
                            items: [{ productView: { sku: 'Orchard2', urlKey: 'Orchard-2' } }],
                            page_info: { total_pages: 1, current_page: 1 },
                        },
                    },
                }),
            })
            .mockResolvedValue({ ok: true });

        await prewarmCatalog(makeAccsProject(), ACCS_OVERLAY, DA_ORG, DA_SITE, mockLogger as never);

        // Second call is the prewarm POST. URL should encode the lowercase path.
        const prewarmCall = (global.fetch as jest.Mock).mock.calls[1];
        const url = prewarmCall[0] as string;
        expect(url).toContain('path=%2Fproducts%2Forchard-2%2Forchard2');
    });

    it('underscore-escapes SKUs with spaces/special chars so the path matches getProductLink (ADR-007)', async () => {
        // A prose SKU (spaces) must be encoded with the same _HH scheme the
        // storefront's getProductLink uses, or the prewarmed/published path
        // won't match the link the browser requests. Raw spaces would also be
        // CDN-rejected by aem.live. urlKey is sanitized like sanitizeName.
        (global.fetch as jest.Mock)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    data: {
                        productSearch: {
                            items: [{ productView: { sku: 'Yale UNOplus-Series A', urlKey: 'CMLodestar' } }],
                            page_info: { total_pages: 1, current_page: 1 },
                        },
                    },
                }),
            })
            .mockResolvedValue({ ok: true });

        await prewarmCatalog(makeAccsProject(), ACCS_OVERLAY, DA_ORG, DA_SITE, mockLogger as never);

        const url = (global.fetch as jest.Mock).mock.calls[1][0] as string;
        const expectedPath = '/products/cmlodestar/yale_20unoplus-series_20a';
        expect(url).toContain(`path=${encodeURIComponent(expectedPath)}`);
    });

    it('paginates through multiple pages of catalog results', async () => {
        // Page 1: 2 products, total_pages: 2
        // Page 2: 2 products, total_pages: 2
        // Then 4 prewarm POSTs
        (global.fetch as jest.Mock)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    data: {
                        productSearch: {
                            items: [
                                { productView: { sku: 'S1', urlKey: 'p1' } },
                                { productView: { sku: 'S2', urlKey: 'p2' } },
                            ],
                            page_info: { total_pages: 2, current_page: 1 },
                        },
                    },
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    data: {
                        productSearch: {
                            items: [
                                { productView: { sku: 'S3', urlKey: 'p3' } },
                                { productView: { sku: 'S4', urlKey: 'p4' } },
                            ],
                            page_info: { total_pages: 2, current_page: 2 },
                        },
                    },
                }),
            })
            .mockResolvedValue({ ok: true });

        const result = await prewarmCatalog(
            makeAccsProject(), ACCS_OVERLAY, DA_ORG, DA_SITE, mockLogger as never,
        );

        expect(result.attempted).toBe(4);
        expect(result.succeeded).toBe(4);
        // 2 enumeration pages + 4 prewarm
        expect(global.fetch).toHaveBeenCalledTimes(6);
    });

    it('reports progress via onProgress callback as each SKU completes', async () => {
        const onProgress = jest.fn();
        (global.fetch as jest.Mock)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    data: {
                        productSearch: {
                            items: [
                                { productView: { sku: 'S1', urlKey: 'p1' } },
                                { productView: { sku: 'S2', urlKey: 'p2' } },
                            ],
                            page_info: { total_pages: 1, current_page: 1 },
                        },
                    },
                }),
            })
            .mockResolvedValue({ ok: true });

        await prewarmCatalog(makeAccsProject(), ACCS_OVERLAY, DA_ORG, DA_SITE, mockLogger as never, onProgress);

        // Per-SKU progress updates with current/total reflecting completion
        const progressCalls = onProgress.mock.calls.map(c => c[0]);
        const perSkuUpdates = progressCalls.filter(p => p.current !== undefined);
        expect(perSkuUpdates).toHaveLength(2);
        expect(perSkuUpdates[1]).toEqual(expect.objectContaining({ current: 2, total: 2 }));
    });
});

describe('prewarmCatalog — non-fatal failure modes', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        global.fetch = jest.fn();
    });

    it('returns skipped when catalog enumeration HTTP fails', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: false,
            status: 500,
        });

        const result = await prewarmCatalog(
            makeAccsProject(), ACCS_OVERLAY, DA_ORG, DA_SITE, mockLogger as never,
        );

        expect(result.skipped).toBe(true);
        expect(result.skipReason).toContain('enumeration failed');
    });

    it('returns skipped when GraphQL response contains errors', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ errors: [{ message: 'invalid store code' }] }),
        });

        const result = await prewarmCatalog(
            makeAccsProject(), ACCS_OVERLAY, DA_ORG, DA_SITE, mockLogger as never,
        );

        expect(result.skipped).toBe(true);
        expect(result.skipReason).toContain('GraphQL errors');
    });

    it('returns skipped when catalog is empty', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                data: {
                    productSearch: {
                        items: [],
                        page_info: { total_pages: 1, current_page: 1 },
                    },
                },
            }),
        });

        const result = await prewarmCatalog(
            makeAccsProject(), ACCS_OVERLAY, DA_ORG, DA_SITE, mockLogger as never,
        );

        expect(result.skipped).toBe(true);
        expect(result.skipReason).toBe('empty catalog');
    });

    it('counts per-SKU failures without aborting the pipeline', async () => {
        // 3 SKUs: prewarm 1 succeeds, 2 fails (500), 3 throws
        (global.fetch as jest.Mock)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    data: {
                        productSearch: {
                            items: [
                                { productView: { sku: 'S1', urlKey: 'p1' } },
                                { productView: { sku: 'S2', urlKey: 'p2' } },
                                { productView: { sku: 'S3', urlKey: 'p3' } },
                            ],
                            page_info: { total_pages: 1, current_page: 1 },
                        },
                    },
                }),
            })
            .mockResolvedValueOnce({ ok: true })      // S1
            .mockResolvedValueOnce({ ok: false, status: 500 })  // S2
            .mockRejectedValueOnce(new Error('network')); // S3

        const result = await prewarmCatalog(
            makeAccsProject(), ACCS_OVERLAY, DA_ORG, DA_SITE, mockLogger as never,
        );

        expect(result).toEqual({ attempted: 3, succeeded: 1, failed: 2, skipped: false });
    });

    it('skips products with missing urlKey or sku in the catalog response', async () => {
        // Defensive: if Catalog Service returns a row missing one of the
        // required fields, we can't construct a path. Skip silently.
        (global.fetch as jest.Mock)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    data: {
                        productSearch: {
                            items: [
                                { productView: { sku: 'S1', urlKey: 'p1' } },
                                { productView: { sku: 'S2' /* urlKey missing */ } },
                                { productView: { /* both missing */ } },
                                { productView: { sku: 'S3', urlKey: 'p3' } },
                            ],
                            page_info: { total_pages: 1, current_page: 1 },
                        },
                    },
                }),
            })
            .mockResolvedValue({ ok: true });

        const result = await prewarmCatalog(
            makeAccsProject(), ACCS_OVERLAY, DA_ORG, DA_SITE, mockLogger as never,
        );

        // 2 valid items → 2 attempted, 2 succeeded
        expect(result.attempted).toBe(2);
        expect(result.succeeded).toBe(2);
    });
});
