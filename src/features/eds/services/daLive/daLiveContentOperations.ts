/**
 * DaLiveContentOperations — composition root for the DA.live service cluster.
 *
 * Constructs and wires the six single-responsibility DA.live services and
 * presents their operations as one coherent surface, alongside the module-level
 * TokenProvider factories (`createDaLiveTokenProvider`,
 * `createDaLiveServiceTokenProvider`) consumers use to build one. The dependency
 * graph it owns:
 *   apiClient → sourceOps → { configOps, discoveryOps → copyOps } → blockLibOps
 * so a caller gets the whole wired stack from `new DaLiveContentOperations(tp, logger)`.
 *
 * The responsibilities live in their own services — token+HTTP (DaLiveApiClient),
 * source CRUD (DaLiveSourceOperations), config writes (DaLiveConfigOperations),
 * content-path discovery (DaLiveContentDiscovery), content copy/overlay
 * (DaLiveContentCopy), block-library management (DaLiveBlockLibraryOperations).
 * This class holds no business logic of its own; its methods delegate. Full
 * delegator-dissolution (consumers reaching the sub-services directly) was
 * considered and deliberately declined — see
 * `.rptc/complete/dalive-content-operations-god-file/` for the rationale.
 *
 * IMPORTANT — vscode-free invariant: this module MUST NOT import `vscode`.
 * The standalone MCP server (`src/mcp-server.ts`) constructs DaLiveContentOperations
 * at process start. The MCP server runs in a separate Node process WITHOUT the
 * vscode API; pulling `vscode` here (directly or transitively) would crash the
 * server on startup. Mirrors the same constraint already enforced on
 * `storefrontSyncService.ts` and `helixApiClient.ts`.
 */

import { DaLiveApiClient, type TokenProvider } from './daLiveApiClient';
import { DaLiveBlockLibraryOperations } from './daLiveBlockLibraryOperations';
import { DaLiveConfigOperations, type SiteConfigWriteResult } from './daLiveConfigOperations';
import { DaLiveContentCopy } from './daLiveContentCopy';
import { DaLiveContentDiscovery } from './daLiveContentDiscovery';
import { DaLiveSourceOperations } from './daLiveSourceOperations';
import { type PatchReport } from '../patches/patchReportHelper';
import { type RuntimeSurfaceSource } from '../runtimeSurfaceResolver';
import {
    type DaLiveEntry,
    type DaLiveSourceResult,
    type DaLiveCopyResult,
    type DaLiveProgressCallback,
    type DaLiveContentSource,
} from '../types';
import type { ContentPatchSource } from '@/types/demoPackages';
import type { Logger } from '@/types/logger';

// TokenProvider now lives on the shared api client, and DaLiveContentSource on
// the shared types module; both re-exported here for the existing consumers
// that import them from this module.
export type { TokenProvider };
export type { DaLiveContentSource };
export { extractReferencedPaths, filterProductOverlays } from './daLiveContentCopy';

/**
 * Authentication manager interface for token provider creation.
 * This matches the shape of AuthenticationService.getTokenManager().
 */
interface TokenManager {
    inspectToken(): Promise<{ valid: boolean; expiresIn: number; token?: string }>;
}

interface AuthManagerLike {
    getTokenManager(): TokenManager;
}

/**
 * Create a TokenProvider adapter from an authentication manager.
 *
 * This factory function consolidates the repeated pattern of creating
 * TokenProvider adapters throughout the codebase. It handles:
 * - Null/undefined authManager (returns null-returning provider)
 * - Converting undefined tokens to null (as required by TokenProvider)
 *
 * @param authManager - Optional authentication manager with getTokenManager()
 * @returns TokenProvider that wraps the auth manager's token access
 */
export function createDaLiveTokenProvider(authManager?: AuthManagerLike | null): TokenProvider {
    if (!authManager) {
        return {
            getAccessToken: async () => null,
        };
    }

    return {
        getAccessToken: async () => {
            const token = (await authManager.getTokenManager().inspectToken()).token;
            return token ?? null;
        },
    };
}

/**
 * Create a TokenProvider that wraps a DaLiveAuthService instance.
 * Use this when you have a DaLiveAuthService and need a TokenProvider
 * for DaLiveContentOperations or DaLiveOrgOperations.
 *
 * @param authService - Any object with getAccessToken (e.g., DaLiveAuthService)
 * @returns TokenProvider that delegates to the auth service
 */
