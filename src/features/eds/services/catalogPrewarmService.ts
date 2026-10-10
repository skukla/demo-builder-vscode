/**
 * Catalog pre-warming for BYOM PDP routing.
 *
 * Eliminates the cold-path UX visible to demo audiences by pre-publishing
 * every catalog SKU's PDP URL during storefront create/reset. After this
 * step runs, every product click is instant — no smart-404 trigger,
 * no spinner, no 1-2 second wait.
 *
 * Publishes through the extension's AUTHENTICATED Helix path
 * (`previewAndPublishPage`, which sends the DA.live bearer), NOT the external
 * `prepublish-pdp` action. Storefront setup pins a site admin, and any
 * `access.admin` role closes the whole Helix admin API to anonymous callers —
 * the anonymous POST this used to make returned 401 for every SKU (0/39 in the
 * field on beta.129).
 *
 * The smart-404 + prepublish-pdp fallback covers SKUs added to Commerce after
 * setup. The visitor's browser holds no credential; the shared action signs the
 * publish with the site's publish key, which the extension registers after every
 * site config write (`pdp/publishKeyRegistrar.ts`) and renews
 * (`pdp/publishKeyRenewalSweep.ts`).
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
 *   - `enumerateAccsCatalog(params)` (`catalogEnumeration.ts`) — the
 *     Catalog Service read, with the storefront's own `generateHeaders`
 *   - `runInBatches(items, 5, fn)` — concurrency primitive already
 *     used by HelixService for bulk delete; batch size 5 respects
 *     Helix admin's 10 req/s rate limit
 *   - `derivePrepublishUrl(overlayUrl)` — validates the overlay URL
 *
 * Non-fatal at every step. Failures log a warning and the pipeline
 * continues; the smart-404 fallback we vendored into delayed.js,
 * head.html, and 404.html handles any URL pre-warming missed.
 *
 * @module features/eds/services/catalogPrewarmService
 */

import { enumerateAccsCatalog, type SkuPath } from './catalogEnumeration';
import type { ConfigGeneratorParams } from './configGenerator';
import { derivePrepublishUrl } from './pdp/pdp404HandlerPublisher';
import { pdpPathFor } from './pdp/pdpPath';
import { describeScope } from './storefront/servedStorefrontConfig';
import { extractConfigParams } from './storefrontConfigParams';
import type { EdsPipelineProgressCallback } from './types';
import { runInBatches } from '@/core/utils/promiseUtils';
import type { Project } from '@/types/base';
import type { Logger } from '@/types/logger';

/**
 * Concurrency for the per-SKU publishes. Helix admin enforces ~10 req/s per
 * project, and each SKU is one preview+publish pair, so concurrency here
 * translates 1:1 to Helix admin request rate. 5 is conservative and avoids 429s.
 */
const BATCH_SIZE = 5;

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
    /** SKUs whose page published */
    succeeded: number;
    /** SKUs whose publish threw */
    failed: number;
    /** True if we skipped pre-warming entirely (gate failed) */
    skipped: boolean;
    /** Set when skipped=true to explain why */
    skipReason?: string;
}

/**
 * The single Helix capability pre-warming needs. `HelixService` satisfies this
 * structurally, so callers just pass their existing instance.
 *
 * Declared as a narrow interface rather than importing `HelixService` because
 * pre-warming needs exactly one method of it, and a narrow contract keeps the
 * test doubles honest.
 */
export interface PdpPublisher {
    previewAndPublishPage(org: string, site: string, path: string, branch?: string): Promise<void>;
}

