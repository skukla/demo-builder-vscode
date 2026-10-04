/**
 * DaLiveBlockDocPages — the per-block documentation pages under
 * `.da/library/blocks/`, which are what the DA.live block palette renders.
 *
 * Writes a page from a block's example HTML, copies authored pages from library
 * content sources over the public CDN, writes a stub for any block still
 * without one, deletes a block's page, and reports which blocks have one.
 *
 * Split from `daLiveBlockLibraryOperations.ts` (EDS-8, 2026-10-04), which builds
 * one of these and still answers for its public methods. Keep this module
 * `vscode`-free (the MCP server constructs the DA.live stack in a separate Node
 * process).
 *
 * @module features/eds/services/daLive/daLiveBlockDocPages
 */

import { DaLiveApiClient } from './daLiveApiClient';
import { CONTENT_COPY_BATCH_SIZE, DA_LIVE_BASE_URL } from './daLiveConstants';
import { DaLiveContentCopy } from './daLiveContentCopy';
import { DaLiveSourceOperations } from './daLiveSourceOperations';
import type { Logger } from '@/types/logger';

/** The block doc pages of one DA.live site's authoring library. */
export class DaLiveBlockDocPages {
    constructor(
        private readonly apiClient: DaLiveApiClient,
        private readonly sourceOps: DaLiveSourceOperations,
        private readonly copyOps: DaLiveContentCopy,
        private readonly logger: Logger,
    ) {}

    /**
     * Delete the doc page for a block. Probes existence first so the result can
     * distinguish `'deleted'` (a page was there) from `'absent'` (already gone);
     * `'failed'` only when `deleteSource` itself reports an error. The end state
     * is identical for deleted/absent — the distinction is purely informational.
     */
    async deleteBlockDocPage(
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
    async copyBlockDocPagesFromSources(
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
                    // PREVIEW, not published. Library doc pages get previewed and
                    // left there — that is all the DA.live palette needs — so the
                    // published host 404s for every block of every source.
                    { ...source, preview: true },
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
    async generateStubDocPages(
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
    async getBlocksWithDocs(
        org: string,
        site: string,
        blocks: Array<{ id: string }>,
    ): Promise<string[]> {
        const token = await this.apiClient.getImsToken();
        const existingIds: string[] = [];

        for (const block of blocks) {
            try {
                const blockDocUrl = `${DA_LIVE_BASE_URL}/source/${org}/${site}/.da/library/blocks/${block.id}.html`;
                const response = await this.apiClient.fetchWithRetry(blockDocUrl, {
                    method: 'HEAD',
                    headers: { Authorization: `Bearer ${token}` },
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
