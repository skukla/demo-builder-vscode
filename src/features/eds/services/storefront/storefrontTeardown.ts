/**
 * storefrontTeardown — taking an EDS storefront off the internet, in one place.
 *
 * Five steps, in an order that matters:
 *
 *   1. **Unpublish from the CDN.** aem.live keeps serving what was published even
 *      after the source is gone, so this goes FIRST. It is addressed by the
 *      GitHub repo, not by the DA.live site, because that is what the Helix admin
 *      API is keyed on (ADR 002; the DA.live Bearer token is the only credential
 *      that gets past "while source exists").
 *   2. **Remove the product pages** the overlay published (EDS-26,
 *      `productPageRemoval.ts`). They have no DA.live document, so step 1's listing
 *      never names them; Helix's own listing does. Left alone, with the reason, when
 *      another local project publishes to the same repository.
 *   3. Delete the site's Admin API key, which has nothing left to authorize.
 *   4. Delete the DA.live source documents.
 *   5. Remove the site's permission rows and its site config.
 *
 * **Why it is shared.** Step 1 lived only in the delete-project button
 * (`projectDeletionService`), so the agent's `cleanup_dalive_site` — which calls
 * `deleteAllSiteContent`, step 4 alone — deleted the source and left the
 * storefront LIVE, with `delete_page` (one page at a time) as its only other
 * route. An SC cannot return to zero through an agent that way, which is the
 * first property this extension holds (AI-9, answered 2026-09-19).
 *
 * Without a repo there is nothing to unpublish against: the teardown says so in
 * `stillPublished` rather than reporting a clean finish, because "the source is
 * gone" and "the site is down" are different claims.
 *
 * @module features/eds/services/storefront/storefrontTeardown
 */

import { removeProductPages, type ProductPageRemovalResult } from './productPageRemoval';
import { DaLiveContentOperations } from '@/features/eds/services/daLive/daLiveContentOperations';
import { HelixService } from '@/features/eds/services/helix/helixService';
import type { Logger } from '@/types/logger';

/** What a DA.live access token is read from, per call. */
export interface DaLiveTokenProvider {
    getAccessToken: () => Promise<string | null>;
}

/**
 * The four Helix calls the unpublish makes, out of a class with dozens. A narrow
 * seam is what let this be tested at all — see `projectDeletionService`, whose
 * module mock once supplied a method the source had stopped calling.
 */
export interface TeardownHelix {
    listAllPages(org: string, site: string, path?: string): Promise<string[]>;
    unpublishPages(
        org: string,
        site: string,
        branch: string,
        webPaths: string[]
    ): Promise<{
        success: boolean;
        count: number;
        total: number;
        liveFailed: number;
        previewFailed: number;
    }>;
    deleteAdminApiKey(org: string, site: string): Promise<{ success: boolean; error?: string }>;
    /** What the site has in preview or live matching a pattern — where product pages are found. */
    listPublishedPaths(org: string, site: string, branch: string, pattern: string): Promise<string[]>;
}

/** The DA.live content calls the teardown makes. */
export interface TeardownContentOps {
    deleteAllSiteContent(
        org: string,
        site: string,
        onProgress?: (info: { deleted: number; current: string }) => void
    ): Promise<{ success: boolean; deletedCount: number; deletedPaths: string[]; error?: string }>;
}

/** The storefront being taken down. */
export interface StorefrontTeardownTarget {
    daLiveOrg: string;
    daLiveSite: string;
    /**
     * `owner/repo`. Without it the CDN cannot be unpublished — see the module
     * docstring — and the result says the site is still published.
     */
    githubRepo?: string;
}

export interface StorefrontTeardownDeps {
    tokenProvider: DaLiveTokenProvider;
    logger: Logger;
    /** Where the Helix admin key is kept; the unpublish needs it loaded. */
    initKeyStore: () => Promise<void>;
    /** Injectable for tests; defaults to the real Helix service. */
    makeHelix?: (logger: Logger, tokenProvider: DaLiveTokenProvider) => TeardownHelix;
    /** Injectable for tests; defaults to the real content operations. */
    makeContentOps?: (tokenProvider: DaLiveTokenProvider, logger: Logger) => TeardownContentOps;
    /**
     * Display names of OTHER local projects publishing to this `owner/repo`. Product
     * pages are left alone when there are any (EDS-26). Required, so every caller says
     * which project, if any, it is acting for.
     */
    otherProjectsOnRepo: (githubRepo: string) => Promise<string[]>;
    /** One short line per step, for a caller that is narrating progress. */
    onStep?: (step: string) => void;
}

