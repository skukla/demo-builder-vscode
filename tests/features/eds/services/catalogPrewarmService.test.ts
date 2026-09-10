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

import { pickSampleSku, prewarmCatalog } from '@/features/eds/services/catalogPrewarmService';
import {
    catalogPage,
    makeAccsProject,
    makePublisher,
    mockLogger,
} from './catalogPrewarmService.testUtils';
import { createMockProject } from '../../../helpers/projectFake';

const ACCS_OVERLAY =
    'https://example.adobeioruntime.net/api/v1/web/accs-discovery/render-pdp?org=skukla&site=citisignal-b2b';
const DA_ORG = 'skukla';
const DA_SITE = 'citisignal-b2b';

describe('prewarmCatalog — gate / skip cases', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        global.fetch = jest.fn();
    });

    it('skips when overlayUrl is undefined (BYOM disabled)', async () => {
        const result = await prewarmCatalog(
            makeAccsProject(),
            undefined,
            DA_ORG,
            DA_SITE,
            makePublisher(),
            mockLogger
        );
        expect(result).toEqual({
            attempted: 0,
            succeeded: 0,
            failed: 0,
            skipped: true,
            skipReason: 'BYOM disabled',
        });
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('skips when overlay URL fails to parse to a prepublish URL', async () => {
        const result = await prewarmCatalog(
            makeAccsProject(),
            'not-a-url',
            DA_ORG,
            DA_SITE,
            makePublisher(),
            mockLogger
        );
        expect(result.skipped).toBe(true);
        expect(result.skipReason).toContain('invalid overlay URL');
    });

    it('skips PaaS storefronts (v1 ACCS-only — PaaS in follow-up)', async () => {
        const paasProject = createMockProject({
            ...makeAccsProject(),
            componentSelections: { backend: 'adobe-commerce-paas' },
        });

        const result = await prewarmCatalog(
            paasProject,
            ACCS_OVERLAY,
            DA_ORG,
            DA_SITE,
            makePublisher(),
            mockLogger
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
            noEndpointProject,
            ACCS_OVERLAY,
            DA_ORG,
            DA_SITE,
            makePublisher(),
            mockLogger
        );
        expect(result.skipped).toBe(true);
        expect(result.skipReason).toContain('no commerce endpoint');
    });
});

describe('prewarmCatalog — authenticated publish path', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        global.fetch = jest.fn();
    });

    // Storefront setup pins a site admin, and any `access.admin` role closes the
    // whole Helix admin API to anonymous callers. Prewarm used to POST to the
    // external prepublish-pdp action with no headers at all, so every SKU 401'd
    // (0/39 in the field, beta.129). It must publish through the extension's
    // own authenticated Helix path, which already sends the DA.live bearer.
    it('publishes each SKU through the authenticated publisher, never an anonymous POST', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce(
            catalogPage([{ sku: 'SKU1', urlKey: 'orchard-2' }])
        );
        const publisher = { previewAndPublishPage: jest.fn().mockResolvedValue(undefined) };

        const result = await prewarmCatalog(
            makeAccsProject(),
            ACCS_OVERLAY,
            DA_ORG,
            DA_SITE,
            publisher,
            mockLogger
        );

        expect(publisher.previewAndPublishPage).toHaveBeenCalledWith(
            DA_ORG,
            DA_SITE,
            '/products/orchard-2/sku1'
        );
        // The ONLY network call is the catalog enumeration — no unauthenticated
        // publish POST may survive this change.
        expect((global.fetch as jest.Mock).mock.calls).toHaveLength(1);
        expect(result).toEqual({ attempted: 1, succeeded: 1, failed: 0, skipped: false });
    });

    it('counts a thrown publish as failed without aborting the rest', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce(
            catalogPage([
                { sku: 'SKU1', urlKey: 'a' },
                { sku: 'SKU2', urlKey: 'b' },
            ])
        );
        const publisher = {
            previewAndPublishPage: jest
                .fn()
                .mockRejectedValueOnce(new Error('401 Unauthorized'))
                .mockResolvedValueOnce(undefined),
        };

        const result = await prewarmCatalog(
            makeAccsProject(),
            ACCS_OVERLAY,
            DA_ORG,
            DA_SITE,
            publisher,
            mockLogger
        );

        expect(publisher.previewAndPublishPage).toHaveBeenCalledTimes(2);
        expect(result).toEqual({ attempted: 2, succeeded: 1, failed: 1, skipped: false });
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

        const publisher = makePublisher();
        const result = await prewarmCatalog(
            makeAccsProject(),
            ACCS_OVERLAY,
            DA_ORG,
            DA_SITE,
            publisher,
            mockLogger
        );

        expect(result).toEqual({ attempted: 3, succeeded: 3, failed: 0, skipped: false });
        expect(global.fetch).toHaveBeenCalledTimes(1); // enumeration only
        expect(publisher.previewAndPublishPage).toHaveBeenCalledTimes(3);
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

        const publisher = makePublisher();
        await prewarmCatalog(
            makeAccsProject(),
            ACCS_OVERLAY,
            DA_ORG,
            DA_SITE,
            publisher,
            mockLogger
        );

        // The published path must be lowercase in both segments.
        expect(publisher.previewAndPublishPage).toHaveBeenCalledWith(
            DA_ORG,
            DA_SITE,
            '/products/orchard-2/orchard2'
        );
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
                            items: [
                                {
                                    productView: {
                                        sku: 'Yale UNOplus-Series A',
                                        urlKey: 'CMLodestar',
                                    },
                                },
                            ],
                            page_info: { total_pages: 1, current_page: 1 },
                        },
                    },
                }),
            })
            .mockResolvedValue({ ok: true });

        const publisher = makePublisher();
        await prewarmCatalog(
            makeAccsProject(),
            ACCS_OVERLAY,
            DA_ORG,
            DA_SITE,
            publisher,
            mockLogger
        );

        const expectedPath = '/products/cmlodestar/yale_20unoplus-series_20a';
        expect(publisher.previewAndPublishPage).toHaveBeenCalledWith(DA_ORG, DA_SITE, expectedPath);
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

        const publisher = makePublisher();
        const result = await prewarmCatalog(
            makeAccsProject(),
            ACCS_OVERLAY,
            DA_ORG,
            DA_SITE,
            publisher,
            mockLogger
        );

        expect(result.attempted).toBe(4);
        expect(result.succeeded).toBe(4);
        expect(global.fetch).toHaveBeenCalledTimes(2); // 2 enumeration pages
        expect(publisher.previewAndPublishPage).toHaveBeenCalledTimes(4);
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

        await prewarmCatalog(
            makeAccsProject(),
            ACCS_OVERLAY,
            DA_ORG,
            DA_SITE,
            makePublisher(),
            mockLogger,
            onProgress
        );

        // Per-SKU progress updates with current/total reflecting completion
        const progressCalls = onProgress.mock.calls.map((c) => c[0]);
        const perSkuUpdates = progressCalls.filter((p) => p.current !== undefined);
        expect(perSkuUpdates).toHaveLength(2);
        expect(perSkuUpdates[1]).toEqual(expect.objectContaining({ current: 2, total: 2 }));
    });
});

