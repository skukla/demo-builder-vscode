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

/** Preview one page: Helix pulls it from the content source into the preview partition. */
export async function previewPage(
    deps: PageContentDeps,
    org: string,
    site: string,
    path: string,
    branch: string,
): Promise<void> {
    const { logger } = deps;
    const githubToken = await deps.auth.getGitHubToken();
    const imsToken = await deps.auth.getDaLiveToken();
    const cleanPath = normalizeHelixPath(path);
    const url = buildPartitionUrl('preview', org, site, branch, cleanPath);

    logger.debug(`[Helix] Previewing page: ${url}`);

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
        await throwCredentialRefused(response, 'preview this content');
    }

    if (!response.ok) {
        throw new Error(`Failed to preview page: ${response.status} ${response.statusText}`);
    }

    logger.debug(`[Helix] Successfully previewed: ${cleanPath}`);
}

/**
 * Publish a page to live (sync from preview to live CDN)
 *
 * This triggers the Helix Admin to copy content from preview
 * to the .aem.live production URL.
 *
 * @throws Error on access denied (403) or network error
 */
export async function publishPage(
    deps: PageContentDeps,
    org: string,
    site: string,
    path: string,
    branch: string,
): Promise<void> {
    const { logger } = deps;
    const githubToken = await deps.auth.getGitHubToken();
    const imsToken = await deps.auth.getDaLiveToken();
    const cleanPath = normalizeHelixPath(path);
    const url = buildPartitionUrl('live', org, site, branch, cleanPath);

    logger.debug(`[Helix] Publishing page: ${url}`);

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
        throw new Error('Access denied. You do not have permission to publish this content.');
    }

    if (!response.ok) {
        throw new Error(`Failed to publish page: ${response.status} ${response.statusText}`);
    }

    logger.debug(`[Helix] Successfully published: ${cleanPath}`);
}
