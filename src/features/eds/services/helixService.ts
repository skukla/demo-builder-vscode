/**
 * Helix Service
 *
 * Handles Helix Admin API operations for EDS (Edge Delivery Services)
 * including preview/publish and unpublish operations.
 *
 * Features:
 * - IMS token integration via AuthenticationService
 * - Preview content (POST /preview/{org}/{site}/main/{path})
 * - Publish content (POST /live/{org}/{site}/main/{path})
 * - Unpublish from live (DELETE /live/{org}/{site}/main/*)
 * - Delete from preview (DELETE /preview/{org}/{site}/main/*)
 * - 404 handling as success (site never published)
 * - Repo fullName parsing for org/site extraction
 */

import { getLogger } from '@/core/logging';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import type { Logger } from '@/types/logger';
import { DaLiveContentOperations } from './daLiveContentOperations';
import type { GitHubTokenService } from './githubTokenService';
import type { DaLiveEntry } from './types';

// ==========================================================
// Constants
// ==========================================================

/** Helix Admin API base URL */
const HELIX_ADMIN_URL = 'https://admin.hlx.page';

/** Default branch for Helix operations */
const DEFAULT_BRANCH = 'main';

/**
 * Result of unpublishing a site
 */
export interface UnpublishResult {
    /** Whether live content was unpublished */
    liveUnpublished: boolean;
    /** Whether preview content was deleted */
    previewDeleted: boolean;
    /** Error message for live unpublish if failed */
    liveError?: string;
    /** Error message for preview delete if failed */
    previewError?: string;
}

/**
 * Helix Service for admin operations
 */
export class HelixService {
    private logger: Logger;
    private authService: AuthenticationService;
    private githubTokenService?: GitHubTokenService;
    private daLiveOps: DaLiveContentOperations;

    /**
     * Create a HelixService
     * @param authService - Authentication service for IMS token access (used for DA.live)
     * @param logger - Optional logger for dependency injection (defaults to getLogger())
     * @param githubTokenService - Optional GitHub token service for Helix Admin API authentication
     */
    constructor(authService: AuthenticationService, logger?: Logger, githubTokenService?: GitHubTokenService) {
        if (!authService) {
            throw new Error('AuthenticationService is required');
        }
        this.authService = authService;
        this.logger = logger ?? getLogger();
        this.githubTokenService = githubTokenService;

        // Wrap the token manager as a TokenProvider for DaLiveContentOperations
        const tokenProvider = {
            getAccessToken: async () => {
                const token = await authService.getTokenManager().getAccessToken();
                return token ?? null;  // Convert undefined to null for TokenProvider interface
            },
        };
        this.daLiveOps = new DaLiveContentOperations(tokenProvider, this.logger);
    }

    // ==========================================================
    // Token Management
    // ==========================================================