export function createDaLiveServiceTokenProvider(authService: {
    getAccessToken(): Promise<string | null>;
}): TokenProvider {
    return {
        getAccessToken: () => authService.getAccessToken(),
    };
}

/**
 * DA.live Content Operations
 */
export class DaLiveContentOperations {
    private readonly apiClient: DaLiveApiClient;
    private readonly sourceOps: DaLiveSourceOperations;
    private readonly configOps: DaLiveConfigOperations;
    private readonly discoveryOps: DaLiveContentDiscovery;
    private readonly copyOps: DaLiveContentCopy;
    private readonly blockLibOps: DaLiveBlockLibraryOperations;

    constructor(
        tokenProvider: TokenProvider,
        private logger: Logger,
    ) {
        this.apiClient = new DaLiveApiClient(tokenProvider, logger);
        this.sourceOps = new DaLiveSourceOperations(this.apiClient, logger);
        this.configOps = new DaLiveConfigOperations(this.apiClient, logger);
        this.discoveryOps = new DaLiveContentDiscovery(this.sourceOps);
        this.copyOps = new DaLiveContentCopy(
            this.apiClient,
            this.sourceOps,
            this.discoveryOps,
            logger,
        );
        this.blockLibOps = new DaLiveBlockLibraryOperations(
            this.apiClient,
            this.sourceOps,
            this.configOps,
            this.copyOps,
            logger,
        );
    }

    /**
     * List directory contents
     * @param org - Organization name
     * @param site - Site name
     * @param path - Directory path (e.g., '/', '/pages')
     * @returns Array of directory entries, empty array if path doesn't exist
     */
    async listDirectory(org: string, site: string, path: string): Promise<DaLiveEntry[]> {
        return this.sourceOps.listDirectory(org, site, path);
    }

    /**
     * Copy content from source to destination
     * @param source - Source location {org, site, path}
     * @param destination - Destination location {org, site, path}
     * @param options - Copy options {recursive}
     * @returns Copy result with success status and file lists
     */
    async copyContent(
        source: { org: string; site: string; path: string },
        destination: { org: string; site: string; path: string },
        options: { recursive?: boolean } = {},
    ): Promise<DaLiveCopyResult> {
        return this.copyOps.copyContent(source, destination, options);
    }

    /**
     * Create or update source content
     * @param org - Organization name
     * @param site - Site name
     * @param path - Content path
     * @param content - Content to write
     * @param options - Options {overwrite}
     * @returns Result with success status and path
     */
    async createSource(
        org: string,
        site: string,
        path: string,
        content: string,
        options: { overwrite?: boolean } = {},
    ): Promise<DaLiveSourceResult> {
        return this.sourceOps.createSource(org, site, path, content, options);
    }

    /**
     * Read source content (raw body + status, size-capped).
     * @param org - Organization name
     * @param site - Site name
     * @param path - Content path
     * @param maxBytes - Optional cap; `bytes` still reports the true size
     */
    async readSource(
        org: string,
        site: string,
        path: string,
        maxBytes?: number,
    ): Promise<{ status: number; body: string; bytes: number; truncated: boolean }> {
        return this.sourceOps.readSource(org, site, path, maxBytes);
    }

    /**
     * Delete source content
     * @param org - Organization name
     * @param site - Site name
     * @param path - Content path to delete
     * @returns Result with success status
     */
    async deleteSource(
        org: string,
        site: string,
        path: string,
    ): Promise<{ success: boolean; error?: string }> {
        return this.sourceOps.deleteSource(org, site, path);
    }

    /**
     * Copy an entire DA.live site tree to a new site name in one operation.
     *
     * Uses DA's `POST /copy/{org}/{site}` endpoint with `destination=/{org}/{destSite}/`
     * — a single request that recursively duplicates the source tree under
     * the destination path. The destination namespace is auto-created.
     *
     * Used by the storefront name-migration path on reset to move content
     * from a legacy `<repo>-content` site to the matching `<repo>` site
     * before re-registering Helix against the new DA URL. The source is
     * NOT modified; the caller deletes it after verifying the new site.
     *
     * @param srcOrg - source DA.live org
     * @param srcSite - source DA.live site
     * @param destOrg - destination DA.live org (typically same as srcOrg)
     * @param destSite - destination DA.live site
     * @returns success or failure with status detail
     */
    async copyDaLiveSite(
        srcOrg: string,
        srcSite: string,
        destOrg: string,
        destSite: string,
    ): Promise<{ success: true } | { success: false; error: string; status?: number }> {
        return this.copyOps.copyDaLiveSite(srcOrg, srcSite, destOrg, destSite);
    }

