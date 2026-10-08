/**
 * DaLiveBlockLibraryOperations — DA.live authoring block-library management.
 *
 * The block-library cluster carved out of `DaLiveContentOperations`. This file
 * BUILDS a site's library from its template's component-definition.json and
 * removes single blocks; the two things a library is made of are their own units
 * since 2026-10-04 (EDS-8):
 *   - `DaLiveBlockLibrarySheet` — the `.da/library/blocks.json` sheet and its
 *     "Blocks" section in site config
 *   - `DaLiveBlockDocPages` — the per-block doc pages the palette renders
 * DaLiveContentOperations constructs one instance and hands it out as `blockLibOps`.
 *
 * Keep this module `vscode`-free (the MCP server constructs the DA.live stack
 * in a separate Node process).
 *
 * @module features/eds/services/daLive/daLiveBlockLibraryOperations
 */

import { type DaLiveSourceResult } from '../types';
import { DaLiveApiClient } from './daLiveApiClient';
import { DaLiveBlockDocPages } from './daLiveBlockDocPages';
import { DaLiveBlockLibrarySheet } from './daLiveBlockLibrarySheet';
import { DaLiveConfigOperations } from './daLiveConfigOperations';
import { DaLiveContentCopy } from './daLiveContentCopy';
import { DaLiveSourceOperations } from './daLiveSourceOperations';
import type { Logger } from '@/types/logger';

/** DA.live authoring block-library operations. */
export class DaLiveBlockLibraryOperations {
    private readonly sheet: DaLiveBlockLibrarySheet;
    private readonly docPages: DaLiveBlockDocPages;

    constructor(
        apiClient: DaLiveApiClient,
        private readonly sourceOps: DaLiveSourceOperations,
        private readonly configOps: DaLiveConfigOperations,
        copyOps: DaLiveContentCopy,
        private readonly logger: Logger,
    ) {
        this.sheet = new DaLiveBlockLibrarySheet(apiClient, configOps, logger);
        this.docPages = new DaLiveBlockDocPages(apiClient, sourceOps, copyOps, logger);
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
        try {
            const componentDef = await getFileContent(
                templateOwner,
                templateRepo,
                'component-definition.json',
            );

            if (!componentDef?.content) {
                this.logger.debug('[DA.live] No component-definition.json in template');
                return { success: true, blocksCount: 0, paths: [] };
            }

            // GitHubFileOperations.getFileContent already decodes base64
            const parsed = JSON.parse(componentDef.content);

            // Scan ALL groups (not just 'blocks') so entries in other groups
            // like 'product' (product-teaser) are included in the library.
            const blocks = (parsed.groups ?? []).flatMap(
                (g: {
                    components?: Array<{
                        title: string;
                        id: string;
                        plugins?: { da?: { unsafeHTML?: string } };
                    }>;
                }) =>
                    (g.components ?? []).map((c) => ({
                        title: c.title,
                        id: c.id,
                        exampleHtml: c.plugins?.da?.unsafeHTML,
                    })),
            );

            if (blocks.length === 0) {
                this.logger.debug('[DA.live] No blocks found in component-definition.json');
                return { success: true, blocksCount: 0, paths: [] };
            }

            return await this.createBlockLibrary(
                org,
                site,
                blocks,
                libraryContentSources,
                installedBlockIds,
            );
        } catch (error) {
            this.logger.warn(
                `[DA.live] Block library from template failed: ${(error as Error).message}`,
            );
            return { success: false, blocksCount: 0, paths: [], error: (error as Error).message };
        }
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
        const docPage = await this.docPages.deleteBlockDocPage(org, site, block.blockId);
        const sheet = await this.sheet.removeBlockLibraryRow(org, site, block.blockId);
        return { docPage, sheet };
    }

