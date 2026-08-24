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

import * as vscode from 'vscode';
import { DaLiveContentOperations } from '../daLive/daLiveContentOperations';
import type { GitHubTokenService } from '../github/githubTokenService';
import { HelixAdminAuth } from './helixAdminAuth';
import {
    ADMIN_API_401_MESSAGE,
    captureErrorDetail,
    throwCredentialRefused,
} from './helixAdminErrors';
import {
    buildPartitionUrl,
    buildPublishHeaders,
    normalizeWebPath as normalizeHelixPath,
} from './helixApiClient';
import { HelixApiKeys } from './helixApiKeys';
import type { BulkProgressCallback } from './helixBulkJobs';
import * as keyStore from './helixKeyStore';
import { HelixSiteContent, SITE_PUBLISH_PHASES, type SitePublishProgress } from './helixSiteContent';
import { getLogger } from '@/core/logging';
import { runInBatches } from '@/core/utils/promiseUtils';
import { sleep } from '@/core/utils/sleep';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types/logger';

// ==========================================================
// Constants
// ==========================================================

/**
 * What a 401 from the Helix Admin API actually means.
 *
 * It is NOT necessarily a GitHub problem, which is what this message used to
 * claim. Once a site has any `access.admin` role, the Configuration Service sets
 * `requireAuth: "auto"` and the whole admin API closes to callers without an
 * accepted admin identity — the GitHub token is not one. Measured 2026-08-14 on
 * a throwaway site: an identical bulk-preview POST returned 202 before the admin
 * grant and 401 immediately after, then 202 again once the DA.live IMS Bearer
 * was attached.
 */

/** Default branch for Helix operations */
const DEFAULT_BRANCH = 'main';

/**
 * Backoff (ms) before each `previewCode` retry after a 400 from Helix Admin.
 * A 400 immediately after a push means Helix's code mirror hasn't indexed the
 * new commit yet; it typically catches up in <10s, so 3 retries at 1s/3s/7s
 * (~11s total) span that window. Only 400 retries — other statuses throw at once.
 */
const PREVIEW_RETRY_DELAYS_MS = [1000, 3000, 7000];

/**
 * Max concurrent DELETE requests per batch.
 * Helix Admin API enforces 10 req/s per project — batching at 5 keeps
 * well under the limit even with sequential live + parallel preview DELETEs.
 */
const HELIX_DELETE_BATCH_SIZE = 5;

/** Max retry attempts for 429 Too Many Requests responses */
const HELIX_RATE_LIMIT_MAX_RETRIES = 3;

