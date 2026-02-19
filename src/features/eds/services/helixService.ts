/**
 * Helix Service
 *
 * Handles Helix Admin API operations for EDS (Edge Delivery Services)
 * including preview/publish and unpublish operations.
 *
 * Features:
 * - DA.live token integration via DaLiveTokenProvider
 * - Preview content (POST /preview/{org}/{site}/main/{path})
 * - Publish content (POST /live/{org}/{site}/main/{path})
 * - 404 handling as success (site never published)
 * - Repo fullName parsing for org/site extraction
 */

import { getLogger } from '@/core/logging';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types/logger';
import { DaLiveContentOperations } from './daLiveContentOperations';
import type { GitHubTokenService } from './githubTokenService';

// ==========================================================
// Constants
// ==========================================================

/** Helix Admin API base URL */
const HELIX_ADMIN_URL = 'https://admin.hlx.page';

/** Default branch for Helix operations */
const DEFAULT_BRANCH = 'main';

/**
 * Response from bulk preview/publish operations (202 Accepted)
 * @see https://www.aem.live/docs/admin.html
 */
interface BulkJobResponse {
    /** Job information for async operations */
    job?: {
        /** Job name for status tracking */
        name: string;
        /** Topic (preview or live) */
        topic: string;
        /** Current job state */
        state: 'created' | 'running' | 'stopped';
    };
    /** Message ID for the bulk operation */
    messageId?: string;
}

/**
 * Response from job status endpoint
 */
interface JobStatusResponse {
    /** Current job state */
    state: 'created' | 'running' | 'stopped';
    /** Progress information */
    progress?: {
        /** Number of items processed */
        processed: number;
        /** Total number of items */
        total: number;
    };
    /** Error information if job failed */
    error?: string;
    /** Result data when job completes */
    data?: {
        resources?: Array<{
            path: string;
            status: number;
        }>;
    };
}

/** Progress callback for bulk operations */
type BulkProgressCallback = (processed: number, total: number) => void;

/**
 * Token provider interface for DA.live authentication
 */
export interface DaLiveTokenProvider {
    getAccessToken: () => Promise<string | null>;
}

/**
 * Helix Service for admin operations
 */
export class HelixService {
    private logger: Logger;
    private githubTokenService?: GitHubTokenService;
    private daLiveOps: DaLiveContentOperations;
    private daLiveTokenProvider?: DaLiveTokenProvider;

    /**
     * Create a HelixService
     * @param logger - Optional logger for dependency injection (defaults to getLogger())
     * @param githubTokenService - Optional GitHub token service for Helix Admin API authentication
     * @param daLiveTokenProvider - DA.live token provider for content source authorization.
     *        REQUIRED for operations that use x-content-source-authorization header.
     *        IMPORTANT: This MUST be a DA.live IMS token, NOT the Adobe Console IMS token.
     *        These are separate authentication systems. Using the wrong token causes
     *        silent failures where images become `about:error`.
     */
    constructor(
        logger?: Logger,
        githubTokenService?: GitHubTokenService,
        daLiveTokenProvider?: DaLiveTokenProvider,
    ) {
        this.logger = logger ?? getLogger();
        this.githubTokenService = githubTokenService;
        this.daLiveTokenProvider = daLiveTokenProvider;

        // DaLiveContentOperations needs DA.live token - will throw if not provided when used
        if (daLiveTokenProvider) {
            this.daLiveOps = new DaLiveContentOperations(daLiveTokenProvider, this.logger);
        } else {
            // Create a placeholder that will throw clear error if used without token provider
            this.daLiveOps = new DaLiveContentOperations(
                {
                    getAccessToken: async () => {
                        throw new Error(
                            'DA.live token provider not configured. ' +
                            'HelixService requires a DA.live token provider for content operations.',
                        );
                    },
                },
                this.logger,
            );
        }
    }

    // ==========================================================
    // Token Management
    // ==========================================================

    /**
     * Get DA.live IMS token for content source authorization
     *
     * IMPORTANT: DA.live uses a SEPARATE IMS authentication from Adobe Console.
     * The x-content-source-authorization header MUST use the DA.live IMS token,
     * NOT the Adobe Console IMS token - they are different authentication systems.
     *
     * Using the wrong token (Adobe IMS instead of DA.live IMS) causes the Admin API
     * to fail silently when downloading images, resulting in `about:error` in img src.
     *
     * @throws Error if DA.live token provider not configured or token expired
     */
    private async getDaLiveToken(): Promise<string> {
        if (!this.daLiveTokenProvider) {
            throw new Error(
                'DA.live token provider not configured. ' +
                'HelixService requires a DA.live token provider for content source operations.',
            );
        }

        const token = await this.daLiveTokenProvider.getAccessToken();
        if (!token) {
            throw new Error('DA.live session expired. Please sign in to DA.live.');
        }
        return token;
    }

