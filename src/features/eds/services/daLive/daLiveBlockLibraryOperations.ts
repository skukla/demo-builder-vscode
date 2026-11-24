/**
 * DaLiveBlockLibraryOperations — DA.live authoring block-library management.
 *
 * The block-library cluster carved out of `DaLiveContentOperations`. This file
 * WRITES a site's library from the list `buildStorefrontBlockLibrary` computes
 * (`blockLibrary/`), and adds and removes single blocks; the two things a library
 * is made of are their own units since 2026-10-04 (EDS-8):
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
import { DaLiveBlockLibrarySheet, type AppendBlockStatus } from './daLiveBlockLibrarySheet';
import { DaLiveConfigOperations } from './daLiveConfigOperations';
import { DaLiveContentCopy } from './daLiveContentCopy';
import { DaLiveSourceOperations } from './daLiveSourceOperations';
import {
    writeStorefrontBlockLibrary,
    type BlockLibraryResult,
    type StorefrontLibraryInput,
} from '@/features/eds/services/blockLibrary/storefrontLibraryWriter';
import type { Logger } from '@/types/logger';

/** DA.live authoring block-library operations. */
export class DaLiveBlockLibraryOperations {
    private readonly sheet: DaLiveBlockLibrarySheet;
    private readonly docPages: DaLiveBlockDocPages;

    constructor(
        private readonly apiClient: DaLiveApiClient,
        private readonly sourceOps: DaLiveSourceOperations,
        private readonly configOps: DaLiveConfigOperations,
        private readonly copyOps: DaLiveContentCopy,
        private readonly logger: Logger,
    ) {
        this.sheet = new DaLiveBlockLibrarySheet(apiClient, configOps, logger);
        this.docPages = new DaLiveBlockDocPages(apiClient, sourceOps, logger);
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
     * Does NOT delete the block's source files in `blocks/<blockId>/`: the
     * `remove_block_from_library` handler deletes them first (`mcp/blockRemoval.ts`).
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
     * Write the storefront's block list (pages by example source, the blocks
     * sheet, Adobe's templates, one site-config write). See
     * `blockLibrary/storefrontLibraryWriter.ts`.
     */
    writeStorefrontBlockLibrary(
        org: string,
        site: string,
        input: StorefrontLibraryInput,
    ): Promise<BlockLibraryResult> {
        const { apiClient, sourceOps, copyOps, configOps, sheet, logger } = this;
        const deps = { apiClient, sourceOps, copyOps, configOps, sheet, logger };
        return writeStorefrontBlockLibrary(deps, org, site, input);
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

    /** Add or rename one block's sheet row (`DaLiveBlockLibrarySheet.appendBlockToLibrary`). */
    appendBlockToLibrary(
        org: string,
        site: string,
        block: { blockId: string; title: string },
    ): Promise<{
        status: AppendBlockStatus;
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

    /** The blocks that already have a doc page (`DaLiveBlockDocPages.getBlocksWithDocs`). */
    getBlocksWithDocs(org: string, site: string, blocks: Array<{ id: string }>): Promise<string[]> {
        return this.docPages.getBlocksWithDocs(org, site, blocks);
    }

    /** A block's doc page source, if it has one (`DaLiveBlockDocPages.readBlockDocPage`). */
    readBlockDocPage(org: string, site: string, blockId: string): Promise<string | undefined> {
        return this.docPages.readBlockDocPage(org, site, blockId);
    }

    /** The blocks sheet's rows, null without one (`DaLiveBlockLibrarySheet.readBlocksSheetRows`). */
    readBlocksSheetRows(org: string, site: string): Promise<Array<Record<string, string>> | null> {
        return this.sheet.readBlocksSheetRows(org, site);
    }
}