/**
 * Pre-warm every SKU in the storefront's catalog by publishing its PDP path.
 *
 * Steps:
 *   1. Check the configured overlay URL is well formed (BYOM gate).
 *   2. Determine the backend type (ACCS-only in v1).
 *   3. Enumerate the catalog via Catalog Service GraphQL.
 *   4. For each `(urlKey, sku)`, preview and publish its page through the
 *      authenticated `PdpPublisher`.
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
    publisher: PdpPublisher,
    logger: Logger,
    onProgress?: EdsPipelineProgressCallback,
): Promise<PrewarmResult> {
    if (!overlayUrl) {
        logger.info('[Catalog Prewarm] BYOM disabled (no overlayUrl) — skipping');
        return makeSkipped('BYOM disabled');
    }

    // The overlay URL no longer carries the publish call — we publish through
    // the authenticated Helix path below — but a malformed one still means BYOM
    // PDP rendering is misconfigured, and publishing paths that would render
    // nothing helps no one. Keep it as a gate.
    if (!derivePrepublishUrl(overlayUrl)) {
        logger.warn('[Catalog Prewarm] Invalid overlay URL — skipping');
        return makeSkipped('invalid overlay URL');
    }

    const params = extractConfigParams(project);
    if (params.environmentType !== 'accs') {
        logger.info(
            `[Catalog Prewarm] Skipping for ${params.environmentType ?? 'unknown'} backend (v1 ACCS-only; PaaS in follow-up)`,
        );
        return makeSkipped(`non-ACCS backend (${params.environmentType ?? 'unknown'})`);
    }

    if (!params.commerceEndpoint) {
        logger.warn('[Catalog Prewarm] No Commerce/Catalog endpoint configured — skipping');
        return makeSkipped('no commerce endpoint');
    }

    onProgress?.({ operation: 'catalog-prewarm', message: 'Enumerating catalog' });

    let skuPaths: SkuPath[];
    try {
        skuPaths = await enumerateAccsCatalog(params as ConfigGeneratorParams, logger);
    } catch (error) {
        const reason = (error as Error).message;
        // Name the SCOPE. The enumeration is `productSearch` against Catalog
        // Service, scoped by the `Store:` header, so its commonest failure —
        // `No index was found for this request` — means THIS store view has no
        // search index. That index is built per scope and separately from the
        // catalog, so the error is identical whether the backend holds zero
        // products or thirty thousand: a colleague hit it on 2026-08-18 with a
        // populated backend. Without the scope, a project with more than one
        // store view cannot even tell which one is unindexed.
        const scope = describeScope({
            websiteCode: params.websiteCode,
            storeCode: params.storeCode,
            storeViewCode: params.storeViewCode,
        });
        // The no-index case gets its own guidance. The index is per store view
        // and separate from the catalog, so this fails identically for 0 or
        // 30,000 products (measured 2026-08-18 against a populated backend).
        // The usual demo-instance cause is Live Search's public "Catalog data
        // retention policy" (Live Search overview): an environment whose
        // catalog stays EMPTY for 45 days — or a testing environment unqueried
        // for 90 — is hibernated, and importing products does NOT by itself
        // wake it; a product-attribute edit is a field-reported (unverified)
        // way to force index creation, and the documented remedy is an Adobe
        // support request. Prewarm is an
        // optimization either way: the runtime smart-404 publishes each PDP on
        // first visit regardless.
        if (/no index was found/i.test(reason)) {
            logger.warn(
                `[Catalog Prewarm] No Catalog Service search index exists for scope ${scope}. ` +
                    `Live Search hibernates an environment's search data when its catalog stays ` +
                    `empty for 45 days, or a testing environment goes unqueried for 90 (see ` +
                    `"Catalog data retention policy" in the Live Search overview) — and importing ` +
                    `products does not by itself wake it. Cheap first try: edit any product ` +
                    `attribute in the Admin — a metadata update can trigger index creation ` +
                    `(field-reported, not in the public docs) — and retry after ~15 minutes. ` +
                    `If search still fails, an ` +
                    `Adobe support request titled "Reactivate Live Search" (include the environment ` +
                    `id) restores it within a couple of hours. A brand-new scope may instead still ` +
                    `be indexing — retry later. Product pages still work meanwhile: the runtime ` +
                    `smart-404 publishes each PDP on first visit, and Republish (or Reset) ` +
                    `re-runs pre-warming.`,
            );
        } else {
            logger.warn(
                `[Catalog Prewarm] Catalog enumeration failed for scope ${scope}: ${reason}` +
                    ' — falling back to runtime smart-404 only',
            );
        }
        return makeSkipped(`enumeration failed: ${reason}`);
    }

    if (skuPaths.length === 0) {
        logger.info('[Catalog Prewarm] Catalog returned 0 SKUs — nothing to prewarm');
        return makeSkipped('empty catalog');
    }

    logger.info(
        `[Catalog Prewarm] Enumerated ${skuPaths.length} SKUs; pre-warming PDP URLs in batches of ${BATCH_SIZE}`,
    );

    let completed = 0;
    const results = await runInBatches(skuPaths, BATCH_SIZE, async (skuPath: SkuPath) => {
        const ok = await publishOne(publisher, daLiveOrg, daLiveSite, skuPath, logger);
        completed += 1;
        onProgress?.({
            operation: 'catalog-prewarm',
            message: `Pre-warming PDPs: ${completed}/${skuPaths.length}`,
            current: completed,
            total: skuPaths.length,
        });
        return ok;
    });

    const succeeded = results.filter(Boolean).length;
    const failed = skuPaths.length - succeeded;

    if (failed > 0) {
        // Deliberately does NOT promise a smart-404 rescue. The runtime fallback
        // POSTs to the same external action from the visitor's browser with no
        // credentials, so on a site with a pinned admin it 401s exactly as this
        // step used to. Telling the user a failed path self-heals would be a
        // false all-clear — worse than the failure itself.
        logger.warn(
            `[Catalog Prewarm] Complete: ${succeeded}/${skuPaths.length} succeeded, ${failed} failed — those PDPs will 404 until re-published`,
        );
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
 * Publish one (urlKey, sku) through the AUTHENTICATED Helix path, at
 * `pdpPathFor` — the path the storefront's `getProductLink` links to and the
 * one Helix stores the page under (ADR-024).
 *
 * This used to POST anonymously to the external `prepublish-pdp` action. Once
 * storefront setup began pinning a site admin, any `access.admin` role closed
 * the whole Helix admin API to anonymous callers and every SKU 401'd — 0/39 in
 * the field on beta.129. `previewAndPublishPage` sends the DA.live bearer, and
 * issues the same preview-then-live pair the action issued on our behalf, so
 * the Helix request rate per SKU is unchanged.
 *
 * Returns true on success, false when the publish throws. Errors are swallowed
 * and logged at debug because per-SKU failures are non-fatal — the caller
 * counts them and reports the total in the summary.
 */
async function publishOne(
    publisher: PdpPublisher,
    org: string,
    site: string,
    skuPath: SkuPath,
    logger: Logger,
): Promise<boolean> {
    const path = pdpPathFor(skuPath.urlKey, skuPath.sku);
    try {
        await publisher.previewAndPublishPage(org, site, path);
        return true;
    } catch (error) {
        logger.debug(`[Catalog Prewarm] ${path} failed: ${(error as Error).message}`);
        return false;
    }
}

function makeSkipped(reason: string): PrewarmResult {
    return { attempted: 0, succeeded: 0, failed: 0, skipped: true, skipReason: reason };
}
