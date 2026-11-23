/**
 * DaLiveBlockDocPages — the per-block documentation pages under
 * `.da/library/blocks/`, which are what the DA.live block palette renders.
 *
 * Writes one block's page from its example HTML (the agent's promote flow),
 * deletes a block's page, and reports which blocks have one. Building the whole
 * library's pages is `blockLibrary/storefrontLibraryWriter.ts`.
 *
 * Split from `daLiveBlockLibraryOperations.ts` (EDS-8, 2026-10-04), which builds
 * one of these and still answers for its public methods. Keep this module
 * `vscode`-free (the MCP server constructs the DA.live stack in a separate Node
 * process).
 *
 * @module features/eds/services/daLive/daLiveBlockDocPages
 */

import { DaLiveAuthError } from '../types';
import { DaLiveApiClient } from './daLiveApiClient';
import { CONTENT_COPY_BATCH_SIZE } from './daLiveConstants';
import { DaLiveSourceOperations } from './daLiveSourceOperations';
import { sourcePresent } from './daLiveSourceProbe';
import type { Logger } from '@/types/logger';

/** The block doc pages of one DA.live site's authoring library. */
export class DaLiveBlockDocPages {
    constructor(
        private readonly apiClient: DaLiveApiClient,
        private readonly sourceOps: DaLiveSourceOperations,
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
     * preview. The library build keeps a page a storefront already has instead.
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
     * A block's doc page source as DA.live holds it, or undefined when there is no page.
     * The library build reads the pages it found, to replace only the pages Demo Builder
     * generated (`blockLibrary/oldStubPages.ts`). Throws `DaLiveAuthError` on a 401 and an
     * `Error` on any other failed read, so a page that could not be read is never taken as none.
     */
    async readBlockDocPage(org: string, site: string, blockId: string): Promise<string | undefined> {
        const page = await this.sourceOps.readSource(org, site, `.da/library/blocks/${blockId}.html`);
        if (page.status === 200) return page.body;
        if (page.status === 404) return undefined;
        if (page.status === 401) {
            throw new DaLiveAuthError('Authentication expired. Please log in again.');
        }
        throw new Error(`Doc page for ${blockId} not read: ${page.status}`);
    }

    /**
     * Check which blocks have documentation pages on DA.live
     *
     * Performs HEAD requests to determine which blocks have doc pages, in batches.
     * One at a time, a 48-block library took the four calls a rebuild made then
     * ~20s (measured 2026-10-15). The library build keeps the pages found here, so
     * a check that fails counts as a page (`sourcePresent`): only a 404 is none.
     *
     * @param org - Organization name
     * @param site - Site name
     * @param blocks - Array of block definitions to check
     * @returns Array of block IDs that have documentation pages
     * @throws DaLiveAuthError when the sign-in has expired
     */
    async getBlocksWithDocs(
        org: string,
        site: string,
        blocks: Array<{ id: string }>,
    ): Promise<string[]> {
        const token = await this.apiClient.getImsToken();
        const probe = { apiClient: this.apiClient, logger: this.logger };
        const hasDoc = (block: { id: string }): Promise<boolean> =>
            sourcePresent(probe, token, `${org}/${site}/.da/library/blocks/${block.id}.html`);

        const existingIds: string[] = [];
        for (let i = 0; i < blocks.length; i += CONTENT_COPY_BATCH_SIZE) {
            const batch = blocks.slice(i, i + CONTENT_COPY_BATCH_SIZE);
            const found = await Promise.all(batch.map(hasDoc));
            // In the blocks' own order, as the one-at-a-time loop answered.
            batch.forEach((block, index) => {
                if (found[index]) existingIds.push(block.id);
            });
        }
        return existingIds;
    }
}