describe('pickSampleSku', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        global.fetch = jest.fn();
    });

    it('returns the first product with a path built by the shared encoders', async () => {
        // The path must be byte-identical to what the storefront's getProductLink
        // produces, which is the whole point of building it with the same
        // sanitizeUrlKey / encodeSkuForUrl rather than by hand.
        (global.fetch as jest.Mock).mockResolvedValue(
            catalogPage([{ sku: 'VA19-SI-NA', urlKey: 'Cronus Yoga Pant' }])
        );

        const sample = await pickSampleSku(makeAccsProject(), mockLogger);

        expect(sample).toEqual({
            sku: 'VA19-SI-NA',
            urlKey: 'Cronus Yoga Pant',
            path: '/products/cronus-yoga-pant/va19-si-na',
            // No EDS repo on this fixture, so there is no served config to read.
            scopeSource: 'manifest',
            scopeDivergence: undefined,
        });
    });

    it('escapes a SKU that needs it, matching the URL the storefront will emit', async () => {
        // A SKU with a space is exactly the case ADR-007 exists for, and the case
        // where a drifted encoder copy would produce a different URL.
        (global.fetch as jest.Mock).mockResolvedValue(
            catalogPage([{ sku: 'AB 12/CD', urlKey: 'Widget' }])
        );

        const sample = await pickSampleSku(makeAccsProject(), mockLogger);

        expect(sample?.path).toBe('/products/widget/ab_2012_2fcd');
    });

    it('issues no POST to prepublish-pdp — this probe must not publish', async () => {
        // The control on read-only-ness. The GraphQL enumeration IS a POST, so
        // assert on the destination rather than the verb.
        (global.fetch as jest.Mock).mockResolvedValue(catalogPage([{ sku: 'S1', urlKey: 'u1' }]));

        await pickSampleSku(makeAccsProject(), mockLogger);

        for (const [url] of (global.fetch as jest.Mock).mock.calls) {
            expect(String(url)).not.toContain('prepublish-pdp');
        }
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('returns undefined for a non-ACCS backend', async () => {
        const paas = makeAccsProject({
            componentSelections: { backend: 'adobe-commerce-paas' },
        });

        expect(await pickSampleSku(paas, mockLogger)).toBeUndefined();
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('returns undefined when the catalog is empty', async () => {
        (global.fetch as jest.Mock).mockResolvedValue(catalogPage([]));

        expect(await pickSampleSku(makeAccsProject(), mockLogger)).toBeUndefined();
    });

    it('returns undefined when Catalog Service is down', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 503 });

        expect(await pickSampleSku(makeAccsProject(), mockLogger)).toBeUndefined();
    });

    it('returns undefined on GraphQL errors rather than throwing', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ errors: [{ message: 'boom' }] }),
        });

        expect(await pickSampleSku(makeAccsProject(), mockLogger)).toBeUndefined();
    });
});
