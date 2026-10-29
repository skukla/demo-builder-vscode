/**
 * The diagnostics sample: one real product and the PDP path it should resolve
 * at, picked from the scope the live storefront is serving.
 *
 * READ-ONLY. It enumerates the catalog and builds a path; nothing here publishes.
 *
 * @module features/eds/services/catalogSampleSku
 */

import { enumerateAccsCatalog } from './catalogEnumeration';
import type { ConfigGeneratorParams } from './configGenerator';
import { pdpPathFor } from './pdp/pdpPath';
import {
    describeScope,
    fetchServedStorefrontConfig,
    scopesMatch,
    type StoreScope,
} from './storefront/servedStorefrontConfig';
import { extractConfigParams } from './storefrontConfigParams';
import type { Project } from '@/types/base';
import type { Logger } from '@/types/logger';
import { getEdsGithubRepo } from '@/types/typeGuards';

/** One catalog product, plus the PDP path the storefront will generate for it. */
export interface SamplePdp {
    sku: string;
    urlKey: string;
    /** Built with the SAME helpers the storefront's `getProductLink` uses. */
    path: string;
    /** Which config the store scope came from. `manifest` means the CDN read failed. */
    scopeSource: 'served' | 'manifest';
    /**
     * Set when the served and manifest scopes disagree.
     *
     * Usually EXPECTED: a Configure save marks the project stale and the scopes
     * differ until Republish. `unexpected` is the case worth acting on — the
     * project claims `published` yet the CDN serves a different scope, meaning a
     * publish did not take. `edsStorefrontStatusSummary` cannot see that,
     * because it compares bookkeeping to intent and never reads the CDN.
     */
    scopeDivergence?: {
        served: StoreScope;
        manifest: StoreScope;
        unexpected: boolean;
    };
}

/** What {@link applyServedScope} resolved: the params to enumerate with, and why. */
interface ScopedEnumeration {
    params: Partial<ConfigGeneratorParams>;
    scopeSource: 'served' | 'manifest';
    scopeDivergence?: SamplePdp['scopeDivergence'];
}

/**
 * Swap the manifest's store scope for the one the storefront is actually serving.
 *
 * The probe asks the LIVE storefront whether a PDP renders, so the sample product
 * has to come from the scope that storefront is querying. Picking from the
 * manifest instead is what turns a scope mismatch into a "broken storefront"
 * verdict on a storefront that is serving its own scope correctly.
 *
 * Only the SCOPE is taken from the served config. The endpoint stays the
 * manifest's: enumeration talks to Catalog Service directly, which is not
 * necessarily what `commerce-endpoint` names.
 *
 * Falls back to the manifest whenever the CDN cannot be read — no answer at all
 * is worse than one built from the project's own intent.
 */
async function applyServedScope(
    project: Project,
    params: Partial<ConfigGeneratorParams>,
    logger: Logger,
): Promise<ScopedEnumeration> {
    const manifestScope: StoreScope = {
        websiteCode: params.websiteCode,
        storeCode: params.storeCode,
        storeViewCode: params.storeViewCode,
    };

    const githubRepo = getEdsGithubRepo(project);
    const [owner, repo] = (githubRepo ?? '').split('/');
    if (!owner || !repo) {
        return { params, scopeSource: 'manifest' };
    }

    const served = await fetchServedStorefrontConfig(owner, repo, logger);
    if (!served) {
        logger.debug('[Storefront Probe] Served config unreadable — sampling from the manifest');
        return { params, scopeSource: 'manifest' };
    }

    const matched = scopesMatch(served.scope, manifestScope);
    if (!matched) {
        // A save-then-Republish gap makes this expected; `published` here means a
        // publish silently did not take, which nothing else measures.
        const unexpected = project.edsStorefrontStatusSummary === 'published';
        const detail =
            `[Storefront Probe] Serving ${describeScope(served.scope)}, ` +
            `project configured for ${describeScope(manifestScope)}`;
        if (unexpected) {
            logger.warn(`${detail} — project reads 'published', so a publish did not take`);
        } else {
            logger.info(
                `${detail} (status: ${project.edsStorefrontStatusSummary ?? 'unknown'}) — ` +
                    'sampling from the served scope',
            );
        }

        return {
            params: { ...params, ...served.scope },
            scopeSource: 'served',
            scopeDivergence: { served: served.scope, manifest: manifestScope, unexpected },
        };
    }

    return { params, scopeSource: 'served' };
}

/**
 * Pick one real product and the PDP path it should resolve at.
 *
 * Exists for the diagnostics probe. `/products/default` proves only that the
 * overlay's SOURCE template is published — it answers 200 whether or not the
 * overlay is registered or the action is deployed. A path built for a SKU the
 * catalog just confirmed exists is the only fetch that exercises the whole
 * chain: overlay registered → `render-pdp` reachable → template fetched → page
 * written to the content bus.
 *
 * It is also the only live check on the path contract: this builds the path
 * with `pdpPathFor` and asks the storefront and `render-pdp` to serve it, so a
 * disagreement about where a product's page lives shows up as a 404.
 *
 * READ-ONLY. Enumeration is a GraphQL POST to Catalog Service, which is a query;
 * this must never publish. The publishing path is `publishOne` in
 * `catalogPrewarmService.ts`, which this file does not import.
 *
 * Every failure returns undefined — a Commerce outage, a PaaS backend, or an
 * empty catalog is not a storefront fault and must not colour the verdict.
 *
 * @param project - the project whose Commerce config to read
 * @param logger - for the skip reason
 * @returns a sample product and its PDP path, or undefined when unavailable
 */
export async function pickSampleSku(
    project: Project,
    logger: Logger,
): Promise<SamplePdp | undefined> {
    const params = extractConfigParams(project);
    if (params.environmentType !== 'accs') {
        logger.debug(
            `[Storefront Probe] No SKU sample for ${params.environmentType ?? 'unknown'} backend (enumeration is ACCS-only)`,
        );
        return undefined;
    }
    if (!params.commerceEndpoint) {
        logger.debug('[Storefront Probe] No SKU sample — no Commerce endpoint configured');
        return undefined;
    }

    const scoped = await applyServedScope(project, params, logger);

    try {
        const [first] = await enumerateAccsCatalog(
            scoped.params as ConfigGeneratorParams,
            logger,
            1,
        );
        if (!first) {
            logger.debug('[Storefront Probe] No SKU sample — catalog returned no products');
            return undefined;
        }
        return {
            sku: first.sku,
            urlKey: first.urlKey,
            path: pdpPathFor(first.urlKey, first.sku),
            scopeSource: scoped.scopeSource,
            scopeDivergence: scoped.scopeDivergence,
        };
    } catch (error) {
        logger.debug(
            `[Storefront Probe] No SKU sample — catalog enumeration failed: ${(error as Error).message}`,
        );
        return undefined;
    }
}