    /**
     * Get GitHub token for Helix Admin API authentication
     * The Helix Admin API uses GitHub-based auth to verify repo write access.
     * @throws Error if GitHub token not available
     */
    private async getGitHubToken(): Promise<string> {
        if (!this.githubTokenService) {
            throw new Error('GitHub authentication required for Helix Admin API. Please log in to GitHub.');
        }

        const tokenData = await this.githubTokenService.getToken();
        if (!tokenData) {
            throw new Error('GitHub token not found. Please log in to GitHub.');
        }

        return tokenData.token;
    }

    // ==========================================================
    // Bulk Job Polling
    // ==========================================================

    /** Maximum time to wait for a bulk job to complete (5 minutes) */
    private static readonly JOB_TIMEOUT_MS = 5 * 60 * 1000;

    /** Polling interval for job status checks (2 seconds) */
    private static readonly JOB_POLL_INTERVAL_MS = 2000;

    /**
     * Poll for bulk job completion
     *
     * Bulk operations (preview/publish) return 202 with job info.
     * This method polls the job status endpoint until the job completes.
     *
     * @param org - Organization/owner name
     * @param site - Site/repository name
     * @param branch - Branch name
     * @param jobName - Job name from 202 response
     * @param topic - Job topic (preview, live, preview-remove, live-remove)
     * @param onProgress - Optional callback for progress updates
     * @param apiKey - Optional Admin API Key (used for unpublish jobs created with API key auth)
     * @throws Error if job fails or times out
     */
    private async pollJobCompletion(
        org: string,
        site: string,
        branch: string,
        jobName: string,
        topic: string,
        onProgress?: BulkProgressCallback,
        apiKey?: string,
    ): Promise<void> {
        // Use API key auth when provided (unpublish jobs), otherwise GitHub token
        const authHeaders: Record<string, string> = apiKey
            ? { 'Authorization': `token ${apiKey}` }
            : { 'x-auth-token': await this.getGitHubToken() };
        // Job status URL format: GET /job/{org}/{site}/{ref}/{topic}/{jobId}
        const url = `${HELIX_ADMIN_URL}/job/${org}/${site}/${branch}/${topic}/${jobName}`;
        const startTime = Date.now();

        this.logger.debug(`[Helix] Polling job status: ${url}`);

        while (true) {
            // Check timeout
            if (Date.now() - startTime > HelixService.JOB_TIMEOUT_MS) {
                throw new Error(`Bulk ${topic} job timed out after ${HelixService.JOB_TIMEOUT_MS / 1000} seconds`);
            }

            try {
                const response = await fetch(url, {
                    method: 'GET',
                    headers: authHeaders,
                    signal: AbortSignal.timeout(TIMEOUTS.QUICK),
                });

                if (!response.ok) {
                    // Job endpoint may not exist immediately, retry
                    if (response.status === 404) {
                        this.logger.debug(`[Helix] Job not found yet, retrying...`);
                        await new Promise(resolve => setTimeout(resolve, HelixService.JOB_POLL_INTERVAL_MS));
                        continue;
                    }
                    throw new Error(`Job status check failed: ${response.status} ${response.statusText}`);
                }

                const status: JobStatusResponse = await response.json();


                // Report progress if available
                if (status.progress && onProgress) {
                    onProgress(status.progress.processed, status.progress.total);
                }

                // Check job state - handle both 'stopped' and 'finished' states
                if (status.state === 'stopped' || (status as any).state === 'finished' || (status as any).status === 'finished') {
                    // Job completed
                    if (status.error || (status as any).error) {
                        throw new Error(`Bulk ${topic} job failed: ${status.error || (status as any).error}`);
                    }
                    this.logger.debug(`[Helix] Bulk ${topic} job completed successfully`);
                    return;
                }

                // Job still running, wait and poll again
                this.logger.debug(`[Helix] Job state: ${status.state || (status as any).status}, progress: ${status.progress?.processed ?? (status as any).processed ?? '?'}/${status.progress?.total ?? (status as any).total ?? '?'}`);
                await new Promise(resolve => setTimeout(resolve, HelixService.JOB_POLL_INTERVAL_MS));
            } catch (error) {
                const errorMessage = (error as Error).message;
                // Timeout errors should be retried
                if (errorMessage.includes('timed out') || errorMessage.includes('timeout')) {
                    this.logger.debug(`[Helix] Job status request timed out, retrying...`);
                    await new Promise(resolve => setTimeout(resolve, HelixService.JOB_POLL_INTERVAL_MS));
                    continue;
                }
                throw error;
            }
        }
    }

    // ==========================================================
    // Preview/Publish Operations
    // ==========================================================

