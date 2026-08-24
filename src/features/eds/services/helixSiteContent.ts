/**
 * HelixSiteContent — whole-site content publication.
 *
 * The bulk half of the Helix client: discover every publishable page from
 * DA.live, bulk-preview and bulk-publish them (202-and-poll via
 * `helixBulkJobs`), and fall back to page-by-page when the bulk API refuses.
 * Also the exclusion lists that keep non-content files (metadata, redirects,
 * placeholder folders) out of a publish.
 *
 * Extracted from `helixService.ts` (god-file cut 3, 2026-08-23). Auth arrives
 * through the injected {@link HelixAdminAuth}; the single-page
 * preview-and-publish used by the fallback is injected as a callback by the
 * facade, keeping this class free of the page-op half.
 *
 * @module features/eds/services/helixSiteContent
 */

import type { DaLiveContentOperations } from './daLiveContentOperations';
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

/**
 * File names to exclude from publishing (non-content files)
 */
const EXCLUDED_NAMES = [
    'metadata', // metadata.json
    'redirects', // redirects.json
    'placeholders', // placeholders.json
    'query-index', // query-index.json
    'test-index', // test files
];

/**
 * Folder names to exclude from publishing
 */
const EXCLUDED_FOLDERS = [
    '.helix',
    '.milo',
    'placeholders',
    'experiments', // A/B test config
    'enrichment', // PDP enrichment data
];

/**
 * Progress callback phases for publish operations
 */
export const SITE_PUBLISH_PHASES = {
    DISCOVERING: 'discovering',
    PUBLISHING: 'publishing',
    COMPLETE: 'complete',
} as const;

/** One phase of a whole-site publish. */
export type SitePublishPhase = (typeof SITE_PUBLISH_PHASES)[keyof typeof SITE_PUBLISH_PHASES];

/** Progress report for a whole-site publish. */
export interface SitePublishProgress {
    phase: SitePublishPhase;
    message: string;
    current?: number;
    total?: number;
    currentPath?: string;
}

/** Parse "owner/repo" into its two halves. */
function parseRepoFullName(fullName: string): [string, string] {
    const parts = fullName.split('/');
    if (parts.length !== 2) {
        throw new Error(`Invalid repository name: ${fullName}. Expected format: owner/repo`);
    }
    return [parts[0], parts[1]];
}

/** What the site-content operations need from their host. */
export interface HelixSiteContentDeps {
    logger: Logger;
    daLiveOps: DaLiveContentOperations;
    auth: HelixAdminAuth;
    /** The single-page preview+publish used by the page-by-page fallback. */
    previewAndPublishPage(org: string, site: string, path: string, branch: string): Promise<void>;
}

/**
 * Publishes a whole site's content: bulk-first, page-by-page fallback.
 */
export class HelixSiteContent {
    constructor(private deps: HelixSiteContentDeps) {}

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
            this.logger.debug('[Helix] Bulk preview job created, polling for completion...');

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
            this.logger.debug('[Helix] Bulk publish job created, polling for completion...');

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
    async listAllPages(org: string, site: string, path: string = '/'): Promise<string[]> {
        const pages: string[] = [];
        // DA.live paths include org/site prefix, need to strip it for recursion
        const pathPrefix = `/${org}/${site}`;

        try {
            const entries = await this.deps.daLiveOps.listDirectory(org, site, path);

            for (const entry of entries) {
                // Determine if it's a folder (no ext field) or file (has ext field)
                const isFolder = !entry.ext;

                if (isFolder) {
                    // Skip excluded folders
                    if (EXCLUDED_FOLDERS.includes(entry.name)) {
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
                    if (EXCLUDED_NAMES.includes(entry.name)) {
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
        onProgress?: (info: SitePublishProgress) => void,
    ): Promise<void> {
        const [githubOrg, githubSite] = parseRepoFullName(repoFullName);

        // Use provided DA.live org/site, or fall back to GitHub org/site
        const contentOrg = daLiveOrg || githubOrg;
        const contentSite = daLiveSite || githubSite;

        this.logger.info(
            `[Helix] Publishing all content from DA.live: ${contentOrg}/${contentSite}`,
        );
        this.logger.info(`[Helix] Target GitHub repo: ${repoFullName}`);

        // Report: Discovering content (still needed to get page count for progress)
        onProgress?.({
            phase: SITE_PUBLISH_PHASES.DISCOVERING,
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
            this.logger.warn(
                `[Helix] Bulk publish failed: ${(error as Error).message}, falling back to page-by-page`,
            );
            await this.publishAllSiteContentPageByPage(
                githubOrg,
                githubSite,
                branch,
                pages,
                onProgress,
            );
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
        onProgress?: (info: SitePublishProgress) => void,
    ): Promise<void> {
        // Phase 1: Bulk preview (sync from DA.live to preview CDN)
        onProgress?.({
            phase: SITE_PUBLISH_PHASES.PUBLISHING,
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
                    phase: SITE_PUBLISH_PHASES.PUBLISHING,
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
            phase: SITE_PUBLISH_PHASES.PUBLISHING,
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
                    phase: SITE_PUBLISH_PHASES.PUBLISHING,
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
            phase: SITE_PUBLISH_PHASES.COMPLETE,
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
        onProgress?: (info: SitePublishProgress) => void,
    ): Promise<void> {
        let publishedCount = 0;
        let skippedCount = 0;

        for (let i = 0; i < pages.length; i++) {
            const path = pages[i];

            onProgress?.({
                phase: SITE_PUBLISH_PHASES.PUBLISHING,
                message: `Publishing to CDN (${i + 1}/${pages.length})`,
                current: i,
                total: pages.length,
                currentPath: path,
            });

            try {
                await this.deps.previewAndPublishPage(githubOrg, githubSite, path, branch);
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

        this.logger.info(
            `[Helix] Successfully published ${publishedCount}/${pages.length} pages (${skippedCount} skipped)`,
        );

        // Report completion
        onProgress?.({
            phase: SITE_PUBLISH_PHASES.COMPLETE,
            message: `Published ${publishedCount} pages to CDN${skippedCount > 0 ? ` (${skippedCount} skipped)` : ''}`,
            current: pages.length,
            total: pages.length,
        });
    }
}
