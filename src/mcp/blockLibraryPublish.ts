/**
 * Block-library publish/unpublish steps for the promote/remove MCP tools.
 *
 * The commit-push-publish tail of `promote_block_to_library` and its inverse:
 * sync the storefront, then preview/publish (or unpublish) the block's DA.live
 * library doc page via the Helix admin API. Failures are swallowed into the
 * returned status — never thrown, because the earlier writes may have already
 * succeeded.
 *
 * Split from `mcp-server.ts` (god-file decomposition, 2026-08-23).
 *
 * @module mcp/blockLibraryPublish
 */

import type { PromoteBlockContext } from './blockAuthoring';
import type { TokenProvider } from '@/features/eds/services/daLive/daLiveContentOperations';
import { previewAndPublishPage, unpublishPage } from '@/features/eds/services/helix/helixApiClient';
import { syncAndPublish } from '@/features/eds/services/storefront/storefrontSyncService';

/**
 * Build a static TokenProvider that returns the given token.
 * The promote flow resolves the DA.live token once (from the injected
 * credentials) and wraps it here — it does not fetch/refresh mid-call.
 */
export function staticTokenProvider(token: string): TokenProvider {
    return { getAccessToken: async () => token };
}

/**
 * Storefront commit/push/publish step. Failures are swallowed and reported via
 * the returned status — a publish failure must NOT throw because the doc page +
 * sheet + comp-def writes may have already succeeded.
 */
export async function publishStorefrontAndDaLive(
    ctx: PromoteBlockContext,
    blockId: string,
    githubToken: string | undefined,
    daLiveToken: string,
): Promise<'success' | 'partial' | 'failed'> {
    try {
        await syncAndPublish({
            storefrontPath: ctx.storefrontPath,
            commitMessage: `AI: promote block ${blockId} to library`,
            githubRepo: ctx.githubRepo,
            githubToken,
            daLiveToken,
        });
    } catch {
        return 'failed';
    }
    // Publish the DA.live doc page + sheet via Helix admin API (parallel to
    // the storefront publish). Failures here are partial — the storefront push
    // already succeeded.
    if (!ctx.githubRepo || !githubToken) {
        return 'success';
    }
    try {
        await previewAndPublishPage(
            ctx.githubRepo.owner,
            ctx.githubRepo.site,
            `/.da/library/blocks/${blockId}`,
            ctx.githubRepo.branch ?? 'main',
            { githubToken, daLiveToken },
        );
    } catch {
        return 'partial';
    }
    return 'success';
}

/**
 * Reverse of {@link publishStorefrontAndDaLive}: commit/push the storefront
 * removal, then unpublish the block's library doc page from Helix. Failures are
 * swallowed and reported via the returned status — never thrown, because the
 * comp-def + doc-page + sheet teardown may have already succeeded.
 *
 *   - `'success'` — storefront push + unpublish both succeeded (or nothing to
 *     unpublish because no GitHub repo/token is configured).
 *   - `'partial'` — storefront push succeeded but the unpublish hit an auth
 *     failure (401/403) or errored.
 *   - `'failed'`  — the storefront commit/push itself failed.
 */
export async function unpublishStorefrontAndDaLive(
    ctx: PromoteBlockContext,
    blockId: string,
    githubToken: string | undefined,
    daLiveToken: string,
): Promise<'success' | 'partial' | 'failed'> {
    try {
        await syncAndPublish({
            storefrontPath: ctx.storefrontPath,
            commitMessage: `AI: remove block ${blockId} from library`,
            githubRepo: ctx.githubRepo,
            githubToken,
            daLiveToken,
        });
    } catch {
        return 'failed';
    }
    if (!ctx.githubRepo || !githubToken) {
        return 'success';
    }
    try {
        const ok = await unpublishPage(
            ctx.githubRepo.owner,
            ctx.githubRepo.site,
            `/.da/library/blocks/${blockId}`,
            ctx.githubRepo.branch ?? 'main',
            { githubToken, daLiveToken },
        );
        return ok ? 'success' : 'partial';
    } catch {
        return 'partial';
    }
}