    /**
     * Get IMS token from AuthenticationService (used for DA.live operations)
     * @throws Error if not authenticated
     */
    private async getImsToken(): Promise<string> {
        const tokenManager = this.authService.getTokenManager();
        const token = await tokenManager.getAccessToken();

        if (!token) {
            throw new Error('Not authenticated. Please log in to Adobe.');
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
        const imsToken = await this.getImsToken();
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
        const imsToken = await this.getImsToken();
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
     * Uses the bulk API endpoint to sync all content from DA.live to preview CDN
     *
     * The bulk API requires:
     * - Content-Type: application/json header
     * - JSON body with paths array (e.g., ["/*"] for recursive)
     * - Optional forceUpdate flag
     *
     * @param org - Organization/owner name
     * @param site - Site/repository name
     * @param branch - Branch name (default: main)
     * @see https://www.aem.live/docs/admin.html
     */
    async previewAllContent(
        org: string,
        site: string,
        branch: string = DEFAULT_BRANCH,
    ): Promise<void> {
        const githubToken = await this.getGitHubToken();
        const imsToken = await this.getImsToken();
        // Bulk API: POST to /preview/{org}/{site}/{ref} without /* in URL path
        // The /* goes in the paths array in the JSON body
        const url = `${HELIX_ADMIN_URL}/preview/${org}/${site}/${branch}`;

        this.logger.debug(`[Helix] Previewing all content: ${url}`);

        // Bulk API requires JSON body with paths array
        // Using "/*" to recursively preview all content
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'x-auth-token': githubToken,
                'x-content-source-authorization': `Bearer ${imsToken}`, // Required for DA.live content source
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                paths: ['/*'],
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

        // 202 = Bulk preview scheduled (async job created)
        if (response.status === 202 || response.ok) {
            this.logger.debug('[Helix] Bulk preview scheduled successfully');
            return;
        }

        throw new Error(`Failed to preview all content: ${response.status} ${response.statusText}`);
    }

    /**
     * Publish all content to live (bulk operation)
     * Uses the bulk API endpoint to sync all content from preview to live CDN
     *
     * The bulk API requires:
     * - Content-Type: application/json header
     * - JSON body with paths array (e.g., ["/*"] for recursive)
     * - Optional forceUpdate flag
     *
     * @param org - Organization/owner name
     * @param site - Site/repository name
     * @param branch - Branch name (default: main)
     * @see https://www.aem.live/docs/admin.html
     */
    async publishAllContent(
        org: string,
        site: string,
        branch: string = DEFAULT_BRANCH,
    ): Promise<void> {
        const githubToken = await this.getGitHubToken();
        const imsToken = await this.getImsToken();
        // Bulk API: POST to /live/{org}/{site}/{ref} without /* in URL path
        // The /* goes in the paths array in the JSON body
        const url = `${HELIX_ADMIN_URL}/live/${org}/${site}/${branch}`;

        this.logger.debug(`[Helix] Publishing all content: ${url}`);

        // Bulk API requires JSON body with paths array
        // Using "/*" to recursively publish all content
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'x-auth-token': githubToken,
                'x-content-source-authorization': `Bearer ${imsToken}`, // Required for DA.live content source
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                paths: ['/*'],
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

        // 202 = Bulk publish scheduled (async job created)
        if (response.status === 202 || response.ok) {
            this.logger.debug('[Helix] Bulk publish scheduled successfully');
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
            this.logger.debug(`[Helix] Listed ${entries.length} entries at ${path}`);

            for (const entry of entries) {
                this.logger.debug(`[Helix] Entry: ${entry.name} (ext: ${entry.ext || 'folder'}) path: ${entry.path}`);

                // Determine if it's a folder (no ext field) or file (has ext field)
                const isFolder = !entry.ext;

                if (isFolder) {
                    // Skip excluded folders
                    if (HelixService.EXCLUDED_FOLDERS.includes(entry.name)) {
                        this.logger.debug(`[Helix] Skipping excluded folder: ${entry.name}`);
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
                        this.logger.debug(`[Helix] Skipping non-HTML file: ${entry.name}.${entry.ext}`);
                        continue;
                    }

                    // Skip excluded names
                    if (HelixService.EXCLUDED_NAMES.includes(entry.name)) {
                        this.logger.debug(`[Helix] Skipping excluded file: ${entry.name}`);
                        continue;
                    }

                    // Convert DA.live path to web path
                    // entry.path is like /org/site/accessories.html
                    // We need /accessories (strip prefix and .html)
                    const webPath = this.daLivePathToWebPath(entry.path, pathPrefix);
                    this.logger.debug(`[Helix] Adding page: ${entry.path} -> ${webPath}`);
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
        VERIFYING: 'verifying',
        PUBLISHING: 'publishing',
        COMPLETE: 'complete',
    } as const;

    /**
     * Preview and publish all content in one operation
     * Lists all pages from DA.live and publishes each one individually.
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

        this.logger.info(`[Helix] Listing all pages from DA.live: ${contentOrg}/${contentSite}`);
        this.logger.info(`[Helix] Publishing to GitHub repo: ${repoFullName}`);

        // Report: Discovering content
        onProgress?.({
            phase: HelixService.PublishPhases.DISCOVERING,
            message: 'Discovering content to publish...',
        });

        // List all publishable pages from DA.live (using DA.live org/site)
        const pages = await this.listAllPages(contentOrg, contentSite);

        if (pages.length === 0) {
            this.logger.warn('[Helix] No publishable pages found');
            throw new Error('No publishable pages found. Ensure the site has content in DA.live.');
        }

        this.logger.info(`[Helix] Found ${pages.length} pages to publish`);

        // Report: Found pages, now verifying
        onProgress?.({
            phase: HelixService.PublishPhases.VERIFYING,
            message: `Found ${pages.length} pages. Verifying CDN connection...`,
            total: pages.length,
        });

        // Verify Helix is ready to accept publish requests
        // After fstab.yaml is pushed, there may be a delay before Helix processes it
        await this.waitForPublishReadiness(githubOrg, githubSite, branch);

        // Publish each page individually (single-page API works with IMS token)
        // Use GitHub org/site for Helix API calls (the repo connected to the site)
        const results: { path: string; success: boolean; skipped?: boolean; error?: string }[] = [];

        for (let i = 0; i < pages.length; i++) {
            const path = pages[i];

            // Report progress for each page
            onProgress?.({
                phase: HelixService.PublishPhases.PUBLISHING,
                message: `Publishing page ${i + 1} of ${pages.length}`,
                current: i + 1,
                total: pages.length,
                currentPath: path,
            });

            try {
                this.logger.debug(`[Helix] Publishing ${path}`);
                await this.previewAndPublishPage(githubOrg, githubSite, path, branch);
                results.push({ path, success: true });
            } catch (error) {
                const errorMessage = (error as Error).message;

                // 404 means no content exists at this path - skip silently
                // These are typically placeholder pages (e.g., commerce transactional pages)
                if (errorMessage.includes('404')) {
                    this.logger.debug(`[Helix] Skipping ${path} - no content found (404)`);
                    results.push({ path, success: true, skipped: true });
                } else {
                    this.logger.warn(`[Helix] Failed to publish ${path}: ${errorMessage}`);
                    results.push({ path, success: false, error: errorMessage });
                }
            }
        }

        // Report results
        const publishedCount = results.filter(r => r.success && !r.skipped).length;
        const skippedCount = results.filter(r => r.skipped).length;
        const failCount = results.filter(r => !r.success).length;

        if (skippedCount > 0) {
            this.logger.debug(`[Helix] Skipped ${skippedCount} pages with no content`);
        }

        if (failCount > 0) {
            const failedPaths = results.filter(r => !r.success).map(r => r.path).join(', ');
            this.logger.warn(`[Helix] Published ${publishedCount}/${pages.length} pages. Failed: ${failedPaths}`);
        }

        if (publishedCount === 0 && failCount > 0) {
            // Include the first error message to help diagnose the issue
            const firstError = results.find(r => r.error)?.error || 'Unknown error';
            throw new Error(`Failed to publish any pages. First error: ${firstError}`);
        }

        // Log summary with skipped count if any
        const skippedSuffix = skippedCount > 0 ? ` (${skippedCount} skipped - no content)` : '';
        this.logger.info(`[Helix] Successfully published ${publishedCount}/${pages.length} pages${skippedSuffix}`);

        // Report completion
        onProgress?.({
            phase: HelixService.PublishPhases.COMPLETE,
            message: `Published ${publishedCount} pages to CDN`,
            current: pages.length,
            total: pages.length,
        });
    }

    /**
     * Wait for Helix to be ready to accept preview/publish requests
     *
     * After fstab.yaml is pushed to GitHub, there can be a delay before Helix
     * processes the configuration and is ready to serve content. This method
     * attempts to preview the homepage with retries to ensure readiness.
     *
     * @param org - Organization/owner name
     * @param site - Site/repository name
     * @param branch - Branch name
     * @param maxAttempts - Maximum number of retry attempts (default: 5)
     * @param delayMs - Delay between attempts in milliseconds (default: 3000)
     */
    private async waitForPublishReadiness(
        org: string,
        site: string,
        branch: string,
        maxAttempts: number = 5,
        delayMs: number = 3000,
    ): Promise<void> {
        this.logger.info('[Helix] Verifying publish readiness...');

        const githubToken = await this.getGitHubToken();
        const imsToken = await this.getImsToken();
        const url = `${HELIX_ADMIN_URL}/preview/${org}/${site}/${branch}/`;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                // Quick check with short timeout - we're just testing if Helix is ready
                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'x-auth-token': githubToken,
                        'x-content-source-authorization': `Bearer ${imsToken}`, // Required for DA.live content source
                    },
                    signal: AbortSignal.timeout(TIMEOUTS.QUICK), // 5 second timeout
                });

                // Auth errors should fail immediately
                if (response.status === 401) {
                    throw new Error('GitHub authentication failed. Please ensure you have write access to the repository.');
                }
                if (response.status === 403) {
                    throw new Error('Access denied. You do not have permission to preview this content.');
                }

                if (response.ok) {
                    this.logger.info('[Helix] Publish readiness verified - Helix is ready');
                    return;
                }

                // Non-OK response - will retry
                throw new Error(`Preview returned ${response.status} ${response.statusText}`);
            } catch (error) {
                const errorMessage = (error as Error).message;

                // Auth errors should fail immediately, don't retry
                if (errorMessage.includes('authentication') || errorMessage.includes('Access denied')) {
                    throw error;
                }

                if (attempt < maxAttempts) {
                    this.logger.warn(
                        `[Helix] Readiness check attempt ${attempt}/${maxAttempts} failed: ${errorMessage}. Retrying in ${delayMs / 1000}s...`
                    );
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                } else {
                    this.logger.warn(
                        `[Helix] Readiness check failed after ${maxAttempts} attempts. Proceeding anyway...`
                    );
                    // Don't throw - let the bulk publish proceed and report individual failures
                    // This allows partial success if some pages work
                }
            }
        }
    }