    /**
     * Create block library configuration in DA.live
     *
     * Creates a single "Blocks" spreadsheet at /.da/library/blocks.json and
     * registers it in the site config. DA.live's library UI only renders
     * block lists for sections titled exactly "Blocks" — custom-named sections
     * are treated as iframe plugins and render blank.
     *
     * @param org - Destination organization (user's site)
     * @param site - Destination site name (user's site)
     * @param blocks - Array of block definitions
     * @returns Result with success status, block count, and paths created (for publishing)
     */
    private async createBlockLibrary(
        org: string,
        site: string,
        blocks: Array<{ title: string; id: string; exampleHtml?: string }>,
        libraryContentSources?: Array<{ org: string; site: string }>,
        installedBlockIds?: string[],
    ): Promise<{ success: boolean; blocksCount: number; paths: string[]; error?: string }> {
        try {
            // Create doc pages for blocks that have exampleHtml but no existing page
            await this.docPages.ensureBlockDocPages(org, site, blocks);

            // Copy doc pages from library content sources for blocks without
            // unsafeHTML. Uses the public CDN (.plain.html) to avoid requiring
            // DA.live API auth on third-party source orgs.
            if (libraryContentSources?.length) {
                await this.docPages.copyBlockDocPagesFromSources(
                    org,
                    site,
                    blocks,
                    libraryContentSources,
                    installedBlockIds,
                );
            }

            // Generate stub doc pages for any blocks still without documentation.
            // Runs after ensureBlockDocPages and copyBlockDocPagesFromSources so it
            // only creates stubs for blocks that couldn't be sourced from anywhere else.
            // Covers all blocks — not just installedBlockIds — because deduplicated
            // blocks (present in both template and a library) are skipped during
            // installation and never appear in installedBlockIds.
            await this.docPages.generateStubDocPages(org, site, blocks);

            // Check which blocks have documentation pages (including newly created ones)
            const existingBlockIds = await this.docPages.getBlocksWithDocs(org, site, blocks);
            const verifiedBlocks = blocks.filter((b) => existingBlockIds.includes(b.id));

            if (verifiedBlocks.length === 0) {
                this.logger.info(
                    `[DA.live] No blocks with documentation pages found in ${org}/${site}`,
                );
                return { success: true, blocksCount: 0, paths: [] };
            }

            const contentBase = `https://content.da.live/${org}/${site}/.da/library/blocks`;
            const paths: string[] = [];

            // Clean up any existing library spreadsheet files (including grouped ones from previous runs)
            await this.sourceOps.deleteSource(org, site, '.da/library/blocks.json');
            await this.sourceOps.deleteSource(org, site, '.da/library/blocks.html');
            await this.sourceOps.deleteSource(org, site, '.da/library/blocks.xlsx');
            await this.sourceOps.deleteSource(org, site, '.da/library/storefront-blocks.json');
            await this.sourceOps.deleteSource(org, site, '.da/library/storefront-blocks.html');
            await this.sourceOps.deleteSource(org, site, '.da/library/block-collection.json');
            await this.sourceOps.deleteSource(org, site, '.da/library/block-collection.html');

            // Register single "Blocks" section in site config
            const configResult = await this.configOps.updateSiteConfig(org, site, [
                {
                    title: 'Blocks',
                    path: `https://content.da.live/${org}/${site}/.da/library/blocks.json`,
                },
            ]);
            if (!configResult.success) {
                this.logger.warn(`[DA.live] Failed to update config: ${configResult.error}`);
            }

            // Create single spreadsheet with all verified blocks
            const blocksResult = await this.sheet.createJsonSpreadsheet(
                org,
                site,
                '.da/library/blocks',
                ['name', 'path'],
                verifiedBlocks.map((b) => ({ name: b.title, path: `${contentBase}/${b.id}` })),
                { overwrite: true },
            );
            if (!blocksResult.success) {
                return {
                    success: false,
                    blocksCount: 0,
                    paths: [],
                    error: 'Failed to create /.da/library/blocks.json',
                };
            }

            // ABSOLUTE, and load-bearing. These go to the AEM admin bulk API,
            // which addresses content from the site root; relative paths matched
            // nothing and the call still reported success, so every block in the
            // DA.live palette read "It appears <block> has not been previewed"
            // with no failure anywhere in the log.
            //
            // Nothing downstream will save us: the bulk path runs
            // `helixService.previewAllContent`, whose `getPathsOrDefault` only
            // substitutes `['/']` for an empty list and passes every other path
            // through untouched. (`normalizeWebPath` exists on HelixService, but
            // the SINGLE-path calls use it, not this one.) An earlier version of
            // this comment named a `bulkPreviewAndPublish` that normalised "as
            // well" — that function no longer exists, and the claim was wrong
            // even for its successor. Verified 2026-08-18.
            paths.push('/.da/library/blocks.json');

            this.logger.info(
                `[DA.live] Block library created: ${verifiedBlocks.length}/${blocks.length} blocks with docs in ${org}/${site}`,
            );

            // Add block doc pages to paths for publishing
            for (const blockId of existingBlockIds) {
                paths.push(`/.da/library/blocks/${blockId}`);
            }

            return { success: true, blocksCount: verifiedBlocks.length, paths };
        } catch (error) {
            this.logger.error(
                `[DA.live] Block library creation failed: ${(error as Error).message}`,
            );
            return { success: false, blocksCount: 0, paths: [], error: (error as Error).message };
        }
    }


    // ======================================================================
    // The sheet and the doc pages are their own units; these keep the
    // methods callers (through `blockLibOps`) and the tests already name.
    // ======================================================================

    /** Write a DA.live JSON spreadsheet (`DaLiveBlockLibrarySheet.createJsonSpreadsheet`). */
    createJsonSpreadsheet(
        org: string,
        site: string,
        destPath: string,
        headers: string[],
        rows: Array<Record<string, string>>,
        options: { overwrite?: boolean } = {},
    ): Promise<DaLiveSourceResult> {
        return this.sheet.createJsonSpreadsheet(org, site, destPath, headers, rows, options);
    }

    /** Append one block to the library sheet (`DaLiveBlockLibrarySheet.appendBlockToLibrary`). */
    appendBlockToLibrary(
        org: string,
        site: string,
        block: { blockId: string; title: string },
    ): Promise<{
        status: 'created' | 'appended' | 'skipped-duplicate';
        siteConfigRegistered: boolean;
    }> {
        return this.sheet.appendBlockToLibrary(org, site, block);
    }

    /** Write one block's doc page, overwriting (`DaLiveBlockDocPages.upsertBlockDocPage`). */
    upsertBlockDocPage(
        org: string,
        site: string,
        block: { id: string; exampleHtml: string },
    ): Promise<'written' | 'failed'> {
        return this.docPages.upsertBlockDocPage(org, site, block);
    }

    /** Create the missing doc pages that have example HTML (`DaLiveBlockDocPages.ensureBlockDocPages`). */
    ensureBlockDocPages(
        org: string,
        site: string,
        blocks: Array<{ title: string; id: string; exampleHtml?: string }>,
    ): Promise<void> {
        return this.docPages.ensureBlockDocPages(org, site, blocks);
    }
}
