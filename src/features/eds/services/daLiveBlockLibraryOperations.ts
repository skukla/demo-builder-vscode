/**
 * DaLiveBlockLibraryOperations — DA.live authoring block-library management.
 *
 * The block-library cluster carved out of `DaLiveContentOperations`: creating
 * the `.da/library/blocks.json` sheet and its per-block doc pages, appending /
 * removing single blocks, generating stub pages, copying doc pages from library
 * content sources via the public CDN, and registering the "Blocks" library
 * section in site config. Builds on the shared `DaLiveApiClient` (token + http)
 * plus the source, config, and content-copy collaborators; the facade
 * constructs one instance and delegates to it.
 *
 * Keep this module `vscode`-free (the MCP server constructs the DA.live stack
 * in a separate Node process).
 *
 * @module features/eds/services/daLiveBlockLibraryOperations
 */

import { DaLiveApiClient } from './daLiveApiClient';
import { DaLiveConfigOperations } from './daLiveConfigOperations';
import { CONTENT_COPY_BATCH_SIZE, DA_LIVE_BASE_URL, normalizePath } from './daLiveConstants';
import { DaLiveContentCopy } from './daLiveContentCopy';
import { DaLiveSourceOperations } from './daLiveSourceOperations';
import { type DaLiveSourceResult } from './types';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types/logger';

/** DA.live authoring block-library operations. */
export class DaLiveBlockLibraryOperations {
    constructor(
        private readonly apiClient: DaLiveApiClient,
        private readonly sourceOps: DaLiveSourceOperations,
        private readonly configOps: DaLiveConfigOperations,
        private readonly copyOps: DaLiveContentCopy,
        private readonly logger: Logger,
    ) {}

    /**
     * Create a JSON spreadsheet in DA.live's native format
     *
     * DA.live stores spreadsheets as .json files with a specific format.
     * This method creates the JSON directly and uploads it.
     *
     * @param org - Organization name
     * @param site - Site name
     * @param destPath - Destination path (without extension - .json will be added)
     * @param headers - Column headers (will be used as keys in data objects)
     * @param rows - Array of row data (each row is an object with keys matching headers)
     * @param options - Options {overwrite}
     * @returns Result with success status and path
     */
    async createJsonSpreadsheet(
        org: string,
        site: string,
        destPath: string,
        headers: string[],
        rows: Array<Record<string, string>>,
        options: { overwrite?: boolean } = {},
    ): Promise<DaLiveSourceResult> {
        const token = await this.apiClient.getImsToken();

        // Create DA.live native JSON spreadsheet format
        const spreadsheetJson = {
            data: {
                total: rows.length,
                limit: rows.length,
                offset: 0,
                data: rows,
                ':colWidths': headers.map(() => 300), // Default column widths
            },
            ':names': ['data'],
            ':version': 3,
            ':type': 'multi-sheet',
        };

        // Upload with .json extension
        const normalized = normalizePath(destPath);
        const jsonPath = normalized.endsWith('.json') ? normalized : `${normalized}.json`;
        const url = `${DA_LIVE_BASE_URL}/source/${org}/${site}/${jsonPath}`;

        const formData = new FormData();
        formData.append(
            'data',
            new Blob([JSON.stringify(spreadsheetJson)], {
                type: 'application/json',
            }),
        );
        if (options.overwrite) formData.append('overwrite', 'true');

        const response = await this.apiClient.fetchWithRetry(url, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
        });

        const resultPath = `/${jsonPath}`;
        if (response.ok) return { success: true, path: resultPath };
        if (response.status === 409) {
            return {
                success: false,
                path: resultPath,
                error: 'Document already exists. Use overwrite option to replace.',
            };
        }
        return {
            success: false,
            path: resultPath,
            error: `Failed to create spreadsheet: ${response.status} ${response.statusText}`,
        };
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
        const token = await this.apiClient.getImsToken();
        const sheetPath = '.da/library/blocks.json';
        const sheetUrl = `${DA_LIVE_BASE_URL}/source/${org}/${site}/${sheetPath}`;

