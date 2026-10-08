/**
 * HelixBulkPublish — the Admin API's bulk preview and bulk publish.
 *
 * One POST to `/preview/{org}/{site}/{ref}/*` or `/live/{org}/{site}/{ref}/*`
 * with a paths array; the API answers 200 when it processed the batch at once
 * and 202 when it scheduled a job, which is then polled through
 * `helixBulkJobs`. Nothing here decides WHICH paths to send or what to do when
 * the bulk API refuses — that policy is `helixSiteContent`.
 *
 * Extracted from `helixSiteContent.ts` on 2026-10-08 (EDS-8). Auth arrives
 * through the injected {@link HelixAdminAuth}.
 *
 * @module features/eds/services/helix/helixBulkPublish
 */

import type { HelixAdminAuth } from './helixAdminAuth';
import { ADMIN_API_401_MESSAGE, throwCredentialRefused } from './helixAdminErrors';
import { buildPartitionUrl } from './helixApiClient';
import {
    parseBulkJobResponse,
    pollJobCompletion,
    type BulkJobDeps,
    type BulkProgressCallback,
} from './helixBulkJobs';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types/logger';

/** Default branch for Helix operations */
const DEFAULT_BRANCH = 'main';

/** Explicit paths when provided, otherwise the site root (`/`) for a bulk operation. */
function getPathsOrDefault(paths?: string[]): string[] {
    return paths && paths.length > 0 ? paths : ['/'];
}

/** What the bulk operations need from their host. */
export interface HelixBulkPublishDeps {
    logger: Logger;
    /** The two credentials a bulk POST carries, plus the job-status identity. */
    auth: Pick<HelixAdminAuth, 'getGitHubToken' | 'getDaLiveToken' | 'jobStatusHeaders'>;
}

/**
 * Bulk-previews and bulk-publishes a list of paths through the Admin API.
 */
export class HelixBulkPublish {
    constructor(private deps: HelixBulkPublishDeps) {}

    private get logger(): Logger {
        return this.deps.logger;
    }

    private getGitHubToken(): Promise<string> {
        return this.deps.auth.getGitHubToken();
    }

    private getDaLiveToken(): Promise<string> {
        return this.deps.auth.getDaLiveToken();
    }

    private throwCredentialRefused(response: Response, what: string): Promise<never> {
        return throwCredentialRefused(response, what);
    }

    private bulkJobDeps(): BulkJobDeps {
        return {
            logger: this.logger,
            getJobStatusHeaders: () => this.deps.auth.jobStatusHeaders(),
        };
    }

