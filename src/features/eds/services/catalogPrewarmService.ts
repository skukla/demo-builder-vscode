/**
 * Catalog pre-warming for BYOM PDP routing.
 *
 * Eliminates the cold-path UX visible to demo audiences by pre-publishing
 * every catalog SKU's PDP URL during storefront create/reset. After this
 * step runs, every product click is instant — no smart-404 trigger,
 * no spinner, no 1-2 second wait. The smart-404 + prepublish-pdp
 * mechanism stays in place as a fallback for SKUs added to Commerce
 * after setup, or for pre-warming failures.
 *
 * v1 covers ACCS storefronts only. PaaS auth requirements for the
 * direct /graphql endpoint (vs. mesh-routed) are unverified; PaaS
 * pre-warming is a follow-up after live-testing against a real PaaS
 * instance. PaaS storefronts continue to work via the smart-404
 * fallback in the meantime.
 *
 * Reuse strategy (researched 2026-06-09 — see
 * `.rptc/research/...` if filed):
 *   - `extractConfigParams(project)` — single source of truth for
 *     endpoint/auth config; reads the same data we write into the
 *     storefront's config.json
 *   - `generateHeaders(params)` — builds ACCS request headers
 *   - `runInBatches(items, 5, fn)` — concurrency primitive already
 *     used by HelixService for bulk delete; batch size 5 respects
 *     Helix admin's 10 req/s rate limit
 *   - `derivePrepublishUrl(overlayUrl)` — builds the action URL
 *   - `AbortSignal.timeout(TIMEOUTS.NORMAL)` — per-request 30s cap
 *
 * Non-fatal at every step. Failures log a warning and the pipeline
 * continues; the smart-404 fallback we vendored into delayed.js,
 * head.html, and 404.html handles any URL pre-warming missed.
 *
 * @module features/eds/services/catalogPrewarmService
 */

import { extractConfigParams, generateHeaders, type ConfigGeneratorParams } from './configGenerator';
import type { EdsPipelineProgressCallback } from './edsPipeline';
import { derivePrepublishUrl } from './pdp404HandlerPublisher';
import { encodeSkuForUrl, sanitizeUrlKey } from './pdpUrlEncoding';
import { runInBatches } from '@/core/utils/promiseUtils';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Project } from '@/types/base';
import type { Logger } from '@/types/logger';

/**
 * Concurrency for the bulk prepublish-pdp POST calls. Helix admin
 * enforces ~10 req/s per project. The action triggers Helix admin
 * preview+publish per path, so concurrency-here translates 1:1 to
 * Helix admin request rate. 5 is conservative and avoids 429s.
 */
const BATCH_SIZE = 5;

/**
 * Per-page result size for the catalog enumeration query. Catalog
 * Service handles up to 500 per page comfortably; 100 is a balance
 * between page count and response size.
 */
const PAGE_SIZE = 100;

/**
 * Safety cap on total SKUs pre-warmed. A typical demo catalog is
 * 5–50 SKUs; the largest POC we expect is several hundred. 1000 is
 * the soft upper bound: any storefront with a larger catalog opts
 * out of full pre-warming (smart-404 fallback handles the rest).
 */
const MAX_SKUS = 1000;

/**
 * GraphQL query for enumerating product `(sku, urlKey)` pairs from
 * Catalog Service. Uses `productSearch` which is the standard ACCS
 * Catalog Service query; both `sku` and `urlKey` come from the
 * `productView` field per Catalog Service's response shape.
 */
const ENUMERATE_QUERY = `
query GetProductsForPrewarm($pageSize: Int!, $currentPage: Int!) {
  productSearch(phrase: "", page_size: $pageSize, current_page: $currentPage) {
    items {
      productView {
        sku
        urlKey
      }
    }
    page_info {
      total_pages
      current_page
    }
  }
}`;

/**
 * Outcome of a catalog pre-warming attempt. Returned from
 * `prewarmCatalog` and surfaced in the pipeline summary log.
 *
 * Note that `skipped` is distinct from `attempted: 0` — the former
 * means we decided not to pre-warm at all (BYOM disabled, non-ACCS
 * backend, etc.) and the latter would mean we tried but the catalog
 * was empty.
 */