    /**
     * Preview a page (sync content from DA.live to preview CDN)
     *
     * This triggers the Helix Admin to fetch content from DA.live
     * and make it available at the .aem.page preview URL.
     *
     * @param org - Organization/owner name
     * @param site - Site/repository name
     * @param path - Content path (e.g., '/' for homepage, '/products')
     * @param branch - Branch name (default: main)
     * @throws Error on access denied (403) or network error
     */
    async previewPage(
        org: string,
        site: string,
        path: string = '/',
        branch: string = DEFAULT_BRANCH,
    ): Promise<void> {
        const githubToken = await this.getGitHubToken();
        const imsToken = await this.getDaLiveToken();
        // Normalize path - ensure it starts with / and doesn't end with /
        const normalizedPath = path.startsWith('/') ? path : `/${path}`;
        const cleanPath = normalizedPath.endsWith('/') && normalizedPath !== '/'
            ? normalizedPath.slice(0, -1)
            : normalizedPath;
        const url = `${HELIX_ADMIN_URL}/preview/${org}/${site}/${branch}${cleanPath}`;

        this.logger.debug(`[Helix] Previewing page: ${url}`);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'x-auth-token': githubToken,
                'x-content-source-authorization': `Bearer ${imsToken}`, // Required for DA.live content source
            },
            signal: AbortSignal.timeout(TIMEOUTS.LONG),
        });

        if (response.status === 401) {
            throw new Error('GitHub authentication failed. Please ensure you have write access to the repository.');
        }

        if (response.status === 403) {
            throw new Error('Access denied. You do not have permission to preview this content.');
        }

        if (!response.ok) {
            throw new Error(`Failed to preview page: ${response.status} ${response.statusText}`);
        }

        this.logger.debug(`[Helix] Successfully previewed: ${cleanPath}`);
    }

    /**
     * Publish a page to live (sync from preview to live CDN)
     *
     * This triggers the Helix Admin to copy content from preview
     * to the .aem.live production URL.
     *
     * @param org - Organization/owner name
     * @param site - Site/repository name
     * @param path - Content path (e.g., '/' for homepage, '/products')
     * @param branch - Branch name (default: main)
     * @throws Error on access denied (403) or network error
     */
    async publishPage(
        org: string,
        site: string,
        path: string = '/',
        branch: string = DEFAULT_BRANCH,
    ): Promise<void> {
        const githubToken = await this.getGitHubToken();
        const imsToken = await this.getDaLiveToken();
        // Normalize path
        const normalizedPath = path.startsWith('/') ? path : `/${path}`;
        const cleanPath = normalizedPath.endsWith('/') && normalizedPath !== '/'
            ? normalizedPath.slice(0, -1)
            : normalizedPath;
        const url = `${HELIX_ADMIN_URL}/live/${org}/${site}/${branch}${cleanPath}`;

        this.logger.debug(`[Helix] Publishing page: ${url}`);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'x-auth-token': githubToken,
                'x-content-source-authorization': `Bearer ${imsToken}`, // Required for DA.live content source
            },
            signal: AbortSignal.timeout(TIMEOUTS.LONG),
        });

        if (response.status === 401) {
            throw new Error('GitHub authentication failed. Please ensure you have write access to the repository.');
        }

        if (response.status === 403) {
            throw new Error('Access denied. You do not have permission to publish this content.');
        }

        if (!response.ok) {
            throw new Error(`Failed to publish page: ${response.status} ${response.statusText}`);
        }

        this.logger.debug(`[Helix] Successfully published: ${cleanPath}`);
    }

    /**
     * Delete a preview resource from the preview content bus.
     *
     * Create an Admin API Key with publish role for a site.
     *
     * Uses the DA.live IMS token with `Authorization: Bearer` to authenticate
     * against the Config Service API. The resulting key can be used for
     * DELETE operations (unpublish) that require higher privileges than
     * the GitHub OAuth token provides.
     *
     * @param org - Organization/owner name
     * @param site - Site/repository name
     * @returns The API key value, or null if creation failed
     */
    async createAdminApiKey(
        org: string,
        site: string,
    ): Promise<string | null> {
        const imsToken = await this.getDaLiveToken();
        const url = `${HELIX_ADMIN_URL}/config/${org}/sites/${site}/apiKeys.json`;

        this.logger.debug(`[Helix] Creating Admin API Key for ${org}/${site}`);

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${imsToken}`,
                    'content-type': 'application/json',
                },
                body: JSON.stringify({
                    description: 'Demo Builder publish key',
                    roles: ['publish'],
                }),
                signal: AbortSignal.timeout(TIMEOUTS.LONG),
            });

            if (!response.ok) {
                this.logger.warn(`[Helix] Admin API Key creation failed: ${response.status}`);
                return null;
            }

            const data = await response.json();
            const keyValue = data.value as string | undefined;

            if (keyValue) {
                this.logger.info(`[Helix] Admin API Key created (id=${data.id}, expires=${data.expiration})`);
            }

            return keyValue || null;
        } catch (error) {
            this.logger.warn(`[Helix] Admin API Key creation error: ${(error as Error).message}`);
            return null;
        }
    }

    /**
     * Delete preview for a resource.
     *
     * Sends DELETE /preview/{org}/{site}/{ref}/{path} to remove the page
     * from the preview CDN partition.
     *
     * @param org - Organization/owner name
     * @param site - Site/repository name
     * @param path - Content path (e.g., '/' for homepage, '/products')
     * @param branch - Branch name (default: main)
     * @param apiKey - Optional Admin API Key for DELETE auth (preferred over GitHub token)
     * @returns true if deleted (204) or not found (404), false if auth failed
     * @throws Error on non-auth failures (5xx, network)
     */
    async deletePreview(
        org: string,
        site: string,
        path: string = '/',
        branch: string = DEFAULT_BRANCH,
        apiKey?: string,
    ): Promise<boolean> {
        const normalizedPath = path.startsWith('/') ? path : `/${path}`;
        const cleanPath = normalizedPath.endsWith('/') && normalizedPath !== '/'
            ? normalizedPath.slice(0, -1)
            : normalizedPath;
        const url = `${HELIX_ADMIN_URL}/preview/${org}/${site}/${branch}${cleanPath}`;

        this.logger.debug(`[Helix] Deleting preview: ${url}`);

        // Use Admin API Key if available, otherwise fall back to GitHub + IMS tokens
        const headers: Record<string, string> = apiKey
            ? { 'Authorization': `token ${apiKey}` }
            : {
                'x-auth-token': await this.getGitHubToken(),
                'x-content-source-authorization': `Bearer ${await this.getDaLiveToken()}`,
            };

        const response = await fetch(url, {
            method: 'DELETE',
            headers,
            signal: AbortSignal.timeout(TIMEOUTS.LONG),
        });

        if (response.status === 401 || response.status === 403) {
            this.logger.debug(`[Helix] Delete preview auth failed: ${response.status}`);
            return false;
        }

        if (response.status === 204 || response.status === 404) {
            this.logger.debug(`[Helix] Preview deleted: ${cleanPath}`);
            return true;
        }

        if (!response.ok) {
            throw new Error(`Failed to delete preview: ${response.status} ${response.statusText}`);
        }

        return true;
    }

    /**
     * Unpublish a resource from the live content bus.
     *
     * Sends DELETE /live/{org}/{site}/{ref}/{path} to remove the page
     * from the live CDN partition and purge associated caches.
     *
     * @param org - Organization/owner name
     * @param site - Site/repository name
     * @param path - Content path (e.g., '/' for homepage, '/products')
     * @param branch - Branch name (default: main)
     * @param apiKey - Optional Admin API Key for DELETE auth (preferred over GitHub token)
     * @returns true if unpublished (204) or not found (404), false if auth failed
     * @throws Error on non-auth failures (5xx, network)
     */
    async unpublishPage(
        org: string,
        site: string,
        path: string = '/',
        branch: string = DEFAULT_BRANCH,
        apiKey?: string,
    ): Promise<boolean> {
        const normalizedPath = path.startsWith('/') ? path : `/${path}`;
        const cleanPath = normalizedPath.endsWith('/') && normalizedPath !== '/'
            ? normalizedPath.slice(0, -1)
            : normalizedPath;
        const url = `${HELIX_ADMIN_URL}/live/${org}/${site}/${branch}${cleanPath}`;

        this.logger.debug(`[Helix] Unpublishing: ${url}`);

        const headers: Record<string, string> = apiKey
            ? { 'Authorization': `token ${apiKey}` }
            : {
                'x-auth-token': await this.getGitHubToken(),
                'x-content-source-authorization': `Bearer ${await this.getDaLiveToken()}`,
            };

        const response = await fetch(url, {
            method: 'DELETE',
            headers,
            signal: AbortSignal.timeout(TIMEOUTS.LONG),
        });

        if (response.status === 401 || response.status === 403) {
            this.logger.debug(`[Helix] Unpublish auth failed: ${response.status}`);
            return false;
        }

        if (response.status === 204 || response.status === 404) {
            this.logger.debug(`[Helix] Unpublished: ${cleanPath}`);
            return true;
        }

        if (!response.ok) {
            throw new Error(`Failed to unpublish: ${response.status} ${response.statusText}`);
        }

        return true;
    }

    /**
     * Bulk unpublish pages from the live CDN.
     *
     * Sends POST /live/{org}/{site}/{ref}/* with { paths, delete: true }
     * to remove multiple pages from the live content bus in one operation.
     * Returns 202 with an async job (topic: "live-remove") that is polled
     * to completion.
     *
     * @param org - Organization/owner name
     * @param site - Site/repository name
     * @param branch - Branch name
     * @param paths - Web paths to unpublish (e.g., ['/about', '/products'])
     * @param apiKey - Admin API Key for authentication
     */
    async bulkUnpublish(
        org: string,
        site: string,
        branch: string,
        paths: string[],
        apiKey: string,
    ): Promise<void> {
        const url = `${HELIX_ADMIN_URL}/live/${org}/${site}/${branch}/*`;

        this.logger.debug(`[Helix] Bulk unpublish: ${paths.length} pages`);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `token ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ paths, delete: true }),
            signal: AbortSignal.timeout(TIMEOUTS.VERY_LONG),
        });

        if (response.status === 202) {
            let jobInfo: BulkJobResponse | undefined;
            try {
                jobInfo = await response.json();
            } catch {
                this.logger.warn('[Helix] Could not parse job info from bulk unpublish response');
            }

            const jobName = jobInfo?.job?.name || (jobInfo as any)?.name;
            const jobTopic = jobInfo?.job?.topic || (jobInfo as any)?.topic || 'live-remove';

            if (jobName) {
                await this.pollJobCompletion(org, site, branch, jobName, jobTopic, undefined, apiKey);
            }
            return;
        }

        if (response.ok) {
            return;
        }

        throw new Error(`Bulk unpublish failed: ${response.status} ${response.statusText}`);
    }

    /**
     * Bulk delete preview for pages.
     *
     * Sends POST /preview/{org}/{site}/{ref}/* with { paths, delete: true }
     * to remove multiple pages from the preview content bus in one operation.
     * Returns 202 with an async job (topic: "preview-remove") that is polled
     * to completion.
     *
     * @param org - Organization/owner name
     * @param site - Site/repository name
     * @param branch - Branch name
     * @param paths - Web paths to unpreview (e.g., ['/about', '/products'])
     * @param apiKey - Admin API Key for authentication
     */
    async bulkDeletePreview(
        org: string,
        site: string,
        branch: string,
        paths: string[],
        apiKey: string,
    ): Promise<void> {
        const url = `${HELIX_ADMIN_URL}/preview/${org}/${site}/${branch}/*`;

        this.logger.debug(`[Helix] Bulk delete preview: ${paths.length} pages`);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `token ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ paths, delete: true }),
            signal: AbortSignal.timeout(TIMEOUTS.VERY_LONG),
        });

        if (response.status === 202) {
            let jobInfo: BulkJobResponse | undefined;
            try {
                jobInfo = await response.json();
            } catch {
                this.logger.warn('[Helix] Could not parse job info from bulk delete preview response');
            }

            const jobName = jobInfo?.job?.name || (jobInfo as any)?.name;
            const jobTopic = jobInfo?.job?.topic || (jobInfo as any)?.topic || 'preview-remove';

            if (jobName) {
                await this.pollJobCompletion(org, site, branch, jobName, jobTopic, undefined, apiKey);
            }
            return;
        }

        if (response.ok) {
            return;
        }

        throw new Error(`Bulk delete preview failed: ${response.status} ${response.statusText}`);
    }

    /**
     * Preview and publish a page in one operation
     * First previews to sync from DA.live, then publishes to live CDN
     *
     * @param org - Organization/owner name
     * @param site - Site/repository name
     * @param path - Content path (default: '/' for homepage)
     * @param branch - Branch name (default: main)
     */
    async previewAndPublishPage(
        org: string,
        site: string,
        path: string = '/',
        branch: string = DEFAULT_BRANCH,
    ): Promise<void> {
        await this.previewPage(org, site, path, branch);
        await this.publishPage(org, site, path, branch);
    }

    /**
     * Preview all content (bulk operation)
     * Uses the bulk API endpoint to sync all content from DA.live to preview CDN.
     * Polls for job completion before returning.
     *
     * The bulk API requires:
     * - Content-Type: application/json header
     * - JSON body with paths array
     * - Optional forceUpdate flag
     *
     * @param org - Organization/owner name
     * @param site - Site/repository name
     * @param branch - Branch name (default: main)
     * @param onProgress - Optional callback for progress updates (processed, total)
     * @param paths - Optional explicit list of paths to preview (if not provided, uses "/" which only processes root)
     * @see https://www.aem.live/docs/admin.html
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
        const url = `${HELIX_ADMIN_URL}/preview/${org}/${site}/${branch}/*`;

        // Use explicit paths if provided, otherwise default to root
        const pathsToProcess = paths && paths.length > 0 ? paths : ['/'];

        this.logger.debug(`[Helix] Previewing all content (bulk): ${url} - ${pathsToProcess.length} paths`);

        // Bulk API requires JSON body with paths array
        const response = await fetch(url, {
            method: 'POST',
            headers: {
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
            throw new Error('GitHub authentication failed. Please ensure you have write access to the repository.');
        }

        if (response.status === 403) {
            throw new Error('Access denied. You do not have permission to preview this content.');
        }

        // 400 = Bad request - log details for debugging
        if (response.status === 400) {
            let errorBody: string | undefined;
            try {
                errorBody = await response.text();
            } catch {
                // Ignore parse errors
            }
            this.logger.error(`[Helix] Bulk preview returned 400 Bad Request. Response: ${errorBody || 'empty'}`);
            throw new Error(`Failed to preview all content: 400 Bad Request - ${errorBody || 'Invalid request'}`);
        }

        // 202 = Bulk preview scheduled (async job created)
        if (response.status === 202) {
            this.logger.debug('[Helix] Bulk preview job created, polling for completion...');

            // Parse job info from response
            let jobInfo: BulkJobResponse | undefined;
            try {
                jobInfo = await response.json();
            } catch {
                this.logger.warn('[Helix] Could not parse job info from 202 response');
            }

            // If we have job info, poll for completion
            // Handle both nested (job.name) and top-level (name) response formats
            const jobName = jobInfo?.job?.name || (jobInfo as any)?.name;
            const jobTopic = jobInfo?.job?.topic || (jobInfo as any)?.topic || 'preview';

            if (jobName) {
                await this.pollJobCompletion(
                    org,
                    site,
                    branch,
                    jobName,
                    jobTopic,
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
        const url = `${HELIX_ADMIN_URL}/live/${org}/${site}/${branch}/*`;

        // Use explicit paths if provided, otherwise default to root
        const pathsToProcess = paths && paths.length > 0 ? paths : ['/'];

        this.logger.debug(`[Helix] Publishing all content (bulk): ${url} - ${pathsToProcess.length} paths`);

        // Bulk API requires JSON body with paths array
        const response = await fetch(url, {
            method: 'POST',
            headers: {
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
            throw new Error('GitHub authentication failed. Please ensure you have write access to the repository.');
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
            this.logger.error(`[Helix] Bulk publish returned 400 Bad Request. Response: ${errorBody || 'empty'}`);
            throw new Error(`Failed to publish all content: 400 Bad Request - ${errorBody || 'Invalid request'}`);
        }

        // 202 = Bulk publish scheduled (async job created)
        if (response.status === 202) {
            this.logger.debug('[Helix] Bulk publish job created, polling for completion...');

            // Parse job info from response
            let jobInfo: BulkJobResponse | undefined;
            try {
                jobInfo = await response.json();
            } catch {
                this.logger.warn('[Helix] Could not parse job info from 202 response');
            }

            // If we have job info, poll for completion
            // Handle both nested (job.name) and top-level (name) response formats
            const jobName = jobInfo?.job?.name || (jobInfo as any)?.name;
            const jobTopic = jobInfo?.job?.topic || (jobInfo as any)?.topic || 'live';

            if (jobName) {
                await this.pollJobCompletion(
                    org,
                    site,
                    branch,
                    jobName,
                    jobTopic,
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

    /**
     * File names to exclude from publishing (non-content files)
     */
    private static readonly EXCLUDED_NAMES = [
        'metadata', // metadata.json
        'redirects', // redirects.json
        'placeholders', // placeholders.json
        'query-index', // query-index.json
        'test-index', // test files
    ];

    /**
     * Folder names to exclude from publishing
     */
    private static readonly EXCLUDED_FOLDERS = [
        '.helix',
        '.milo',
        'placeholders',
        'experiments', // A/B test config
        'enrichment', // PDP enrichment data
    ];

    /**
     * Recursively list all publishable pages from DA.live
     *
     * DA.live API response structure:
     * - Files have: { name, path, ext, lastModified }
     * - Folders have: { name, path } (no ext field)
     *
     * @param org - Organization name (DA.live org)
     * @param site - Site name in DA.live
     * @param path - Starting path (default: root)
     * @returns Array of web paths to publish
     */
    private async listAllPages(org: string, site: string, path: string = '/'): Promise<string[]> {
        const pages: string[] = [];
        // DA.live paths include org/site prefix, need to strip it for recursion
        const pathPrefix = `/${org}/${site}`;

        try {
            const entries = await this.daLiveOps.listDirectory(org, site, path);

            for (const entry of entries) {
                // Determine if it's a folder (no ext field) or file (has ext field)
                const isFolder = !entry.ext;

                if (isFolder) {
                    // Skip excluded folders
                    if (HelixService.EXCLUDED_FOLDERS.includes(entry.name)) {
                        continue;
                    }

                    // Recursively list subdirectory
                    // The path in the response is like /org/site/folder, need to strip prefix for recursion
                    const relativePath = entry.path.replace(pathPrefix, '') || '/';
                    const subPages = await this.listAllPages(org, site, relativePath);
                    pages.push(...subPages);
                } else {
                    // It's a file - check if it's publishable HTML content
                    if (entry.ext !== 'html') {
                        continue;
                    }

                    // Skip excluded names
                    if (HelixService.EXCLUDED_NAMES.includes(entry.name)) {
                        continue;
                    }

                    // Convert DA.live path to web path
                    // entry.path is like /org/site/accessories.html
                    // We need /accessories (strip prefix and .html)
                    const webPath = this.daLivePathToWebPath(entry.path, pathPrefix);
                    pages.push(webPath);
                }
            }
        } catch (error) {
            this.logger.warn(`[Helix] Failed to list ${path}: ${(error as Error).message}`);
        }

        return pages;
    }

    /**
     * Convert a DA.live path to a web path
     * DA.live path: /org/site/accessories.html -> /accessories
     * DA.live path: /org/site/products/index.html -> /products
     */
    private daLivePathToWebPath(daLivePath: string, pathPrefix: string): string {
        // Strip the org/site prefix
        let webPath = daLivePath.replace(pathPrefix, '');

        // Remove .html extension
        webPath = webPath.replace(/\.html$/i, '');

        // Convert /index to /
        if (webPath === '/index' || webPath.endsWith('/index')) {
            webPath = webPath.slice(0, -6) || '/';
        }

        return webPath || '/';
    }

    /**
     * Progress callback for publish operations
     */
    public static readonly PublishPhases = {
        DISCOVERING: 'discovering',
        PUBLISHING: 'publishing',
        COMPLETE: 'complete',
    } as const;

    /**
     * Preview and publish all content in one operation.
     * Attempts bulk APIs first for performance, falls back to page-by-page if bulk fails.
     *
     * @param repoFullName - Full repository name (owner/repo) for Helix API
     * @param branch - Branch name (default: main)
     * @param daLiveOrg - DA.live organization (for listing content, may differ from GitHub owner)
     * @param daLiveSite - DA.live site name (for listing content, may differ from GitHub repo)
     * @param onProgress - Optional callback for progress updates
     */
    async publishAllSiteContent(
        repoFullName: string,
        branch: string = DEFAULT_BRANCH,
        daLiveOrg?: string,
        daLiveSite?: string,
        onProgress?: (info: {
            phase: typeof HelixService.PublishPhases[keyof typeof HelixService.PublishPhases];
            message: string;
            current?: number;
            total?: number;
            currentPath?: string;
        }) => void,
    ): Promise<void> {
        const [githubOrg, githubSite] = this.parseRepoFullName(repoFullName);

        // Use provided DA.live org/site, or fall back to GitHub org/site
        const contentOrg = daLiveOrg || githubOrg;
        const contentSite = daLiveSite || githubSite;

        this.logger.info(`[Helix] Publishing all content from DA.live: ${contentOrg}/${contentSite}`);
        this.logger.info(`[Helix] Target GitHub repo: ${repoFullName}`);

        // Report: Discovering content (still needed to get page count for progress)
        onProgress?.({
            phase: HelixService.PublishPhases.DISCOVERING,
            message: 'Discovering content to publish...',
        });

        // List all publishable pages from DA.live to get count for progress reporting
        const pages = await this.listAllPages(contentOrg, contentSite);

        if (pages.length === 0) {
            this.logger.warn('[Helix] No publishable pages found');
            throw new Error('No publishable pages found. Ensure the site has content in DA.live.');
        }

        this.logger.info(`[Helix] Found ${pages.length} pages to publish`);

        // Try bulk APIs first for better performance
        // If bulk fails (404 = site not configured), fall back to page-by-page
        try {
            await this.publishAllSiteContentBulk(githubOrg, githubSite, branch, pages, onProgress);
        } catch (error) {
            // Bulk API is a fast path — any failure falls back to reliable page-by-page
            this.logger.warn(`[Helix] Bulk publish failed: ${(error as Error).message}, falling back to page-by-page`);
            await this.publishAllSiteContentPageByPage(githubOrg, githubSite, branch, pages, onProgress);
        }
    }

    /**
     * Publish all content using bulk APIs (fast path)
     */
    private async publishAllSiteContentBulk(
        githubOrg: string,
        githubSite: string,
        branch: string,
        pages: string[],
        onProgress?: (info: {
            phase: typeof HelixService.PublishPhases[keyof typeof HelixService.PublishPhases];
            message: string;
            current?: number;
            total?: number;
            currentPath?: string;
        }) => void,
    ): Promise<void> {
        // Phase 1: Bulk preview (sync from DA.live to preview CDN)
        onProgress?.({
            phase: HelixService.PublishPhases.PUBLISHING,
            message: 'Previewing all content...',
            current: 0,
            total: pages.length,
        });

        await this.previewAllContent(
            githubOrg,
            githubSite,
            branch,
            (processed, total) => {
                onProgress?.({
                    phase: HelixService.PublishPhases.PUBLISHING,
                    message: `Previewing content (${processed}/${total})`,
                    current: Math.floor(processed / 2), // First half of progress
                    total: pages.length,
                });
            },
            pages, // Pass the discovered pages explicitly
        );

        this.logger.info('[Helix] Bulk preview completed');

        // Phase 2: Bulk publish (sync from preview to live CDN)
        onProgress?.({
            phase: HelixService.PublishPhases.PUBLISHING,
            message: 'Publishing to live CDN...',
            current: Math.floor(pages.length / 2),
            total: pages.length,
        });

        await this.publishAllContent(
            githubOrg,
            githubSite,
            branch,
            (processed, total) => {
                onProgress?.({
                    phase: HelixService.PublishPhases.PUBLISHING,
                    message: `Publishing to CDN (${processed}/${total})`,
                    current: Math.floor(pages.length / 2) + Math.floor(processed / 2), // Second half
                    total: pages.length,
                });
            },
            pages, // Pass the discovered pages explicitly
        );

        this.logger.info(`[Helix] Successfully published ${pages.length} pages using bulk API`);

        // Report completion
        onProgress?.({
            phase: HelixService.PublishPhases.COMPLETE,
            message: `Published ${pages.length} pages to CDN`,
            current: pages.length,
            total: pages.length,
        });
    }

    /**
     * Publish all content page-by-page (fallback for sites where bulk API isn't available)
     */
    private async publishAllSiteContentPageByPage(
        githubOrg: string,
        githubSite: string,
        branch: string,
        pages: string[],
        onProgress?: (info: {
            phase: typeof HelixService.PublishPhases[keyof typeof HelixService.PublishPhases];
            message: string;
            current?: number;
            total?: number;
            currentPath?: string;
        }) => void,
    ): Promise<void> {
        let publishedCount = 0;
        let skippedCount = 0;

        for (let i = 0; i < pages.length; i++) {
            const path = pages[i];

            onProgress?.({
                phase: HelixService.PublishPhases.PUBLISHING,
                message: `Publishing pages (${i + 1}/${pages.length})`,
                current: i,
                total: pages.length,
                currentPath: path,
            });

            try {
                await this.previewAndPublishPage(githubOrg, githubSite, path, branch);
                publishedCount++;
                this.logger.debug(`[Helix] Published: ${path}`);
            } catch (error) {
                const errorMessage = (error as Error).message;

                // 404 means the page has no content (placeholder) - skip it
                if (errorMessage.includes('404')) {
                    skippedCount++;
                    this.logger.debug(`[Helix] Skipping ${path} - no content (404)`);
                    continue;
                }

                // Other errors should propagate
                throw error;
            }
        }

        this.logger.info(`[Helix] Successfully published ${publishedCount}/${pages.length} pages (${skippedCount} skipped)`);

        // Report completion
        onProgress?.({
            phase: HelixService.PublishPhases.COMPLETE,
            message: `Published ${publishedCount} pages to CDN${skippedCount > 0 ? ` (${skippedCount} skipped)` : ''}`,
            current: pages.length,
            total: pages.length,
        });
    }

    // ==========================================================
    // Cache Operations
    // ==========================================================

    /**
     * Purge all cached content from the live CDN
     *
     * Use this before publishing when recreating a site with the same name,
     * or when resetting/republishing to ensure stale content is cleared.
     *
     * This is especially important when:
     * - A site was deleted and recreated with the same name
     * - Reset to template operations
     * - Republishing after content source changes
     *
     * The purge request is sent to all CDN edge nodes, but propagation
     * may take a few seconds to complete globally.
     *
     * @param org - Organization/owner name
     * @param site - Site/repository name
     * @param branch - Branch name (default: main)
     * @throws Error on access denied (403) or network error
     */
    async purgeCacheAll(org: string, site: string, branch: string = DEFAULT_BRANCH): Promise<void> {
        const token = await this.getGitHubToken();
        const url = `${HELIX_ADMIN_URL}/cache/${org}/${site}/${branch}/*`;

        this.logger.debug(`[Helix] Purging all cached content: ${url}`);

        // Cache purge only needs GitHub token (x-auth-token) for caller auth.
        // No x-content-source-authorization needed — cache operations don't
        // access DA.live content, they only invalidate the CDN cache layer.
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'x-auth-token': token,
            },
            signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
        });

        // 404 is acceptable (nothing cached yet)
        if (response.status === 404) {
            this.logger.debug('[Helix] No cached content to purge (404)');
            return;
        }

        // 401 is authentication failure
        if (response.status === 401) {
            throw new Error('GitHub authentication failed. Please ensure you have write access to the repository.');
        }

        // 403 is access denied
        if (response.status === 403) {
            throw new Error('Access denied. You do not have permission to purge this site cache.');
        }

        if (!response.ok) {
            throw new Error(`Failed to purge cache: ${response.status} ${response.statusText}`);
        }

        this.logger.debug('[Helix] Successfully purged all cached content');
    }

    // ==========================================================
    // Code Preview Operations
    // ==========================================================

    /**
     * Preview a code file (sync from GitHub to CDN)
     *
     * This triggers the Helix Admin to fetch code from GitHub
     * and make it available on the CDN. Used for config files
     * like config.json that need to be refreshed after updates.
     *
     * Unlike content preview, code preview only requires GitHub auth
     * (no DA.live token needed since code comes from GitHub).
     *
     * @param org - Organization/owner name
     * @param site - Site/repository name
     * @param path - File path (e.g., '/config.json')
     * @param branch - Branch name (default: main)
     * @throws Error on access denied (403) or network error
     */
    async previewCode(
        org: string,
        site: string,
        path: string = '/*',
        branch: string = DEFAULT_BRANCH,
    ): Promise<void> {
        const githubToken = await this.getGitHubToken();
        // Normalize path - ensure it starts with /
        const normalizedPath = path.startsWith('/') ? path : `/${path}`;
        const url = `${HELIX_ADMIN_URL}/code/${org}/${site}/${branch}${normalizedPath}`;

        this.logger.debug(`[Helix] Previewing code: ${url}`);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'x-auth-token': githubToken,
            },
            signal: AbortSignal.timeout(TIMEOUTS.LONG),
        });

        if (response.status === 401) {
            throw new Error('GitHub authentication failed. Please ensure you have write access to the repository.');
        }

        if (response.status === 403) {
            throw new Error('Access denied. You do not have permission to preview this code.');
        }

        if (!response.ok) {
            throw new Error(`Failed to preview code: ${response.status} ${response.statusText}`);
        }

        this.logger.debug(`[Helix] Successfully previewed code: ${normalizedPath}`);
    }
    // ==========================================================
    // Helpers
    // ==========================================================

    /**
     * Parse repository full name into org and site
     * @param fullName - Full repository name (owner/repo)
     * @returns Tuple of [org, site]
     */
    private parseRepoFullName(fullName: string): [string, string] {
        const parts = fullName.split('/');
        if (parts.length !== 2) {
            throw new Error(`Invalid repository name: ${fullName}. Expected format: owner/repo`);
        }
        return [parts[0], parts[1]];
    }
}