    /**
     * Preview all content (bulk operation)
     * Uses the bulk API endpoint to sync all content from DA.live to preview CDN.
     * Polls for job completion before returning.
     *
     * @param org - Organization/owner name
     * @param site - Site/repository name
     * @param branch - Branch name (default: main)
     * @param onProgress - Optional callback for progress updates (processed, total)
     * @param paths - Optional explicit list of paths to preview
     */
    async previewAllContent(
        org: string,
        site: string,
        branch: string = DEFAULT_BRANCH,
        onProgress?: BulkProgressCallback,
        paths?: string[],
    ): Promise<void> {
        const githubToken = await this.getGitHubToken();
        const imsToken = await this.getDaLiveToken();
        // Bulk API: POST to /preview/{org}/{site}/{ref}/*
        // The /* in the URL triggers bulk/async processing (returns 202)
        // The paths array in the body specifies what to process
        const url = buildPartitionUrl('preview', org, site, branch, '/*');

        // Use explicit paths if provided, otherwise default to root
        const pathsToProcess = getPathsOrDefault(paths);

        this.logger.debug(
            `[Helix] Previewing all content (bulk): ${url} - ${pathsToProcess.length} paths`,
        );

        // Bulk API requires JSON body with paths array
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                // Authorization FIRST: once the site has any `access.admin` role the
                // admin API closes to callers without an accepted admin identity,
                // and the GitHub token is not one. See ADMIN_API_401_MESSAGE.
                Authorization: `Bearer ${imsToken}`,
                'x-auth-token': githubToken,
                'x-content-source-authorization': `Bearer ${imsToken}`, // Required for DA.live content source
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                paths: pathsToProcess,
                forceUpdate: true,
            }),
            signal: AbortSignal.timeout(TIMEOUTS.VERY_LONG),
        });

        if (response.status === 401) {
            throw new Error(ADMIN_API_401_MESSAGE);
        }

        if (response.status === 403) {
            await this.throwCredentialRefused(response, 'preview this content');
        }

        // 400 = Bad request - log details for debugging
        if (response.status === 400) {
            let errorBody: string | undefined;
            try {
                errorBody = await response.text();
            } catch {
                // Ignore parse errors
            }
            this.logger.error(
                `[Helix] Bulk preview returned 400 Bad Request. Response: ${errorBody || 'empty'}`,
            );
            throw new Error(
                `Failed to preview all content: 400 Bad Request - ${errorBody || 'Invalid request'}`,
            );
        }

        // 202 = Bulk preview scheduled (async job created)
        if (response.status === 202) {
            this.logger.debug('[Helix] Bulk preview job created, polling for completion');

            const { jobName, jobTopic } = await parseBulkJobResponse(
                response,
                'preview',
                this.logger,
            );

            if (jobName) {
                await pollJobCompletion(
                    this.bulkJobDeps(),
                    { org, site, branch, jobName, topic: jobTopic },
                    onProgress,
                );
            } else {
                // No job info, wait a reasonable time for the operation
                this.logger.warn('[Helix] No job info in response, assuming operation completed');
            }
            return;
        }

        if (response.ok) {
            // 200 OK = synchronous success (small path count processed immediately)
            // The Admin API returns 200 for small batches and 202 for large ones
            this.logger.debug('[Helix] Bulk preview completed synchronously (200)');
            return;
        }

        throw new Error(`Failed to preview all content: ${response.status} ${response.statusText}`);
    }

    /**
     * Publish all content to live (bulk operation)
     * Uses the bulk API endpoint to sync all content from preview to live CDN.
     * Polls for job completion before returning.
     *
     * The bulk API requires:
     * - Content-Type: application/json header
     * - JSON body with paths array (e.g., ["/*"] for recursive)
     * - Optional forceUpdate flag
     *
     * @param org - Organization/owner name
     * @param site - Site/repository name
     * @param branch - Branch name (default: main)
     * @param onProgress - Optional callback for progress updates (processed, total)
     * @param paths - Optional explicit list of paths to publish (if not provided, uses "/" which only processes root)
     * @see https://www.aem.live/docs/admin.html
     */
    async publishAllContent(
        org: string,
        site: string,
        branch: string = DEFAULT_BRANCH,
        onProgress?: BulkProgressCallback,
        paths?: string[],
    ): Promise<void> {
        const githubToken = await this.getGitHubToken();
        const imsToken = await this.getDaLiveToken();
        // Bulk API: POST to /live/{org}/{site}/{ref}/*
        // The /* in the URL triggers bulk/async processing (returns 202)
        // The paths array in the body specifies what to process
        const url = buildPartitionUrl('live', org, site, branch, '/*');

        // Use explicit paths if provided, otherwise default to root
        const pathsToProcess = getPathsOrDefault(paths);

        this.logger.debug(
            `[Helix] Publishing all content (bulk): ${url} - ${pathsToProcess.length} paths`,
        );

        // Bulk API requires JSON body with paths array
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                // Authorization FIRST: once the site has any `access.admin` role the
                // admin API closes to callers without an accepted admin identity,
                // and the GitHub token is not one. See ADMIN_API_401_MESSAGE.
                Authorization: `Bearer ${imsToken}`,
                'x-auth-token': githubToken,
                'x-content-source-authorization': `Bearer ${imsToken}`, // Required for DA.live content source
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                paths: pathsToProcess,
                forceUpdate: true,
            }),
            signal: AbortSignal.timeout(TIMEOUTS.VERY_LONG),
        });

        if (response.status === 401) {
            throw new Error(ADMIN_API_401_MESSAGE);
        }

        if (response.status === 403) {
            throw new Error('Access denied. You do not have permission to publish this content.');
        }

        // 400 = Bad request - log details for debugging
        if (response.status === 400) {
            let errorBody: string | undefined;
            try {
                errorBody = await response.text();
            } catch {
                // Ignore parse errors
            }
            this.logger.error(
                `[Helix] Bulk publish returned 400 Bad Request. Response: ${errorBody || 'empty'}`,
            );
            throw new Error(
                `Failed to publish all content: 400 Bad Request - ${errorBody || 'Invalid request'}`,
            );
        }

        // 202 = Bulk publish scheduled (async job created)
        if (response.status === 202) {
            this.logger.debug('[Helix] Bulk publish job created, polling for completion');

            const { jobName, jobTopic } = await parseBulkJobResponse(response, 'live', this.logger);

            if (jobName) {
                await pollJobCompletion(
                    this.bulkJobDeps(),
                    { org, site, branch, jobName, topic: jobTopic },
                    onProgress,
                );
            } else {
                // No job info, assume operation completed
                this.logger.warn('[Helix] No job info in response, assuming operation completed');
            }
            return;
        }

        if (response.ok) {
            // 200 OK = synchronous success (small path count processed immediately)
            // The Admin API returns 200 for small batches and 202 for large ones
            this.logger.debug('[Helix] Bulk publish completed synchronously (200)');
            return;
        }

        throw new Error(`Failed to publish all content: ${response.status} ${response.statusText}`);
    }
}