    // ==========================================================
    // Unpublish Operations
    // ==========================================================

    /**
     * Unpublish content from live
     * @param org - Organization/owner name
     * @param site - Site/repository name
     * @param branch - Branch name (default: main)
     * @throws Error on access denied (403) or network error
     */
    async unpublishFromLive(org: string, site: string, branch: string = DEFAULT_BRANCH): Promise<void> {
        const token = await this.getGitHubToken();
        const url = `${HELIX_ADMIN_URL}/live/${org}/${site}/${branch}/*`;

        this.logger.debug(`[Helix] Unpublishing from live: ${url}`);

        const response = await fetch(url, {
            method: 'DELETE',
            headers: {
                'x-auth-token': token,
            },
            signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
        });

        // 404 is acceptable (site was never published)
        if (response.status === 404) {
            this.logger.debug('[Helix] Site was never published (404)');
            return;
        }

        // 401 is authentication failure
        if (response.status === 401) {
            throw new Error('GitHub authentication failed. Please ensure you have write access to the repository.');
        }

        // 403 is access denied
        if (response.status === 403) {
            throw new Error('Access denied. You do not have permission to unpublish this site.');
        }

        if (!response.ok) {
            throw new Error(`Failed to unpublish from live: ${response.status} ${response.statusText}`);
        }

        this.logger.debug('[Helix] Successfully unpublished from live');
    }

