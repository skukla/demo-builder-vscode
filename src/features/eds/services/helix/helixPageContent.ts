/**
 * One authored page through Helix: preview it, publish it, ask what Helix holds for it.
 *
 * The single-page content operations. Preview and publish send BOTH credentials
 * (GitHub for the caller, the DA.live IMS token for the content source — see
 * `buildPublishHeaders`); the status read is a diagnostic that never throws.
 *
 * Extracted from `helixService.ts` on 2026-10-03 (EDS-8, its fourth cut). The
 * facade keeps `previewPage`, `publishPage` and `getResourceStatus` with their
 * signatures and delegates here.
 *
 * @module features/eds/services/helix/helixPageContent
 */

import type { HelixAdminAuth } from './helixAdminAuth';
import { ADMIN_API_401_MESSAGE, throwCredentialRefused } from './helixAdminErrors';
import {
    buildPartitionUrl,
    buildPublishHeaders,
    normalizeWebPath as normalizeHelixPath,
} from './helixApiClient';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types/logger';

/** What a page operation needs: the credential seam and somewhere to log. */
export interface PageContentDeps {
    auth: HelixAdminAuth;
    logger: Logger;
}

/** What Helix reports for one path; `httpStatus: 0` means the admin API was unreachable. */
export interface ResourceStatus {
    httpStatus: number;
    previewStatus?: number;
    liveStatus?: number;
    error?: string;
}

/**
 * What Helix holds for one path: the preview and live status it reports.
 *
 * A diagnostic, not a gate — it never throws, and an unreachable admin API
 * comes back as `httpStatus: 0` rather than failing the operation that asked.
 *
 * This exists because a publish reporting success proved nothing. The block
 * library published "fine" for a month while every doc page 404'd, and no
 * code ever asked Helix what it thought — one GET that carries `preview.status`
 * and, on a refusal, the `x-error` header that names the reason (the body is
 * empty on 401/403).
 *
 * @returns the admin HTTP status, the preview/live statuses when present, and any x-error
 */
export async function getResourceStatus(
    deps: PageContentDeps,
    org: string,
    site: string,
    path: string,
    branch: string,
): Promise<ResourceStatus> {
    const cleanPath = normalizeHelixPath(path);
    const url = buildPartitionUrl('status', org, site, branch, cleanPath);

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                ...(await deps.auth.tryAdminBearer()),
                'x-auth-token': await deps.auth.getGitHubToken(),
            },
            signal: AbortSignal.timeout(TIMEOUTS.QUICK),
        });

        const error = response.headers?.get?.('x-error') ?? undefined;
        if (!response.ok) {
            return { httpStatus: response.status, error };
        }

        const body = (await response.json()) as {
            preview?: { status?: number };
            live?: { status?: number };
        };
        return {
            httpStatus: response.status,
            previewStatus: body.preview?.status,
            liveStatus: body.live?.status,
            error,
        };
    } catch (error) {
        return { httpStatus: 0, error: (error as Error).message };
    }
}

/** How one single-page POST names itself in logs and errors. */
const PAGE_OPS = {
    preview: { doing: 'Previewing', did: 'Successfully previewed', verb: 'preview' },
    live: { doing: 'Publishing', did: 'Successfully published', verb: 'publish' },
} as const;

/**
 * POST one page to a Helix partition — preview pulls it from the content source,
 * live copies preview to the CDN. One body for both: they send the same
 * credentials and read the same answers, and a 403 is a refused credential on
 * either (see `throwCredentialRefused`), so an expired session re-prompts
 * whichever step it lands on.
 */
async function postPage(
    deps: PageContentDeps,
    partition: keyof typeof PAGE_OPS,
    org: string,
    site: string,
    path: string,
    branch: string,
): Promise<void> {
    const { logger } = deps;
    const op = PAGE_OPS[partition];
    const githubToken = await deps.auth.getGitHubToken();
    const imsToken = await deps.auth.getDaLiveToken();
    const cleanPath = normalizeHelixPath(path);
    const url = buildPartitionUrl(partition, org, site, branch, cleanPath);

    logger.debug(`[Helix] ${op.doing} page: ${url}`);

    const response = await fetch(url, {
        method: 'POST',
        // ONE credential definition with the vscode-free client (the
        // Authorization-first rationale lives on buildPublishHeaders).
        headers: buildPublishHeaders({ githubToken, daLiveToken: imsToken }),
        signal: AbortSignal.timeout(TIMEOUTS.LONG),
    });

    if (response.status === 401) {
        throw new Error(ADMIN_API_401_MESSAGE);
    }

    if (response.status === 403) {
        await throwCredentialRefused(response, `${op.verb} this content`);
    }

    if (!response.ok) {
        throw new Error(`Failed to ${op.verb} page: ${response.status} ${response.statusText}`);
    }

    logger.debug(`[Helix] ${op.did}: ${cleanPath}`);
}

/** Preview one page: Helix pulls it from the content source into the preview partition. */
export function previewPage(
    deps: PageContentDeps,
    org: string,
    site: string,
    path: string,
    branch: string,
): Promise<void> {
    return postPage(deps, 'preview', org, site, path, branch);
}

/**
 * Publish a page to live (sync from preview to live CDN)
 *
 * This triggers the Helix Admin to copy content from preview
 * to the .aem.live production URL.
 *
 * @throws DaLiveAuthError on a 403 (a refused credential); Error on other failures
 */
export function publishPage(
    deps: PageContentDeps,
    org: string,
    site: string,
    path: string,
    branch: string,
): Promise<void> {
    return postPage(deps, 'live', org, site, path, branch);
}