    /**
     * Delete the site root entry so the site disappears from org listing.
     *
     * Sends `DELETE /source/{org}/{site}/` to remove the root directory marker.
     * Best-effort: 404 means it was already gone; other errors are logged but
     * don't fail the overall operation.
     */
    async deleteSiteRoot(org: string, site: string): Promise<void> {
        return this.sourceOps.deleteSiteRoot(org, site);
    }

    /**
     * Delete all content from a DA.live site.
     *
     * Recursively walks the directory tree, collects all file paths,
     * then deletes them in parallel batches (same concurrency as content
     * copy) followed by directory cleanup in reverse-depth order.
     * Finally deletes the site root entry so the site disappears from
     * the org listing.
     *
     * Note: Only DA.live *source* content is deleted. The caller is
     * responsible for unpublishing CDN content separately (via
     * HelixService.unpublishPages, which uses DA.live Bearer token auth).
     *
     * @param org - Organization name
     * @param site - Site name
     * @param onProgress - Optional progress callback
     * @returns Result with count of deleted entries
     */
    async deleteAllSiteContent(
        org: string,
        site: string,
        onProgress?: (info: { deleted: number; current: string }) => void,
    ): Promise<{ success: boolean; deletedCount: number; deletedPaths: string[]; error?: string }> {
        return this.sourceOps.deleteAllSiteContent(org, site, onProgress);
    }

    /**
     * Create block library from a template's component-definition.json
     *
     * Fetches component-definition.json from the template repo, extracts blocks,
     * and creates library configuration in DA.live. Non-blocking - returns
     * gracefully if template has no blocks or file doesn't exist.
     *
     * @param org - Destination DA.live organization (user's site)
     * @param site - Destination DA.live site (user's site)
     * @param templateOwner - GitHub owner of template repo
     * @param templateRepo - GitHub repo name of template
     * @param getFileContent - Function to fetch file from GitHub (from GitHubFileOperations)
     * @param libraryContentSources - DA.live sites whose published block doc pages should be
     *   copied via public CDN for blocks that lack unsafeHTML auto-generation
     * @param installedBlockIds - Block IDs installed from block collections; when provided,
     *   CDN doc page copy is restricted to only these blocks (skips native template blocks)
     * @returns Result with success status, block count, and paths created (for publishing)
     */
    async createBlockLibraryFromTemplate(
        org: string,
        site: string,
        templateOwner: string,
        templateRepo: string,
        getFileContent: (
            owner: string,
            repo: string,
            path: string
        ) => Promise<{ content: string; sha: string } | null>,
        libraryContentSources?: Array<{ org: string; site: string }>,
        installedBlockIds?: string[],
    ): Promise<{ success: boolean; blocksCount: number; paths: string[]; error?: string }> {
        return this.blockLibOps.createBlockLibraryFromTemplate(
            org,
            site,
            templateOwner,
            templateRepo,
            getFileContent,
            libraryContentSources,
            installedBlockIds,
        );
    }

    /**
     * Append a single block to the `.da/library/blocks.json` sheet (non-destructive).
     *
     * Sibling to the destructive `createBlockLibrary` flow: this method preserves
     * existing rows via a read-merge-rewrite cycle and is safe to call repeatedly
     * (e.g., from the AI promotion path). It never calls `deleteSource`.
     *
     * Flow:
     *   1. GET `.da/library/blocks.json` (404 → start with empty rows).
     *   2. If a row with `name === title` already exists, return
     *      `{ status: 'skipped-duplicate' }` without writing.
     *   3. Otherwise append `{ name: title, path: content.da.live/<org>/<site>/.da/library/blocks/<blockId> }`
     *      and rewrite via `createJsonSpreadsheet` with `overwrite: true`.
     *   4. Re-invoke `updateSiteConfig` with the `"Blocks"` section so the library
     *      registration is present. The section title MUST be exactly "Blocks" —
     *      DA.live's library UI only renders block lists for that exact name.
     *
     * @param org - Destination organization
     * @param site - Destination site name
     * @param block - Block descriptor `{ blockId, title }`
     * @returns Status of the sheet operation and whether the library section
     *          was registered in site config.
     * @throws Propagates non-404 HTTP errors from the initial GET without writing.
     */
    async appendBlockToLibrary(
        org: string,
        site: string,
        block: { blockId: string; title: string },
    ): Promise<{
        status: 'created' | 'appended' | 'skipped-duplicate';
        siteConfigRegistered: boolean;
    }> {
        return this.blockLibOps.appendBlockToLibrary(org, site, block);
    }