        // Step 1: read existing rows. 404 → empty; other non-OK → throw.
        const existingRows = await this.readBlockLibraryRows(sheetUrl, token);
        const sheetExisted = existingRows !== null;
        const rows = existingRows ?? [];

        // Step 2: idempotency check.
        if (rows.some((r) => r.name === block.title)) {
            // Still re-register the site config — caller may be repairing a config
            // drift even when the row already exists.
            const configRegistered = await this.registerBlocksLibrarySection(org, site);
            return { status: 'skipped-duplicate', siteConfigRegistered: configRegistered };
        }

        // Step 3: append and rewrite. `createJsonSpreadsheet` writes with
        // `overwrite: true`, so the read-merge-rewrite cycle preserves all
        // pre-existing rows.
        const newRow = {
            name: block.title,
            path: `https://content.da.live/${org}/${site}/.da/library/blocks/${block.blockId}`,
        };
        const mergedRows = [...rows, newRow];
        const writeResult = await this.createJsonSpreadsheet(
            org,
            site,
            '.da/library/blocks',
            ['name', 'path'],
            mergedRows,
            { overwrite: true },
        );
        if (!writeResult.success) {
            throw new Error(
                `Failed to write block library sheet: ${writeResult.error ?? 'unknown error'}`,
            );
        }

        // Step 4: register the "Blocks" section (idempotent on DA.live's side).
        const configRegistered = await this.registerBlocksLibrarySection(org, site);

