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
 *
 * The class is the public face; the operations live in collaborators and every
 * method here delegates: credentials in `helixAdminAuth`, single-page preview /
 * publish / status in `helixPageContent`, DELETE and unpublish in
 * `helixPageDeletion`, code preview and cache purge in `helixCodeOperations`,
 * Admin API keys in `helixApiKeys`, whole-site publication in `helixSiteContent`.
 * The fourth cut (2026-10-03, EDS-8) moved the page, deletion and code operations
 * out; every public signature is unchanged, so callers and suites were untouched.
 */

import * as vscode from 'vscode';
import { DaLiveContentOperations } from '../daLive/daLiveContentOperations';
import type { GitHubTokenService } from '../github/githubTokenService';
import { HelixAdminAuth } from './helixAdminAuth';
import { HelixApiKeys } from './helixApiKeys';
import type { BulkProgressCallback } from './helixBulkJobs';
import { previewCode, purgeCacheAll } from './helixCodeOperations';
import * as keyStore from './helixKeyStore';
import {
    getResourceStatus,
    previewPage,
    publishPage,
    type PageContentDeps,
    type ResourceStatus,
} from './helixPageContent';
import { deleteResource, unpublishPages, type UnpublishPagesResult } from './helixPageDeletion';
import {
    HelixSiteContent,
    SITE_PUBLISH_PHASES,
    type SitePublishProgress,
} from './helixSiteContent';
import { getLogger } from '@/core/logging/debugLogger';
import type { Logger } from '@/types/logger';

/** Default branch for Helix operations */
const DEFAULT_BRANCH = 'main';

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

        // DaLiveContentOperations needs DA.live token - will throw if not provided when used.
        // Without a provider, a placeholder that throws a clear error if used.
        const daLiveOps = new DaLiveContentOperations(
            daLiveTokenProvider ?? {
                getAccessToken: async () => {
                    throw new Error(
                        'DA.live token provider not configured. ' +
                            'HelixService requires a DA.live token provider for content operations.',
                    );
                },
            },
            this.logger,
        );

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
            daLiveOps,
            auth: this.auth,
            previewAndPublishPage: (org, site, path, branch) =>
                this.previewAndPublishPage(org, site, path, branch),
        });
    }

    /** The credential seam and logger every delegated operation takes. */
    private get opDeps(): PageContentDeps {
        return { auth: this.auth, logger: this.logger };
    }

    /** What Helix holds for one path — a diagnostic that never throws. See `helixPageContent`. */
    async getResourceStatus(
        org: string,
        site: string,
        path: string,
        branch: string = DEFAULT_BRANCH,
    ): Promise<ResourceStatus> {
        return getResourceStatus(this.opDeps, org, site, path, branch);
    }

    /** Preview one page. Delegates to `helixPageContent`. */
    async previewPage(
        org: string,
        site: string,
        path: string = '/',
        branch: string = DEFAULT_BRANCH,
    ): Promise<void> {
        return previewPage(this.opDeps, org, site, path, branch);
    }

    /** Publish a page to live (preview to live CDN). Delegates to `helixPageContent`. */
    async publishPage(
        org: string,
        site: string,
        path: string = '/',
        branch: string = DEFAULT_BRANCH,
    ): Promise<void> {
        return publishPage(this.opDeps, org, site, path, branch);
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
     * Delete preview for a resource (DELETE /preview). Delegates to `helixPageDeletion`.
     * @returns true if deleted (204) or not found (404), false if auth failed; throws otherwise
     */
    async deletePreview(
        org: string,
        site: string,
        path: string = '/',
        branch: string = DEFAULT_BRANCH,
    ): Promise<boolean> {
        const result = await deleteResource(this.opDeps, 'preview', org, site, path, branch);
        return result.success;
    }

    /**
     * Unpublish a resource from the live content bus (DELETE /live). Delegates to `helixPageDeletion`.
     * @returns true if unpublished (204) or not found (404), false if auth failed; throws otherwise
     */
    async unpublishPage(
        org: string,
        site: string,
        path: string = '/',
        branch: string = DEFAULT_BRANCH,
    ): Promise<boolean> {
        const result = await deleteResource(this.opDeps, 'live', org, site, path, branch);
        return result.success;
    }

    /** Unpublish pages from live and preview, page by page (ADR-002). See `helixPageDeletion`. */
    async unpublishPages(
        org: string,
        site: string,
        branch: string,
        webPaths: string[],
    ): Promise<UnpublishPagesResult> {
        return unpublishPages(this.opDeps, org, site, branch, webPaths);
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

    /** Purge all cached content from the live CDN. Delegates to `helixCodeOperations`. */
    async purgeCacheAll(org: string, site: string, branch: string = DEFAULT_BRANCH): Promise<void> {
        return purgeCacheAll(this.opDeps, org, site, branch);
    }

    /**
     * Preview a code file (sync from GitHub to CDN), retrying a 400 while Helix's
     * code mirror catches up. Delegates to `helixCodeOperations`.
     */
    async previewCode(
        org: string,
        site: string,
        path: string = '/*',
        branch: string = DEFAULT_BRANCH,
    ): Promise<void> {
        return previewCode(this.opDeps, org, site, path, branch);
    }
}
