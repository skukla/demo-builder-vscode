/**
 * prewarmCatalog — non-fatal failure modes.
 *
 * Split from catalogPrewarmService.test.ts 2026-08-23 when the no-index
 * guidance tests pushed it past the 500-line limit (playbook split: test
 * count identical, shared setup stays in the testUtils sibling).
 */

import { prewarmCatalog } from '@/features/eds/services/catalogPrewarmService';
import {
    catalogPage,
    makeAccsProject,
    makePublisher,
    mockLogger,
} from './catalogPrewarmService.testUtils';

const ACCS_OVERLAY =
    'https://example.adobeioruntime.net/api/v1/web/accs-discovery/render-pdp?org=skukla&site=citisignal-b2b';
const DA_ORG = 'skukla';
const DA_SITE = 'citisignal-b2b';

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
            makeAccsProject(),
            ACCS_OVERLAY,
            DA_ORG,
            DA_SITE,
            makePublisher(),
            mockLogger as never
        );

        expect(result.skipped).toBe(true);
        expect(result.skipReason).toContain('enumeration failed');
    });

    /**
     * `No index was found for this request` is Catalog Service saying THIS STORE
     * VIEW has no search index — built per scope, separately from the catalog, so
     * it fails identically whether the backend holds 0 products or 30,000. A
     * colleague hit it on 2026-08-18 with a POPULATED backend, and the message
     * named no scope, so "which of my two store views is unindexed?" could not be
     * answered from the log. The scope is already in the headers just sent.
     */
    it('names the store scope it queried when enumeration fails', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ errors: [{ message: 'No index was found for this request' }] }),
        });

        await prewarmCatalog(
            makeAccsProject(),
            ACCS_OVERLAY,
            DA_ORG,
            DA_SITE,
            makePublisher(),
            mockLogger as never
        );

        // describeScope's exact shape: websiteCode / storeCode / storeViewCode.
        expect(JSON.stringify((mockLogger.warn as jest.Mock).mock.calls)).toContain(
            'base / main_website_store / default'
        );
    });

    /**
     * The no-index case earned its own guidance (2026-08-23). The usual
     * demo-instance cause is Live Search's public "Catalog data retention
     * policy": an environment whose catalog stays empty for 45 days (or a
     * testing environment unqueried for 90) is HIBERNATED, and importing
     * products does not by itself wake it — reactivation is an Adobe support
     * request titled "Reactivate Live Search". The warn must carry that
     * remedy, plus what still works (smart-404 covers runtime; Reset re-runs
     * prewarm) — not only what failed. A generic enumeration error keeps the
     * plain line (previous test).
     */
    it('gives actionable guidance on the no-index failure specifically', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ errors: [{ message: 'No index was found for this request' }] }),
        });

        await prewarmCatalog(
            makeAccsProject(),
            ACCS_OVERLAY,
            DA_ORG,
            DA_SITE,
            makePublisher(),
            mockLogger as never
        );

        const warns = JSON.stringify((mockLogger.warn as jest.Mock).mock.calls);
        expect(warns).toContain('Catalog data retention policy');
        expect(warns).toContain('Reactivate Live Search');
        expect(warns).toContain('smart-404');
        expect(warns).toContain('Republish');
    });

    it('keeps the plain failure line for non-index enumeration errors', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: false,
            status: 500,
        });

        await prewarmCatalog(
            makeAccsProject(),
            ACCS_OVERLAY,
            DA_ORG,
            DA_SITE,
            makePublisher(),
            mockLogger as never
        );

        const warns = JSON.stringify((mockLogger.warn as jest.Mock).mock.calls);
        expect(warns).toContain('falling back to runtime smart-404 only');
        expect(warns).not.toContain('Reactivate Live Search');
    });

    it('returns skipped when GraphQL response contains errors', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ errors: [{ message: 'invalid store code' }] }),
        });

        const result = await prewarmCatalog(
            makeAccsProject(),
            ACCS_OVERLAY,
            DA_ORG,
            DA_SITE,
            makePublisher(),
            mockLogger as never
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
            makeAccsProject(),
            ACCS_OVERLAY,
            DA_ORG,
            DA_SITE,
            makePublisher(),
            mockLogger as never
        );

        expect(result.skipped).toBe(true);
        expect(result.skipReason).toBe('empty catalog');
    });

    it('counts per-SKU failures without aborting the pipeline', async () => {
        // 3 SKUs: publish 1 succeeds, 2 and 3 throw (401 from a pinned-admin
        // site, and a transport error). `previewAndPublishPage` signals failure
        // by throwing rather than by a falsy return.
        (global.fetch as jest.Mock).mockResolvedValueOnce(
            catalogPage([
                { sku: 'S1', urlKey: 'p1' },
                { sku: 'S2', urlKey: 'p2' },
                { sku: 'S3', urlKey: 'p3' },
            ])
        );

        const publisher = makePublisher();
        publisher.previewAndPublishPage
            .mockResolvedValueOnce(undefined) // S1
            .mockRejectedValueOnce(new Error('401 Unauthorized')) // S2
            .mockRejectedValueOnce(new Error('network')); // S3

        const result = await prewarmCatalog(
            makeAccsProject(),
            ACCS_OVERLAY,
            DA_ORG,
            DA_SITE,
            publisher,
            mockLogger as never
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
                                {
                                    productView: {
                                        /* both missing */
                                    },
                                },
                                { productView: { sku: 'S3', urlKey: 'p3' } },
                            ],
                            page_info: { total_pages: 1, current_page: 1 },
                        },
                    },
                }),
            })
            .mockResolvedValue({ ok: true });

        const result = await prewarmCatalog(
            makeAccsProject(),
            ACCS_OVERLAY,
            DA_ORG,
            DA_SITE,
            makePublisher(),
            mockLogger as never
        );

        // 2 valid items → 2 attempted, 2 succeeded
        expect(result.attempted).toBe(2);
        expect(result.succeeded).toBe(2);
    });
});

/**
 * `pickSampleSku` — one real product for the diagnostics probe.
 *
 * Read-only: enumeration is a Catalog Service GraphQL query. It must never
 * reach `prewarmOne`, which POSTs to prepublish-pdp and publishes a page.
 *
 * Every failure returns undefined. A PaaS backend, a missing endpoint, or a
 * Catalog outage is not a storefront fault, and the probe must degrade to
 * "not checked" rather than reporting a broken storefront.
 */