        return {
            status: sheetExisted ? 'appended' : 'created',
            siteConfigRegistered: configRegistered,
        };
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
        const docPage = await this.deleteBlockDocPage(org, site, block.blockId);
        const sheet = await this.removeBlockLibraryRow(org, site, block.blockId);
        return { docPage, sheet };
    }

    /**
     * Delete the doc page for a block. Probes existence first so the result can
     * distinguish `'deleted'` (a page was there) from `'absent'` (already gone);
     * `'failed'` only when `deleteSource` itself reports an error. The end state
     * is identical for deleted/absent — the distinction is purely informational.
     */
    private async deleteBlockDocPage(
        org: string,
        site: string,
        blockId: string,
    ): Promise<'deleted' | 'absent' | 'failed'> {
        const docPath = `.da/library/blocks/${blockId}.html`;
        const existed = await this.sourceOps.sourceExists(org, site, docPath);
        const result = await this.sourceOps.deleteSource(org, site, docPath);
        if (!result.success) {
            return 'failed';
        }
        return existed ? 'deleted' : 'absent';
    }

    /**
     * Remove the block's row from `.da/library/blocks.json` and rewrite the
     * sheet with the remaining rows. Matches the row by blockId via its `path`
     * (the caller has no title). 404 sheet or no matching row → `'absent'`.
     */
    private async removeBlockLibraryRow(
        org: string,
        site: string,
        blockId: string,
    ): Promise<'removed' | 'absent'> {
        const token = await this.apiClient.getImsToken();
        const sheetPath = '.da/library/blocks.json';
        const sheetUrl = `${DA_LIVE_BASE_URL}/source/${org}/${site}/${sheetPath}`;

        const existingRows = await this.readBlockLibraryRows(sheetUrl, token);
        if (existingRows === null) {
            return 'absent'; // sheet not present (404)
        }

        const suffix = `/.da/library/blocks/${blockId}`;
        const remaining = existingRows.filter(
            (r) => !(typeof r.path === 'string' && r.path.endsWith(suffix)),
        );
        if (remaining.length === existingRows.length) {
            return 'absent'; // no matching row — nothing to rewrite
        }

        const writeResult = await this.createJsonSpreadsheet(
            org,
            site,
            '.da/library/blocks',
            ['name', 'path'],
            remaining,
            { overwrite: true },
        );
        if (!writeResult.success) {
            throw new Error(
                `Failed to rewrite block library sheet: ${writeResult.error ?? 'unknown error'}`,
            );
        }
        return 'removed';
    }

    /**
     * Read the current `.da/library/blocks.json` sheet rows.
     *
     * Returns `null` when the sheet is missing (HTTP 404). Throws for any other
     * non-OK response so the caller does not silently overwrite a sheet it
     * cannot read.
     */
    private async readBlockLibraryRows(
        sheetUrl: string,
        token: string,
    ): Promise<Array<Record<string, string>> | null> {
        const response = await this.apiClient.fetchWithRetry(sheetUrl, {
            method: 'GET',
            headers: { Authorization: `Bearer ${token}` },
        });
        if (response.status === 404) return null;
        if (!response.ok) {
            throw this.apiClient.createErrorFromResponse(response, 'read block library sheet');
        }
        const sheet = (await response.json()) as {
            data?: { data?: Array<Record<string, string>> };
        };
        return sheet?.data?.data ?? [];
    }

    /**
     * Register (or re-register) the "Blocks" library section in site config.
     *
     * Returns `true` on success, `false` on a non-fatal failure (logged but not
     * thrown — the sheet write has already succeeded and the caller may still
     * be useful with a stale config).
     */
    private async registerBlocksLibrarySection(org: string, site: string): Promise<boolean> {
        const result = await this.configOps.updateSiteConfig(org, site, [
            {
                title: 'Blocks',
                path: `https://content.da.live/${org}/${site}/.da/library/blocks.json`,
            },
        ]);
        if (!result.success) {
            this.logger.warn(
                `[DA.live] Failed to register Blocks library section: ${result.error}`,
            );
            return false;
        }
        return true;
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
        if (blocks.length === 0) {
            return { success: true, blocksCount: 0, paths: [] };
        }

        try {
            // Create doc pages for blocks that have exampleHtml but no existing page
            await this.ensureBlockDocPages(org, site, blocks);

            // Copy doc pages from library content sources for blocks without
            // unsafeHTML. Uses the public CDN (.plain.html) to avoid requiring
            // DA.live API auth on third-party source orgs.
            if (libraryContentSources?.length) {
                await this.copyBlockDocPagesFromSources(
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
            await this.generateStubDocPages(org, site, blocks);

            // Check which blocks have documentation pages (including newly created ones)
            const existingBlockIds = await this.getBlocksWithDocs(org, site, blocks);
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
            const blocksResult = await this.createJsonSpreadsheet(
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

            paths.push('.da/library/blocks.json');

            this.logger.info(
                `[DA.live] Block library created: ${verifiedBlocks.length}/${blocks.length} blocks with docs in ${org}/${site}`,
            );

            // Add block doc pages to paths for publishing
            for (const blockId of existingBlockIds) {
                paths.push(`.da/library/blocks/${blockId}`);
            }

            return { success: true, blocksCount: verifiedBlocks.length, paths };
        } catch (error) {
            this.logger.error(
                `[DA.live] Block library creation failed: ${(error as Error).message}`,
            );
            return { success: false, blocksCount: 0, paths: [], error: (error as Error).message };
        }
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
        try {
            const docHtml = `<body><header></header><main><div>${block.exampleHtml}</div></main><footer></footer></body>`;
            const result = await this.sourceOps.createSource(
                org,
                site,
                `.da/library/blocks/${block.id}.html`,
                docHtml,
                { overwrite: true },
            );
            if (!result.success) {
                this.logger.warn(
                    `[DA.live] Failed to upsert doc page for ${block.id}: ${result.error}`,
                );
                return 'failed';
            }
            return 'written';
        } catch (error) {
            this.logger.warn(
                `[DA.live] Failed to upsert doc page for ${block.id}: ${(error as Error).message}`,
            );
            return 'failed';
        }
    }

    /**
     * Create documentation pages for blocks that have exampleHtml but no existing page.
     *
     * Non-destructive: only creates pages for blocks missing from DA.live.
     * Blocks that already have doc pages (e.g., copied from a library content
     * source) are left untouched — the authored page is higher quality than
     * the generated one. Failures are logged but don't halt the pipeline.
     *
     * @param org - Organization name
     * @param site - Site name
     * @param blocks - Array of block definitions (may include exampleHtml)
     */
    async ensureBlockDocPages(
        org: string,
        site: string,
        blocks: Array<{ title: string; id: string; exampleHtml?: string }>,
    ): Promise<void> {
        const blocksWithHtml = blocks.filter((b) => b.exampleHtml);
        if (blocksWithHtml.length === 0) return;

        // Check which blocks already have doc pages (e.g., copied from content source)
        const existingIds = new Set(await this.getBlocksWithDocs(org, site, blocksWithHtml));
        const missing = blocksWithHtml.filter((b) => !existingIds.has(b.id));

        if (missing.length === 0) {
            this.logger.debug('[DA.live] All blocks with exampleHtml already have doc pages');
            return;
        }

        this.logger.info(
            `[DA.live] Creating ${missing.length} block doc pages (${existingIds.size} already exist)`,
        );

        // Create doc pages in parallel batches to match content copy performance pattern
        for (let i = 0; i < missing.length; i += CONTENT_COPY_BATCH_SIZE) {
            const batch = missing.slice(i, i + CONTENT_COPY_BATCH_SIZE);
            await Promise.all(
                batch.map(async (block) => {
                    try {
                        // Wrap exampleHtml in document structure expected by DA.live.
                        // Block must be inside a section <div> — DA.live treats direct
                        // children of <main> as sections, not blocks. This matches the
                        // format produced by .plain.html (content source copy path).
                        const docHtml = `<body><header></header><main><div>${block.exampleHtml}</div></main><footer></footer></body>`;
                        const result = await this.sourceOps.createSource(
                            org,
                            site,
                            `.da/library/blocks/${block.id}.html`,
                            docHtml,
                        );
                        if (result.success) {
                            this.logger.debug(`[DA.live] Created doc page for block: ${block.id}`);
                        } else {
                            this.logger.warn(
                                `[DA.live] Failed to create doc page for ${block.id}: ${result.error}`,
                            );
                        }
                    } catch (error) {
                        this.logger.warn(
                            `[DA.live] Failed to create doc page for ${block.id}: ${(error as Error).message}`,
                        );
                    }
                }),
            );
        }
    }

    /**
     * Copy block doc pages from library content sources via public CDN.
     *
     * For blocks without unsafeHTML (no auto-generated doc page), fetches each
     * block's doc page from each content source's public CDN and writes it to
     * the destination site. Tries content sources in order and stops at the
     * first successful fetch per block.
     *
     * Uses the CDN (.plain.html) instead of the DA.live /list/ API so that no
     * API auth is required on the source org — only the destination needs auth.
     *
     * @param org - Destination DA.live organization
     * @param site - Destination DA.live site
     * @param blocks - All block definitions (filters to those without unsafeHTML)
     * @param contentSources - Library content sources to fetch doc pages from
     */
    private async copyBlockDocPagesFromSources(
        org: string,
        site: string,
        blocks: Array<{ id: string; exampleHtml?: string }>,
        contentSources: Array<{ org: string; site: string }>,
        installedBlockIds?: string[],
    ): Promise<void> {
        // Only need CDN copy for blocks WITHOUT unsafeHTML —
        // blocks WITH unsafeHTML are handled by ensureBlockDocPages
        let blocksNeedingCdnCopy = blocks.filter((b) => !b.exampleHtml);

        // When installedBlockIds is provided, only attempt CDN copy for blocks
        // installed by block collections. Native template blocks won't have doc
        // pages on library content sources, so attempting them produces 404 spam.
        if (installedBlockIds?.length) {
            const installedSet = new Set(installedBlockIds);
            blocksNeedingCdnCopy = blocksNeedingCdnCopy.filter((b) => installedSet.has(b.id));
        }
        if (blocksNeedingCdnCopy.length === 0) return;

        // Check which blocks already have doc pages (e.g., copied by copyContent
        // from an owned org). Only CDN-fetch the ones still missing.
        const existingIds = new Set(await this.getBlocksWithDocs(org, site, blocksNeedingCdnCopy));
        const missing = blocksNeedingCdnCopy.filter((b) => !existingIds.has(b.id));
        if (missing.length === 0) return;

        const token = await this.apiClient.getImsToken();
        let copiedCount = 0;

        for (const block of missing) {
            const docPath = `/.da/library/blocks/${block.id}`;
            for (const source of contentSources) {
                const success = await this.copyOps.copySingleFile(
                    token,
                    source,
                    docPath,
                    { org, site },
                    docPath,
                );
                if (success) {
                    copiedCount++;
                    break; // Found in this source, move to next block
                }
            }
        }

        if (copiedCount > 0) {
            this.logger.info(
                `[DA.live] Copied ${copiedCount} block doc pages from CDN (${existingIds.size} already existed)`,
            );
        }
    }

    /**
     * Generate stub documentation pages for blocks that have no doc page.
     *
     * Runs after ensureBlockDocPages and copyBlockDocPagesFromSources as a final
     * fallback. Creates a minimal valid DA.live page for every block still missing
     * documentation so that all blocks in component-definition.json appear in the
     * library UI.
     *
     * Covers all blocks — not just those installed from external libraries — because
     * blocks deduplicated during library installation (already present in the template)
     * never appear in installedBlockIds but still need stubs if the template has no
     * doc page for them.
     *
     * Non-destructive: only creates pages for blocks with no existing doc page.
     * Blocks with unsafeHTML (handled by ensureBlockDocPages) are skipped.
     *
     * @param org - Destination DA.live organization
     * @param site - Destination DA.live site
     * @param blocks - All block definitions from component-definition.json
     */
    private async generateStubDocPages(
        org: string,
        site: string,
        blocks: Array<{ title: string; id: string; exampleHtml?: string }>,
    ): Promise<void> {
        // Only stub blocks without unsafeHTML — blocks with unsafeHTML
        // already have proper doc pages from ensureBlockDocPages
        const candidates = blocks.filter((b) => !b.exampleHtml);
        if (candidates.length === 0) return;

        const existingIds = new Set(await this.getBlocksWithDocs(org, site, candidates));
        const missing = candidates.filter((b) => !existingIds.has(b.id));
        if (missing.length === 0) return;

        this.logger.info(
            `[DA.live] Generating ${missing.length} stub doc pages for installed blocks without documentation`,
        );

        // Create stub pages in parallel batches to match content copy performance pattern
        for (let i = 0; i < missing.length; i += CONTENT_COPY_BATCH_SIZE) {
            const batch = missing.slice(i, i + CONTENT_COPY_BATCH_SIZE);
            await Promise.all(
                batch.map(async (block) => {
                    try {
                        const stubHtml = `<body><header></header><main><div><div class="${block.id}"><div><div><p>${block.title}</p></div></div></div></div></main><footer></footer></body>`;
                        const result = await this.sourceOps.createSource(
                            org,
                            site,
                            `.da/library/blocks/${block.id}.html`,
                            stubHtml,
                        );
                        if (result.success) {
                            this.logger.debug(
                                `[DA.live] Created stub doc page for block: ${block.id}`,
                            );
                        } else {
                            this.logger.warn(
                                `[DA.live] Failed to create stub doc page for ${block.id}: ${result.error}`,
                            );
                        }
                    } catch (error) {
                        this.logger.warn(
                            `[DA.live] Failed to create stub doc page for ${block.id}: ${(error as Error).message}`,
                        );
                    }
                }),
            );
        }
    }

    /**
     * Check which blocks have documentation pages on DA.live
     *
     * Performs HEAD requests to determine which blocks have doc pages.
     * Used to filter the block library to only include usable blocks.
     *
     * @param org - Organization name
     * @param site - Site name
     * @param blocks - Array of block definitions to check
     * @returns Array of block IDs that have documentation pages
     */
    private async getBlocksWithDocs(
        org: string,
        site: string,
        blocks: Array<{ id: string }>,
    ): Promise<string[]> {
        const token = await this.apiClient.getImsToken();
        const existingIds: string[] = [];

        for (const block of blocks) {
            try {
                const blockDocUrl = `${DA_LIVE_BASE_URL}/source/${org}/${site}/.da/library/blocks/${block.id}.html`;
                const response = await fetch(blockDocUrl, {
                    method: 'HEAD',
                    headers: { Authorization: `Bearer ${token}` },
                    signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
                });
                if (response.ok) {
                    existingIds.push(block.id);
                }
            } catch {
                // Block doc doesn't exist or network error — skip this block
            }
        }

        return existingIds;
    }
}