    /**
     * Remove a single block from the DA.live authoring library (inverse of
     * {@link appendBlockToLibrary}). Idempotent — never throws on
     * already-absent state.
     *
     * Reverses exactly two library artifacts:
     *   1. **Doc page** — `deleteSource` on `.da/library/blocks/<blockId>.html`
     *      (the same path {@link upsertBlockDocPage} writes). Returns
     *      `'deleted'` when a page was present and removed, `'absent'` when it
     *      was already gone, or `'failed'` when the delete reported an error.
     *   2. **Sheet row** — reads `.da/library/blocks.json`, filters OUT the row
     *      whose `path` ends with `/.da/library/blocks/<blockId>` (matched by
     *      blockId via the path, NOT by title — the caller only has blockId). If
     *      a row was removed, rewrites the sheet via `createJsonSpreadsheet`
     *      with `overwrite: true` (remaining rows, possibly empty) → `'removed'`.
     *      If no matching row, or the sheet is missing (404), the sheet is left
     *      untouched → `'absent'`.
     *
     * Does NOT delete the block's source files in `blocks/<blockId>/` — that is
     * the agent's responsibility (driven by the remove-custom-block skill). It
     * also does not touch `component-definition.json` (the MCP handler does).
     *
     * @param org   - DA.live organization
     * @param site  - DA.live site
     * @param block - Block descriptor `{ blockId }`
     * @returns Per-artifact status `{ docPage, sheet }`.
     */
    async removeBlockFromLibrary(
        org: string,
        site: string,
        block: { blockId: string },
    ): Promise<{ docPage: 'deleted' | 'absent' | 'failed'; sheet: 'removed' | 'absent' }> {
        return this.blockLibOps.removeBlockFromLibrary(org, site, block);
    }

    /**
     * Upsert a single block's documentation page — always writes, overwriting
     * any existing page at `.da/library/blocks/<blockId>.html`.
     *
     * Use this from the `promote_block_to_library` MCP flow where the AI may
     * iterate on the variant HTML and expects each call to refresh the rendered
     * preview. Contrast with {@link ensureBlockDocPages} which preserves
     * existing pages.
     *
     * Wraps `exampleHtml` in the DA.live-expected document structure
     * (`<body><header/><main><div>{html}</div></main><footer/></body>` — the
     * inner `<div>` matters: DA.live treats direct children of `<main>` as
     * sections, not blocks).
     *
     * @param org - DA.live organization
     * @param site - DA.live site
     * @param block - Block descriptor with `id` and `exampleHtml`
     * @returns `'written'` when DA.live accepted the write; `'failed'` when the
     *          underlying source call returned an error or threw. Failures are
     *          logged and surfaced via the return value, never thrown.
     */
    async upsertBlockDocPage(
        org: string,
        site: string,
        block: { id: string; exampleHtml: string },
    ): Promise<'written' | 'failed'> {
        return this.blockLibOps.upsertBlockDocPage(org, site, block);
    }

    /**
     * Get content paths by recursively listing all content on the source DA.live site.
     *
     * Uses the authenticated DA.live list API to enumerate every file,
     * then filters to content types (.html, .xlsx) and strips extensions
     * so the returned paths match the format expected by copySingleFile.
     *
     * This is more complete than getContentPathsFromIndex because the CDN
     * content index excludes fragment documents (nav, footer) and some
     * spreadsheets that are not indexed.
     *
     * @param org - Source organization name
     * @param site - Source site name
     * @returns Array of content paths (extension-free, e.g. '/nav', '/about')
     */
    async getContentPathsFromDaLive(org: string, site: string): Promise<string[]> {
        return this.discoveryOps.getContentPathsFromDaLive(org, site);
    }

    /**
     * Get content paths from a content source index
     *
     * Fetches the content index (e.g., full-index.json) from the source site
     * and returns the list of content paths. This is useful for operations
     * that need to know what content exists before copying it.
     *
     * @param source - Source content configuration (org, site, indexUrl)
     * @returns Array of content paths from the index
     */
    async getContentPathsFromIndex(source: DaLiveContentSource): Promise<string[]> {
        return this.discoveryOps.getContentPathsFromIndex(source);
    }