// ==========================================================
// Persistent API Key Storage
// ==========================================================

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
    private auth: HelixAdminAuth;
    private apiKeys: HelixApiKeys;
    private siteContent: HelixSiteContent;

    /** Clear all cached API keys */
    static clearApiKeyCache(): void {
        keyStore.clearApiKeyCache();
    }

    /**
     * Fallback DA.live token source, registered once at activation.
     *
     * There is exactly ONE DA.live session per extension host — `edsServiceCache`
     * caches a single `DaLiveAuthService`. Threading that singleton through
     * every layer that happens to build a HelixService modelled a plurality
     * that does not exist, and the cost was real: two construction sites were
     * missing it, so a Helix code publish went out with only the GitHub token
     * and 401'd on any site with an `access.admin` role — silently, leaving the
     * CDN serving a stale config.json (seen live 2026-08-15).
     *
     * A constructor-supplied provider still wins; this is the default, not an
     * override.
     */
    private static defaultDaLiveTokenProvider: DaLiveTokenProvider | null = null;

    /**
     * Register the DA.live token source every HelixService should fall back to.
     * Called once from `activate()`. Idempotent; last registration wins.
     */
    static setDefaultDaLiveTokenProvider(provider: DaLiveTokenProvider): void {
        HelixService.defaultDaLiveTokenProvider = provider;
    }

    /** Drop the registered default (tests). */
    static clearDefaultDaLiveTokenProvider(): void {
        HelixService.defaultDaLiveTokenProvider = null;
    }

    /**
     * Initialize persistent key storage with encrypted SecretStorage.
     * Idempotent — safe to call multiple times (first caller wins).
     *
     * @param secretStorage - VS Code SecretStorage (OS keychain) for encrypted key persistence
     * @param legacyState - Optional globalState Memento for one-time migration of plaintext keys
     */
    static async initKeyStore(
        secretStorage: vscode.SecretStorage,
        legacyState?: vscode.Memento,
    ): Promise<void> {
        await keyStore.initKeyStore(secretStorage, legacyState);
    }

    /** Clear persistent key store (for testing). */
    static clearKeyStore(): void {
        keyStore.clearKeyStore();
    }

    /**
     * Forget a locally cached/persisted key WITHOUT calling the server.
     *
     * Use after a site config write. `apiKeys` lives inside the site config
     * document, so `updateSiteConfig`'s delete-then-re-register destroys the key
     * server-side (measured 2026-08-15: 1 key → delete → re-register → 0). The
     * local copy survives for up to 7 days, so without this the next publish
     * would authenticate with a key that no longer exists and 401.
     *
     * Deliberately not `deleteAdminApiKey`: there is nothing left to delete
     * remotely, and that call would spend a round trip to be told 404.
     */
    static async forgetApiKey(org: string, site: string): Promise<void> {
        await keyStore.forgetApiKey(org, site);
    }

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

        // Collaborators (god-file cut 3): auth is the shared seam; keys and
        // site-content take it by injection rather than reaching into this class.
        this.auth = new HelixAdminAuth(
            daLiveTokenProvider,
            () => HelixService.defaultDaLiveTokenProvider,
            githubTokenService,
        );
        this.apiKeys = new HelixApiKeys({
            logger: this.logger,
            getDaLiveToken: () => this.auth.getDaLiveToken(),
        });
        this.siteContent = new HelixSiteContent({
            logger: this.logger,
            daLiveOps: this.daLiveOps,
            auth: this.auth,
            previewAndPublishPage: (org, site, path, branch) =>
                this.previewAndPublishPage(org, site, path, branch),
        });
    }


    // ==========================================================
    // Path & Auth Helpers (implementations live in helixAdminAuth /
    // helixAdminErrors — these thin privates keep the page ops readable)
    // ==========================================================

    /** DELETE auth headers — the DA.live Bearer (ADR-002). See {@link HelixAdminAuth}. */
    private getDeleteAuthHeaders(): Promise<Record<string, string>> {
        return this.auth.getDeleteAuthHeaders();
    }

    /** The optional admin Bearer. See {@link HelixAdminAuth.tryAdminBearer}. */
    private tryAdminBearer(): Promise<Record<string, string>> {
        return this.auth.tryAdminBearer();
    }

    /** 403-as-credential-refusal. See {@link helixAdminErrors.throwCredentialRefused}. */
    private throwCredentialRefused(response: Response, what: string): Promise<never> {
        return throwCredentialRefused(response, what);
    }

    /** Diagnostic string from body + x-error. See {@link helixAdminErrors.captureErrorDetail}. */
    private captureErrorDetail(response: Response): Promise<string> {
        return captureErrorDetail(response);
    }

    /** The DA.live IMS token. See {@link HelixAdminAuth.getDaLiveToken}. */
    private getDaLiveToken(): Promise<string> {
        return this.auth.getDaLiveToken();
    }

    /** The GitHub token. See {@link HelixAdminAuth.getGitHubToken}. */
    private getGitHubToken(): Promise<string> {
        return this.auth.getGitHubToken();
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
     * @param org - Organization/owner name
     * @param site - Site/repository name
     * @param path - Content path
     * @param branch - Branch name (default: main)
     * @returns the admin HTTP status, the preview/live statuses when present, and any x-error
     */
    async getResourceStatus(
        org: string,
        site: string,
        path: string,
        branch: string = DEFAULT_BRANCH,
    ): Promise<{
        httpStatus: number;
        previewStatus?: number;
        liveStatus?: number;
        error?: string;
    }> {
        const cleanPath = normalizeHelixPath(path);
        const url = buildPartitionUrl('status', org, site, branch, cleanPath);

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    ...(await this.tryAdminBearer()),
                    'x-auth-token': await this.getGitHubToken(),
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

    async previewPage(
        org: string,
        site: string,
        path: string = '/',
        branch: string = DEFAULT_BRANCH,
    ): Promise<void> {
        const githubToken = await this.getGitHubToken();
        const imsToken = await this.getDaLiveToken();
        const cleanPath = normalizeHelixPath(path);
        const url = buildPartitionUrl('preview', org, site, branch, cleanPath);

        this.logger.debug(`[Helix] Previewing page: ${url}`);

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
            await this.throwCredentialRefused(response, 'preview this content');
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
        const cleanPath = normalizeHelixPath(path);
        const url = buildPartitionUrl('live', org, site, branch, cleanPath);

        this.logger.debug(`[Helix] Publishing page: ${url}`);

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

        this.logger.debug(`[Helix] Successfully published: ${cleanPath}`);
    }

    /**
     * Get or create an Admin API Key with publish role for a site.
     * Delegates to {@link HelixApiKeys}.
     */
    async createAdminApiKey(org: string, site: string): Promise<string | null> {
        return this.apiKeys.createAdminApiKey(org, site);
    }

    /**
     * Delete the Admin API Key for a site (site deletion cleanup).
     * Delegates to {@link HelixApiKeys}.
     */
    async deleteAdminApiKey(
        org: string,
        site: string,
    ): Promise<{ success: boolean; error?: string }> {
        return this.apiKeys.deleteAdminApiKey(org, site);
    }

    /**
     * Delete a resource from preview or live CDN partition.
     * Shared implementation for deletePreview and unpublishPage.
     *
     * Uses DA.live Bearer token auth which bypasses the "source exists" restriction.
     * See `getDeleteAuthHeaders()` for auth strategy details.
     *
     * @returns `{ success }` — false on auth failure (401/403)
     */
    private async deleteResource(
        partition: 'live' | 'preview',
        org: string,
        site: string,
        path: string,
        branch: string,
        retryCount: number = 0,
    ): Promise<{ success: boolean }> {
        const cleanPath = normalizeHelixPath(path);
        const url = buildPartitionUrl(partition, org, site, branch, cleanPath);
        const action = partition === 'live' ? 'Unpublishing' : 'Deleting preview';
        const successLog = partition === 'live' ? 'Unpublished' : 'Preview deleted';
        const errorPrefix = partition === 'live' ? 'unpublish' : 'delete preview';

        this.logger.debug(`[Helix] ${action}: ${url}`);

        const headers = await this.getDeleteAuthHeaders();
        const response = await fetch(url, {
            method: 'DELETE',
            headers,
            signal: AbortSignal.timeout(TIMEOUTS.LONG),
        });

        if (response.status === 401 || response.status === 403) {
            const detail = await this.captureErrorDetail(response);
            this.logger.warn(`[Helix] ${action} failed (${response.status}): ${detail}`);
            return { success: false };
        }
        if (response.status === 429) {
            if (retryCount >= HELIX_RATE_LIMIT_MAX_RETRIES) {
                throw new Error(
                    `Rate limited after ${retryCount} retries: ${partition} ${cleanPath}`,
                );
            }
            const retryAfter = parseInt(response.headers.get('retry-after') || '1', 10);
            const waitMs = Math.min(retryAfter * 1000, 30000);
            this.logger.warn(
                `[Helix] Rate limited on ${partition} ${cleanPath}, ` +
                    `retrying after ${retryAfter}s (attempt ${retryCount + 1}/${HELIX_RATE_LIMIT_MAX_RETRIES})`,
            );
            await sleep(waitMs);
            return this.deleteResource(partition, org, site, path, branch, retryCount + 1);
        }
        if (response.status === 204 || response.status === 404) {
            this.logger.debug(`[Helix] ${successLog}: ${cleanPath}`);
            return { success: true };
        }
        if (!response.ok) {
            throw new Error(`Failed to ${errorPrefix}: ${response.status} ${response.statusText}`);
        }
        return { success: true };
    }

    /**
     * Delete preview for a resource.
     *
     * Sends DELETE /preview/{org}/{site}/{ref}/{path} to remove the page
     * from the preview CDN partition. Uses DA.live Bearer token auth.
     *
     * @param org - Organization/owner name
     * @param site - Site/repository name
     * @param path - Content path (e.g., '/' for homepage, '/products')
     * @param branch - Branch name (default: main)
     * @returns true if deleted (204) or not found (404), false if auth failed
     * @throws Error on non-auth failures (5xx, network)
     */
    async deletePreview(
        org: string,
        site: string,
        path: string = '/',
        branch: string = DEFAULT_BRANCH,
    ): Promise<boolean> {
        const result = await this.deleteResource('preview', org, site, path, branch);
        return result.success;
    }

    /**
     * Unpublish a resource from the live content bus.
     *
     * Sends DELETE /live/{org}/{site}/{ref}/{path} to remove the page
     * from the live CDN partition and purge associated caches.
     * Uses DA.live Bearer token auth which bypasses the "source exists" restriction.
     *
     * @param org - Organization/owner name
     * @param site - Site/repository name
     * @param path - Content path (e.g., '/' for homepage, '/products')
     * @param branch - Branch name (default: main)
     * @returns true if unpublished (204) or not found (404), false if auth failed
     * @throws Error on non-auth failures (5xx, network)
     */
    async unpublishPage(
        org: string,
        site: string,
        path: string = '/',
        branch: string = DEFAULT_BRANCH,
    ): Promise<boolean> {
        const result = await this.deleteResource('live', org, site, path, branch);
        return result.success;
    }

    /**
     * Unpublish pages from both live and preview CDN.
     *
     * Uses page-by-page DELETE with DA.live Bearer token authentication,
     * which bypasses the "source exists" restriction. No need to manipulate
     * fstab.yaml or Configuration Service config before unpublishing.
     *
     * See ADR-002 for auth strategy investigation history.
     *
     * @param org - GitHub organization/owner
     * @param site - GitHub repository name
     * @param branch - Branch name
     * @param webPaths - Web paths to unpublish (e.g., ['/about', '/products'])
     * @returns Whether unpublish succeeded and count processed
     */
    async unpublishPages(
        org: string,
        site: string,
        branch: string,
        webPaths: string[],
    ): Promise<{
        success: boolean;
        count: number;
        total: number;
        liveFailed: number;
        previewFailed: number;
    }> {
        if (webPaths.length === 0) {
            return { success: true, count: 0, total: 0, liveFailed: 0, previewFailed: 0 };
        }

        this.logger.info(`[Helix] Unpublishing ${webPaths.length} pages (page-by-page)`);

        // Delete live and preview CDN entries in batches to respect rate limits
        const liveResults = await runInBatches(
            webPaths,
            HELIX_DELETE_BATCH_SIZE,
            async (path) => (await this.deleteResource('live', org, site, path, branch)).success,
        );
        const liveCount = liveResults.filter(Boolean).length;

        const previewResults = await runInBatches(webPaths, HELIX_DELETE_BATCH_SIZE, (path) =>
            this.deletePreview(org, site, path, branch),
        );
        const previewCount = previewResults.filter(Boolean).length;

        this.logger.info(
            `[Helix] Unpublish complete: ${liveCount}/${webPaths.length} live, ${previewCount}/${webPaths.length} preview`,
        );
        // `success` and `count` keep their meanings: the DELETE path asks "did we
        // manage to unpublish anything", and best-effort cleanup is the right
        // question there. The RESET path needs the other one — "did everything go"
        // — and could not ask it, because `success` is true when ONE path of 52
        // succeeds and `count` folds live and preview together with Math.max.
        //
        // A reset where all 52 live deletes 403'd therefore reported success while
        // the stale pages kept serving. `liveFailed` is the count users feel: the
        // live entry is what the CDN serves.
        return {
            success: liveCount > 0 || previewCount > 0,
            count: Math.max(liveCount, previewCount),
            total: webPaths.length,
            liveFailed: webPaths.length - liveCount,
            previewFailed: webPaths.length - previewCount,
        };
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

    // ==========================================================
    // Whole-site content publication (implementation: helixSiteContent)
    // ==========================================================

    /** Progress phases for {@link publishAllSiteContent} (re-exposed for callers). */
    public static readonly PublishPhases = SITE_PUBLISH_PHASES;

    /** Bulk-preview all content. Delegates to {@link HelixSiteContent}. */
    async previewAllContent(
        org: string,
        site: string,
        branch: string = DEFAULT_BRANCH,
        onProgress?: BulkProgressCallback,
        paths?: string[],
    ): Promise<void> {
        return this.siteContent.previewAllContent(org, site, branch, onProgress, paths);
    }

    /** Bulk-publish all content to live. Delegates to {@link HelixSiteContent}. */
    async publishAllContent(
        org: string,
        site: string,
        branch: string = DEFAULT_BRANCH,
        onProgress?: BulkProgressCallback,
        paths?: string[],
    ): Promise<void> {
        return this.siteContent.publishAllContent(org, site, branch, onProgress, paths);
    }

    /** List all publishable pages from DA.live. Delegates to {@link HelixSiteContent}. */
    async listAllPages(org: string, site: string, path: string = '/'): Promise<string[]> {
        return this.siteContent.listAllPages(org, site, path);
    }

    /**
     * Preview and publish all content in one operation (bulk-first, page-by-page
     * fallback). Delegates to {@link HelixSiteContent}.
     */
    async publishAllSiteContent(
        repoFullName: string,
        branch: string = DEFAULT_BRANCH,
        daLiveOrg?: string,
        daLiveSite?: string,
        onProgress?: (info: SitePublishProgress) => void,
    ): Promise<void> {
        return this.siteContent.publishAllSiteContent(
            repoFullName,
            branch,
            daLiveOrg,
            daLiveSite,
            onProgress,
        );
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
        const url = buildPartitionUrl('cache', org, site, branch, '/*');

        this.logger.debug(`[Helix] Purging all cached content: ${url}`);

        // Cache purge only needs GitHub token (x-auth-token) for caller auth.
        // No x-content-source-authorization needed — cache operations don't
        // access DA.live content, they only invalidate the CDN cache layer.
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                ...(await this.tryAdminBearer()),
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
            throw new Error(ADMIN_API_401_MESSAGE);
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
     *
     * Retries on 400 only (up to {@link PREVIEW_RETRY_DELAYS_MS}.length times):
     * a 400 right after a push means Helix's code mirror hasn't indexed the new
     * commit yet, and it usually catches up within the backoff window. Every
     * other status keeps its immediate-throw semantics.
     */
    async previewCode(
        org: string,
        site: string,
        path: string = '/*',
        branch: string = DEFAULT_BRANCH,
    ): Promise<void> {
        const githubToken = await this.getGitHubToken();
        const cleanPath = normalizeHelixPath(path);
        const url = buildPartitionUrl('code', org, site, branch, cleanPath);

        this.logger.debug(`[Helix] Previewing code: ${url}`);

        // retryIndex 0 = initial attempt; 1..N = retries after a 400.
        for (let retryIndex = 0; ; retryIndex++) {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    ...(await this.tryAdminBearer()),
                    'x-auth-token': githubToken,
                },
                // Fresh timeout signal per attempt — a reused signal from an
                // earlier attempt could already be aborted.
                signal: AbortSignal.timeout(TIMEOUTS.LONG),
            });

            if (response.status === 401) {
                throw new Error(ADMIN_API_401_MESSAGE);
            }

            if (response.status === 403) {
                await this.throwCredentialRefused(response, 'preview this code');
            }

            // Helix's code mirror hasn't caught up with the just-pushed commit
            // yet. Back off and retry; the mirror typically indexes within ~10s.
            if (response.status === 400 && retryIndex < PREVIEW_RETRY_DELAYS_MS.length) {
                const delayMs = PREVIEW_RETRY_DELAYS_MS[retryIndex];
                this.logger.debug(
                    `[Helix] previewCode 400 on attempt ${retryIndex + 1} — ` +
                        `Helix mirror not caught up, retrying in ${delayMs}ms`,
                );
                await sleep(delayMs);
                continue;
            }

            if (!response.ok) {
                throw new Error(
                    `Failed to preview code: ${response.status} ${response.statusText}`,
                );
            }

            this.logger.debug(`[Helix] Successfully previewed code: ${cleanPath}`);
            return;
        }
    }
    // ==========================================================
    // Helpers
    // ==========================================================

}
