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

/** How one bulk POST names itself in logs and errors, per partition. */
const BULK_OPS = {
    preview: { doing: 'Previewing', verb: 'preview' },
    live: { doing: 'Publishing', verb: 'publish' },
} as const;

/** What one bulk POST is asked to do. */
interface BulkRequest {
    org: string;
    site: string;
    branch: string;
    onProgress?: BulkProgressCallback;
    paths?: string[];
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
    previewAllContent(
        org: string,
        site: string,
        branch: string = DEFAULT_BRANCH,
        onProgress?: BulkProgressCallback,
        paths?: string[],
    ): Promise<void> {
        return this.bulkPost('preview', { org, site, branch, onProgress, paths });
    }

    /**
     * Publish all content to live (bulk operation)
     * Uses the bulk API endpoint to sync all content from preview to live CDN.
     * Polls for job completion before returning.
     *
     * @param org - Organization/owner name
     * @param site - Site/repository name
     * @param branch - Branch name (default: main)
     * @param onProgress - Optional callback for progress updates (processed, total)
     * @param paths - Optional explicit list of paths to publish (if not provided, uses "/" which only processes root)
     * @see https://www.aem.live/docs/admin.html
     */
    publishAllContent(
        org: string,
        site: string,
        branch: string = DEFAULT_BRANCH,
        onProgress?: BulkProgressCallback,
        paths?: string[],
    ): Promise<void> {
        return this.bulkPost('live', { org, site, branch, onProgress, paths });
    }

    /**
     * One bulk POST to a partition, then poll its job. Preview and publish were
     * two copies of this that differed only in the partition and the words —
     * and, until 2026-10-09, in what a 403 meant: preview re-prompted for an
     * expired session and publish blamed the user's role. Both now raise the
     * refused-credential error (see `throwCredentialRefused`).
     *
     * The bulk API requires a `Content-Type: application/json` header and a JSON
     * body with a paths array; the `/*` in the URL triggers bulk/async processing
     * (202), while small batches answer 200 synchronously.
     */
    private async bulkPost(partition: keyof typeof BULK_OPS, request: BulkRequest): Promise<void> {
        const { org, site, branch, onProgress, paths } = request;
        const op = BULK_OPS[partition];
        const githubToken = await this.getGitHubToken();
        const imsToken = await this.getDaLiveToken();
        const url = buildPartitionUrl(partition, org, site, branch, '/*');

        // Use explicit paths if provided, otherwise default to root
        const pathsToProcess = getPathsOrDefault(paths);

        this.logger.debug(
            `[Helix] ${op.doing} all content (bulk): ${url} - ${pathsToProcess.length} paths`,
        );

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
            await throwCredentialRefused(response, `${op.verb} this content`);
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
                `[Helix] Bulk ${op.verb} returned 400 Bad Request. Response: ${errorBody || 'empty'}`,
            );
            throw new Error(
                `Failed to ${op.verb} all content: 400 Bad Request - ${errorBody || 'Invalid request'}`,
            );
        }

        // 202 = Bulk job scheduled (async job created)
        if (response.status === 202) {
            this.logger.debug(`[Helix] Bulk ${op.verb} job created, polling for completion`);

            const { jobName, jobTopic } = await parseBulkJobResponse(
                response,
                partition,
                this.logger,
            );

            if (jobName) {
                await pollJobCompletion(
                    this.bulkJobDeps(),
                    { org, site, branch, jobName, topic: jobTopic },
                    onProgress,
                );
            } else {
                this.logger.warn('[Helix] No job info in response, assuming operation completed');
            }
            return;
        }

        if (response.ok) {
            // 200 OK = synchronous success (small path count processed immediately)
            this.logger.debug(`[Helix] Bulk ${op.verb} completed synchronously (200)`);
            return;
        }

        throw new Error(
            `Failed to ${op.verb} all content: ${response.status} ${response.statusText}`,
        );
    }
}