export interface StorefrontTeardownResult {
    /** How many pages were unpublished; undefined when it was not attempted. */
    unpublishedPages?: number;
    /**
     * TRUE when the CDN was never unpublished, so the storefront may still be
     * serving. A caller that says "deleted" without reading this is lying to an
     * SC about whether the site is down.
     */
    stillPublished: boolean;
    /**
     * What happened to the product pages the overlay published (EDS-26); undefined when
     * there was no repo to act against. Its `summary` is for the SC — a caller that
     * reports the teardown without it can hide pages that are still live.
     */
    productPages?: ProductPageRemovalResult;
    /** Whether the DA.live source documents went. */
    contentDeleted: boolean;
    /** How many source documents were deleted. */
    deletedCount?: number;
    error?: string;
}

/**
 * Take the storefront down: CDN first, then the source, then its config.
 *
 * Never throws: each step reports and the next still runs, because a half-torn
 * storefront is worse than a fully torn one. The result says what happened.
 */
export async function tearDownStorefront(
    target: StorefrontTeardownTarget,
    deps: StorefrontTeardownDeps,
): Promise<StorefrontTeardownResult> {
    const { logger, tokenProvider, onStep } = deps;
    const { daLiveOrg, daLiveSite } = target;
    const result: StorefrontTeardownResult = { stillPublished: true, contentDeleted: false };

    const [owner, repo] = (target.githubRepo ?? '').split('/');
    if (owner && repo) {
        onStep?.('Taking the pages off the CDN');
        try {
            await deps.initKeyStore();
            const helix = (deps.makeHelix ?? ((l, tp) => new HelixService(l, undefined, tp)))(
                logger,
                tokenProvider,
            );
            const pages = await helix.listAllPages(daLiveOrg, daLiveSite);
            const unpublished = await helix.unpublishPages(owner, repo, 'main', pages);
            result.unpublishedPages = unpublished.count;
            result.stillPublished = !unpublished.success;
            if (!unpublished.success) {
                logger.warn(`[Teardown] CDN unpublish failed for ${owner}/${repo}`);
            }

            // The DA.live pages just listed ARE the authored pages: anything else Helix
            // holds under /products/{urlKey}/{sku} was made through the overlay.
            onStep?.('Removing the product pages');
            result.productPages = await removeProductPages(
                { repoOwner: owner, repoName: repo },
                {
                    helix,
                    listAuthoredProductPages: async () => pages,
                    otherProjectsOnRepo: () => deps.otherProjectsOnRepo(`${owner}/${repo}`),
                    logger,
                },
            );

            const keyDeleted = await helix.deleteAdminApiKey(daLiveOrg, daLiveSite);
            if (!keyDeleted.success) {
                logger.debug(`[Teardown] Admin API key cleanup skipped: ${keyDeleted.error}`);
            }
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            logger.warn(`[Teardown] CDN unpublish failed: ${reason}`);
        }
    } else {
        logger.warn(
            `[Teardown] No GitHub repo for ${daLiveOrg}/${daLiveSite} — the source will go, ` +
                'but whatever is published stays live on the CDN',
        );
    }

    onStep?.('Deleting the DA.live content');
    const contentOps = (deps.makeContentOps ?? ((tp, l) => new DaLiveContentOperations(tp, l).sourceOps))(
        tokenProvider,
        logger,
    );
    // NOT wrapped: an org mismatch has to reach the caller as itself. The agent
    // surface maps it to a typed non-retryable answer, and swallowing it here
    // turned that into a plain "deletion failed" string.
    const deleted = await contentOps.deleteAllSiteContent(daLiveOrg, daLiveSite);
    logger.debug(
        `[Teardown] DA.live content deleted: ${deleted.deletedCount} file(s) from ${daLiveOrg}/${daLiveSite}`,
    );
    result.contentDeleted = deleted.success;
    result.deletedCount = deleted.deletedCount;
    result.error = deleted.error;

    onStep?.('Clearing the site settings');
    const { DaLiveConfigService } = await import('@/features/eds/services/daLive/daLiveConfigService');
    const configService = new DaLiveConfigService(tokenProvider, logger);
    const permissions = await configService.removeSitePermissions(daLiveOrg, daLiveSite);
    if (!permissions.success) {
        logger.warn(`[Teardown] Permission cleanup failed: ${permissions.error}`);
    }
    const config = await configService.deleteSiteConfig(daLiveOrg, daLiveSite);
    if (!config.success) {
        logger.debug(`[Teardown] Site config cleanup skipped: ${config.error}`);
    }

    return result;
}