    /**
     * Overlay pass: copy the customer account chrome (the auth pages + the
     * fragments they reference, e.g. `/customer/nav`) from a SECOND content
     * source, on top of already-copied brand content.
     *
     * Used by hybrid packages whose brand/catalog content lives on one site but
     * whose B2B account experience must come from the canonical B2B content site
     * (B2B base + brand overlay). Additive; pulls live from the public CDN (no
     * fork); copies only what exists on the account source (no stubs — the brand
     * copy already created any base stubs). Reference-following then pulls
     * `/customer/nav` automatically.
     *
     * @param accountSource - The content site to source `/customer/*` chrome from.
     * @returns Copy result for the overlaid files (best-effort; never throws).
     */
    async overlayAccountChrome(
        accountSource: { org: string; site: string },
        destOrg: string,
        destSite: string,
        patchReport?: PatchReport,
    ): Promise<DaLiveCopyResult> {
        return this.copyOps.overlayAccountChrome(accountSource, destOrg, destSite, patchReport);
    }

    /**
     * Copy content from source site to destination site
     * @param source - Source content configuration (org, site, indexUrl)
     * @param destOrg - Destination organization
     * @param destSite - Destination site
     * @param progressCallback - Optional progress callback
     * @param contentPatchIds - Optional content patch IDs to apply
     * @param contentPatchSource - Optional external source for content patches
     * @param patchReport - Optional patch report. When supplied, per-page
     *   content-patch results (applied or not) are routed into the report
     *   via `addContentResult`, so the pipeline's final `reportUnapplied`
     *   call surfaces unapplied content patches in the same toast as
     *   unapplied code patches. Without a report, the old debug-log
     *   behavior is preserved (for callers outside the create/reset
     *   pipeline that don't aggregate patch results).
     * @returns Copy result
     */
    async copyContentFromSource(
        source: DaLiveContentSource,
        destOrg: string,
        destSite: string,
        progressCallback?: DaLiveProgressCallback,
        contentPatchIds?: string[],
        contentPatchSource?: ContentPatchSource,
        patchReport?: PatchReport,
        runtimeSurfaceSource?: RuntimeSurfaceSource,
    ): Promise<DaLiveCopyResult> {
        return this.copyOps.copyContentFromSource(
            source,
            destOrg,
            destSite,
            progressCallback,
            contentPatchIds,
            contentPatchSource,
            patchReport,
            runtimeSurfaceSource,
        );
    }

    /**
     * Apply site-level configuration settings
     *
     * Writes to the per-SITE config (/config/{org}/{site}). da.live's Library
     * reads the AEM Assets binding (aem.repositoryId) from the site config, so
     * that binding must be written site-scoped for the AEM Assets panel to
     * appear for first-time users.
     *
     * IMPORTANT: Preserves all existing sheets (library, permissions, etc.) —
     * only updates the data sheet. The block library lives in the site config,
     * so clobbering other sheets here would remove it.
     *
     * 401 ownership is governed by the ORG (org ownership grants site writes),
     * so the write-access probe is keyed on the org, not the site.
     *
     * `removeKeys` deletes named keys from the data sheet (a merge cannot remove
     * a key) — used to clear a stale row, e.g. reverting editor.path to the
     * da.live default when a project flips back to Universal Editor with no IMS
     * org id. When updates is empty and no removeKey is present, no POST is made.
     *
     * @param org - DA.live organization name
     * @param site - DA.live site name
     * @param configUpdates - Key-value pairs to update in the config
     * @param removeKeys - Keys to delete from the data sheet (default none)
     * @returns Success status with optional error message
     */
    async applySiteConfig(
        org: string,
        site: string,
        configUpdates: Record<string, string>,
        removeKeys: string[] = [],
    ): Promise<SiteConfigWriteResult> {
        return this.configOps.applySiteConfig(org, site, configUpdates, removeKeys);
    }

    /**
     * The site config as DA.live holds it — for logging when something that
     * depends on it fails inexplicably. Null when it cannot be read.
     *
     * @param org - DA.live organization
     * @param site - DA.live site
     * @returns the raw config document, or null
     */
    async readSiteConfigForDiagnostics(
        org: string,
        site: string,
    ): Promise<Record<string, unknown> | null> {
        return this.configOps.readSiteConfigForDiagnostics(org, site);
    }
}