export interface PrewarmResult {
    /** Total SKUs we attempted to pre-warm (sum of succeeded + failed) */
    attempted: number;
    /** SKUs whose prepublish-pdp POST returned 2xx */
    succeeded: number;
    /** SKUs whose prepublish-pdp POST returned non-2xx or threw */
    failed: number;
    /** True if we skipped pre-warming entirely (gate failed) */
    skipped: boolean;
    /** Set when skipped=true to explain why */
    skipReason?: string;
}

/**
 * One (urlKey, sku) pair from the catalog. Combined to form a path
 * `/products/<urlKey>/<sku>` for prepublish-pdp.
 */
interface SkuPath {
    urlKey: string;
    sku: string;
}

/**
 * Pre-warm every SKU in the storefront's catalog by triggering
 * prepublish-pdp for each.
 *
 * Steps:
 *   1. Derive prepublish-pdp URL from the configured overlay URL.
 *   2. Determine the backend type (ACCS-only in v1).
 *   3. Enumerate the catalog via Catalog Service GraphQL.
 *   4. For each `(urlKey, sku)`, POST to prepublish-pdp.
 *   5. Return summary counts.
 *
 * Non-fatal at every step. Returns `skipped: true` for the no-op
 * cases (BYOM disabled, non-ACCS, no catalog endpoint, catalog
 * enumeration failed). Per-SKU failures during step 4 increment
 * `failed` but never abort.
 */
export async function prewarmCatalog(
    project: Project,
    overlayUrl: string | undefined,
    daLiveOrg: string,
    daLiveSite: string,
    logger: Logger,
    onProgress?: EdsPipelineProgressCallback,
): Promise<PrewarmResult> {
    if (!overlayUrl) {
        logger.info('[Catalog Prewarm] BYOM disabled (no overlayUrl) — skipping');
        return makeSkipped('BYOM disabled');
    }

    const prepublishUrl = derivePrepublishUrl(overlayUrl);
    if (!prepublishUrl) {
        logger.warn('[Catalog Prewarm] Invalid overlay URL — skipping');
        return makeSkipped('invalid overlay URL');
    }

    const params = extractConfigParams(project);
    if (params.environmentType !== 'accs') {
        logger.info(`[Catalog Prewarm] Skipping for ${params.environmentType ?? 'unknown'} backend (v1 ACCS-only; PaaS in follow-up)`);
        return makeSkipped(`non-ACCS backend (${params.environmentType ?? 'unknown'})`);
    }

    if (!params.commerceEndpoint) {
        logger.warn('[Catalog Prewarm] No Commerce/Catalog endpoint configured — skipping');
        return makeSkipped('no commerce endpoint');
    }

    onProgress?.({ operation: 'catalog-prewarm', message: 'Enumerating catalog...' });

    let skuPaths: SkuPath[];
    try {
        skuPaths = await enumerateAccsCatalog(params as ConfigGeneratorParams, logger);
    } catch (error) {
        const reason = (error as Error).message;
        logger.warn(`[Catalog Prewarm] Catalog enumeration failed: ${reason} — falling back to runtime smart-404 only`);
        return makeSkipped(`enumeration failed: ${reason}`);
    }

    if (skuPaths.length === 0) {
        logger.info('[Catalog Prewarm] Catalog returned 0 SKUs — nothing to prewarm');
        return makeSkipped('empty catalog');
    }

    logger.info(`[Catalog Prewarm] Enumerated ${skuPaths.length} SKUs; pre-warming PDP URLs in batches of ${BATCH_SIZE}`);

    let completed = 0;
    const results = await runInBatches(
        skuPaths,
        BATCH_SIZE,
        async (skuPath: SkuPath) => {
            const ok = await prewarmOne(prepublishUrl, daLiveOrg, daLiveSite, skuPath);
            completed += 1;
            onProgress?.({
                operation: 'catalog-prewarm',
                message: `Pre-warming PDPs: ${completed}/${skuPaths.length}`,
                current: completed,
                total: skuPaths.length,
            });
            return ok;
        },
    );

    const succeeded = results.filter(Boolean).length;
    const failed = skuPaths.length - succeeded;

    if (failed > 0) {
        logger.warn(`[Catalog Prewarm] Complete: ${succeeded}/${skuPaths.length} succeeded, ${failed} failed (failed paths fall back to smart-404 at runtime)`);
    } else {
        logger.info(`[Catalog Prewarm] Complete: ${succeeded}/${skuPaths.length} succeeded`);
    }

    return {
        attempted: skuPaths.length,
        succeeded,
        failed,
        skipped: false,
    };
}