    /**
     * Delete content from preview
     * @param org - Organization/owner name
     * @param site - Site/repository name
     * @param branch - Branch name (default: main)
     * @throws Error on access denied (403) or network error
     */
    async deleteFromPreview(org: string, site: string, branch: string = DEFAULT_BRANCH): Promise<void> {
        const token = await this.getGitHubToken();
        const url = `${HELIX_ADMIN_URL}/preview/${org}/${site}/${branch}/*`;

        this.logger.debug(`[Helix] Deleting from preview: ${url}`);

        const response = await fetch(url, {
            method: 'DELETE',
            headers: {
                'x-auth-token': token,
            },
            signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
        });

        // 404 is acceptable (never previewed)
        if (response.status === 404) {
            this.logger.debug('[Helix] Site was never previewed (404)');
            return;
        }

        // 401 is authentication failure
        if (response.status === 401) {
            throw new Error('GitHub authentication failed. Please ensure you have write access to the repository.');
        }

        // 403 is access denied
        if (response.status === 403) {
            throw new Error('Access denied. You do not have permission to delete preview content.');
        }

        if (!response.ok) {
            throw new Error(`Failed to delete from preview: ${response.status} ${response.statusText}`);
        }

        this.logger.debug('[Helix] Successfully deleted from preview');
    }

    /**
     * Fully unpublish a site (both live and preview)
     * Continues with preview deletion even if live unpublish fails.
     *
     * @param repoFullName - Full repository name (owner/repo)
     * @param branch - Branch name (default: main)
     * @returns Result with success status for both operations
     */
    async unpublishSite(repoFullName: string, branch: string = DEFAULT_BRANCH): Promise<UnpublishResult> {
        const [org, site] = this.parseRepoFullName(repoFullName);

        const result: UnpublishResult = {
            liveUnpublished: false,
            previewDeleted: false,
        };

        // Unpublish from live
        try {
            await this.unpublishFromLive(org, site, branch);
            result.liveUnpublished = true;
        } catch (error) {
            result.liveError = (error as Error).message;
            this.logger.warn(`[Helix] Failed to unpublish from live: ${result.liveError}`);
        }

        // Delete from preview (continue even if live failed)
        try {
            await this.deleteFromPreview(org, site, branch);
            result.previewDeleted = true;
        } catch (error) {
            result.previewError = (error as Error).message;
            this.logger.warn(`[Helix] Failed to delete from preview: ${result.previewError}`);
        }

        return result;
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
