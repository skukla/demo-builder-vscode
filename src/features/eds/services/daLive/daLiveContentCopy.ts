/**
 * DaLiveContentCopy — copy authored content between DA.live sites.
 *
 * The content-copy entry point of the DA.live stack: single-file and recursive
 * copy, whole-site duplication, and the whole-site content copy that runs during
 * project creation and reset. Extracted from `DaLiveContentOperations` as part of
 * its decomposition; DaLiveContentOperations constructs one (`copyOps`).
 *
 * What is left here is the ORCHESTRATION. Each step lives in its own module and is
 * called, not reimplemented:
 *
 *   - `daLiveFileCopy` — one document, CDN to DA.live (every loop below uses it)
 *   - `daLiveCopyPaths` — which source paths a whole-site copy covers
 *   - `daLiveBatchCopy` — the batch loop and reference following
 *   - `daLiveContentReferences` — path filters, reference extraction, the audit
 *   - `daLiveSiteCopy` — server-side whole-tree duplication
 *   - `daLiveSpreadsheetCopy` and `daLiveAccountChrome` (both cut 2026-09-10)
 *
 * The third cut (2026-10-03, EDS-8) took the file from 981 lines to the size it is
 * now. The public methods kept their signatures, so every caller and suite was
 * untouched.
 *
 * Keep this module `vscode`-free (the MCP server constructs the DA.live stack
 * in a separate Node process).
 *
 * @module features/eds/services/daLive/daLiveContentCopy
 */

import type { PatchReport } from '../patches/patchReportHelper';
import type { RuntimeSurfaceSource } from '../runtimeSurfaceResolver';
import type { DaLiveCopyResult, DaLiveProgressCallback, DaLiveContentSource } from '../types';
import {
    createAuthPageStubs as createAuthPageStubsImpl,
    overlayAccountChrome as overlayAccountChromeImpl,
} from './daLiveAccountChrome';
import type { DaLiveApiClient } from './daLiveApiClient';
import {
    copyPathsInBatches,
    discoverAndCopyReferences,
    type BatchCopyDeps,
} from './daLiveBatchCopy';
import type { DaLiveContentDiscovery } from './daLiveContentDiscovery';
import { auditUncopiedReferences } from './daLiveContentReferences';
import { backfillEssentialPaths, enumerateAndFilterContentPaths } from './daLiveCopyPaths';
import { copySingleFile as copySingleFileImpl, type CopySingleFile } from './daLiveFileCopy';
import { copyDaLiveSite as copyDaLiveSiteImpl, type SiteCopyResult } from './daLiveSiteCopy';
import type { DaLiveSourceOperations } from './daLiveSourceOperations';
import type { ContentPatchSource } from '@/types/demoPackages';
import type { Logger } from '@/types/logger';

/** Copy authored content between DA.live sites. */
// TRANSPORT JURISDICTION (2026-08-22 consolidation): writes to admin.da.live
// go through `apiClient.fetchWithRetry` (shared retry + one-shot-body factory
// + page-level 429 tolerance). The raw `fetch` calls in the modules this class
// delegates to target the PUBLIC CDN (aem.live / aem.page) — a different system,
// deliberately outside the DA.live client: probes swallow errors by design and
// must not inherit retries, and CDN reads carry their own 404-tolerant semantics.
export class DaLiveContentCopy {
    constructor(
        private readonly apiClient: DaLiveApiClient,
        private readonly sourceOps: DaLiveSourceOperations,
        private readonly discoveryOps: DaLiveContentDiscovery,
        private readonly logger: Logger,
    ) {}

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
        const token = await this.apiClient.getImsToken();
        const copiedFiles: string[] = [];
        const failedFiles: { path: string; error: string }[] = [];

        // Check if source is a directory (needs recursive handling)
        if (options.recursive) {
            // List source directory
            const entries = await this.sourceOps.listDirectory(
                source.org,
                source.site,
                source.path,
            );

            // Process all entries
            // In DA.live API, folders don't have an 'ext' field, only files do
            for (const entry of entries) {
                const isFolder = !entry.ext;
                if (isFolder) {
                    // Recursively copy subdirectory
                    const subResult = await this.copyContent(
                        { org: source.org, site: source.site, path: entry.path },
                        {
                            org: destination.org,
                            site: destination.site,
                            path: entry.path.replace(source.path, destination.path),
                        },
                        { recursive: true },
                    );
                    copiedFiles.push(...subResult.copiedFiles);
                    failedFiles.push(...subResult.failedFiles);
                } else {
                    // Copy individual file
                    const destPath = entry.path.replace(source.path, destination.path);
                    const success = await this.copySingleFile(
                        token,
                        source,
                        entry.path,
                        destination,
                        destPath,
                    );
                    if (success) {
                        copiedFiles.push(destPath);
                    } else {
                        failedFiles.push({ path: destPath, error: 'Copy failed' });
                    }
                }
            }
        } else {
            // Single file copy
            const success = await this.copySingleFile(
                token,
                source,
                source.path,
                destination,
                destination.path,
            );
            if (success) {
                copiedFiles.push(destination.path);
            } else {
                failedFiles.push({ path: destination.path, error: 'Copy failed' });
            }
        }