/**
 * Enumerate every `(urlKey, sku)` pair in the catalog via ACCS
 * Catalog Service GraphQL. Pages through results until the catalog
 * is exhausted or the safety cap is hit.
 *
 * Throws on:
 *   - HTTP non-2xx from Catalog Service
 *   - GraphQL `errors` in the response
 *   - Unexpected response shape (missing `productSearch.items`)
 *
 * Caller treats throws as non-fatal and skips pre-warming entirely
 * for that storefront.
 */
async function enumerateAccsCatalog(
    params: ConfigGeneratorParams,
    logger: Logger,
): Promise<SkuPath[]> {
    // generateHeaders() returns { all: {...}, cs: {...} }. The catalog
    // GraphQL endpoint expects both groups merged on every request —
    // `all` is the shared base (Store: storeViewCode), `cs` is the
    // Catalog Service-specific block (Magento-Customer-Group, store
    // codes). Flatten before handing to fetch().
    const configHeaders = generateHeaders(params);
    const headers: Record<string, string> = {
        ...(configHeaders.all ?? {}),
        ...(configHeaders.cs ?? {}),
        'Content-Type': 'application/json',
    };
    const allPaths: SkuPath[] = [];
    let currentPage = 1;
    let totalPages = 1;

    do {
        const response = await fetch(params.commerceEndpoint!, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                query: ENUMERATE_QUERY,
                variables: { pageSize: PAGE_SIZE, currentPage },
            }),
            signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status} from ${params.commerceEndpoint}`);
        }

        const data = await response.json() as {
            data?: { productSearch?: { items?: Array<{ productView?: { sku?: string; urlKey?: string } }>; page_info?: { total_pages?: number; current_page?: number } } };
            errors?: Array<{ message: string }>;
        };

        if (data.errors && data.errors.length > 0) {
            throw new Error(`GraphQL errors: ${data.errors.map(e => e.message).join('; ')}`);
        }

        const result = data.data?.productSearch;
        if (!result?.items) {
            throw new Error('Catalog response missing productSearch.items');
        }

        for (const item of result.items) {
            const view = item.productView;
            if (view?.sku && view?.urlKey) {
                allPaths.push({ sku: view.sku, urlKey: view.urlKey });
                if (allPaths.length >= MAX_SKUS) {
                    logger.warn(`[Catalog Prewarm] Hit max SKU cap (${MAX_SKUS}); remaining pages skipped — smart-404 will warm them at runtime`);
                    return allPaths;
                }
            }
        }

        totalPages = result.page_info?.total_pages ?? 1;
        currentPage += 1;
    } while (currentPage <= totalPages);

    return allPaths;
}

/**
 * POST to prepublish-pdp for one (urlKey, sku). Builds the path with the
 * SAME transforms the storefront's `getProductLink` applies — `sanitizeUrlKey`
 * for the urlKey and `encodeSkuForUrl` (reversible `_HH` escaping) for the
 * sku — so the prewarmed/published path is byte-identical to the link the
 * browser later requests. Both produce lowercase, Helix-safe `[a-z0-9_-]`
 * output (raw spaces/percent-encoding would be CDN-rejected by aem.live; see
 * ADR-007). For clean SKUs this is identical to the old `.toLowerCase()` form.
 *
 * Returns true on 2xx, false on non-2xx or thrown error. Errors
 * are swallowed because per-SKU failures are non-fatal — the
 * caller counts failures and reports them in the summary.
 */
async function prewarmOne(
    prepublishUrl: string,
    org: string,
    site: string,
    skuPath: SkuPath,
): Promise<boolean> {
    const path = `/products/${sanitizeUrlKey(skuPath.urlKey)}/${encodeSkuForUrl(skuPath.sku)}`;
    const url = `${prepublishUrl}?org=${encodeURIComponent(org)}&site=${encodeURIComponent(site)}&path=${encodeURIComponent(path)}`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
        });
        return response.ok;
    } catch {
        return false;
    }
}

function makeSkipped(reason: string): PrewarmResult {
    return { attempted: 0, succeeded: 0, failed: 0, skipped: true, skipReason: reason };
}