        return {
            success: failedFiles.length === 0,
            copiedFiles,
            failedFiles,
            totalFiles: copiedFiles.length + failedFiles.length,
        };
    }

    /**
     * Copy a single file with retry logic — see `daLiveFileCopy.copySingleFile`
     * for the CDN read, the preview-host rule, and the write.
     *
     * Positional, typed by `CopySingleFile` so the batch loops and the account-chrome
     * overlay that borrow it cannot drift from it: (token, source, sourcePath,
     * destination, destPath, contentPatchIds?, contentPatchSource?, patchReport?,
     * discoveredPaths?).
     */
    async copySingleFile(...args: Parameters<CopySingleFile>): Promise<boolean> {
        const [
            token,
            source,
            sourcePath,
            destination,
            destPath,
            contentPatchIds,
            contentPatchSource,
            patchReport,
            discoveredPaths,
        ] = args;
        return copySingleFileImpl(
            { apiClient: this.apiClient, logger: this.logger },
            {
                token,
                source,
                sourcePath,
                destination,
                destPath,
                contentPatchIds,
                contentPatchSource,
                patchReport,
                discoveredPaths,
            },
        );
    }

    /**
     * Copy an entire DA.live site tree to a new site name in one operation —
     * see `daLiveSiteCopy.copyDaLiveSite`.
     */
    async copyDaLiveSite(
        srcOrg: string,
        srcSite: string,
        destOrg: string,
        destSite: string,
    ): Promise<SiteCopyResult> {
        return copyDaLiveSiteImpl(
            { apiClient: this.apiClient, logger: this.logger },
            srcOrg,
            srcSite,
            { org: destOrg, site: destSite },
        );
    }

    /** The batch loops' collaborators: the per-file copy is THIS instance's. */
    private batchDeps(): BatchCopyDeps {
        return {
            apiClient: this.apiClient,
            logger: this.logger,
            copySingleFile: this.copySingleFile.bind(this),
        };
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
        const deps = this.batchDeps();
        return overlayAccountChromeImpl(
            this.logger,
            this.apiClient,
            {
                copySingleFile: deps.copySingleFile,
                discoverAndCopyReferences: (...args) => discoverAndCopyReferences(deps, ...args),
            },
            accountSource,
            destOrg,
            destSite,
            patchReport,
        );
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
        // Report initialization progress
        progressCallback?.({
            processed: 0,
            total: 0,
            percentage: 0,
            message: 'Enumerating source content',
            currentFile: `${source.org}/${source.site}`,
        });

        // Enumerate and filter source content paths (list API w/ CDN-index fallback,
        // product-overlay filter, library-index exclusion).
        const { contentPaths, usedDaLiveList } = await enumerateAndFilterContentPaths(
            this.discoveryOps,
            this.logger,
            source,
        );

        progressCallback?.({
            processed: 0,
            total: 0,
            percentage: 0,
            message: 'Preparing content copy',
            currentFile: `${contentPaths.length} pages from ${source.org}/${source.site}`,
        });

        // Auth pages missing from source — stubs created after the main copy loop
        const missingAuthPages: Array<{ path: string; blockClass: string }> = [];

        // When using CDN index fallback, add essential content that may not
        // be in the content index. The DA.live list API already returns
        // everything, so this is only needed for the fallback path.
        if (!usedDaLiveList) {
            await backfillEssentialPaths(
                this.logger,
                source,
                contentPaths,
                missingAuthPages,
                runtimeSurfaceSource,
            );
        }

        // Internal document references discovered while copying (e.g. the
        // /customer/nav fragment embedded by the account page) land in
        // `discoveredPaths`, drained after the main loop so referenced-but-unindexed
        // docs get pulled from canonical.
        const outcome = {
            copiedFiles: [] as string[],
            failedFiles: [] as { path: string; error: string }[],
            discoveredPaths: new Set<string>(),
        };
        const { copiedFiles, failedFiles, discoveredPaths } = outcome;
        let totalFiles = contentPaths.length;
        const deps = this.batchDeps();
        const dest = { org: destOrg, site: destSite };
        const patches = { contentPatchIds, contentPatchSource, patchReport };

        // Copy files in parallel batches for improved performance (~5x faster)
        await copyPathsInBatches(deps, source, dest, contentPaths, outcome, progressCallback, patches);

        // Reference-following discovery: copy internal documents referenced by
        // already-copied pages but absent from the index + backfill lists (e.g.
        // the /customer/nav account-menu fragment). Closes the "silently-dropped
        // content" bug class without hardcoding paths or forking content.
        const discoveredCopied = await discoverAndCopyReferences(
            deps,
            { org: source.org, site: source.site },
            dest,
            contentPaths,
            discoveredPaths,
            contentPatchIds,
            contentPatchSource,
            patchReport,
        );
        for (const path of discoveredCopied) {
            copiedFiles.push(path);
            totalFiles++;
        }

        // Completeness audit: references copied content points at but that were
        // never copied go to the proceed-and-warn report. Never fails the copy.
        auditUncopiedReferences(this.logger, discoveredPaths, copiedFiles, patchReport);

        // Create stub pages for auth pages that don't exist on source.
        totalFiles += await createAuthPageStubsImpl(
            this.logger,
            this.apiClient,
            destOrg,
            destSite,
            missingAuthPages,
            copiedFiles,
        );

        // Final progress update
        if (progressCallback) {
            progressCallback({
                processed: totalFiles,
                total: totalFiles,
                percentage: 100,
            });
        }

        return {
            success: failedFiles.length === 0,
            copiedFiles,
            failedFiles,
            totalFiles,
        };
    }
}
