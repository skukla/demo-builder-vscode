/**
 * DaLiveBlockLibrarySheet — the `.da/library/blocks.json` sheet that lists a
 * DA.live site's library blocks, and its "Blocks" section in site config.
 *
 * Writes DA.live's native JSON spreadsheet, reads the sheet's rows, appends one
 * block (read-merge-rewrite, never destructive), removes one block's row, and
 * registers the section. The section title MUST be exactly "Blocks" — DA.live's
 * library UI only renders block lists for that exact name.
 *
 * Split from `daLiveBlockLibraryOperations.ts` (EDS-8, 2026-10-04), which builds
 * one of these and still answers for its public methods. Keep this module
 * `vscode`-free (the MCP server constructs the DA.live stack in a separate Node
 * process).
 *
 * @module features/eds/services/daLive/daLiveBlockLibrarySheet
 */

import { type DaLiveSourceResult } from '../types';
import { DaLiveApiClient } from './daLiveApiClient';
import { DaLiveConfigOperations } from './daLiveConfigOperations';
import { DA_LIVE_BASE_URL, normalizePath } from './daLiveConstants';
import type { Logger } from '@/types/logger';

/** The block-library sheet of one DA.live site. */
export class DaLiveBlockLibrarySheet {
    constructor(
        private readonly apiClient: DaLiveApiClient,
        private readonly configOps: DaLiveConfigOperations,
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
     * Remove the block's row from `.da/library/blocks.json` and rewrite the
     * sheet with the remaining rows. Matches the row by blockId via its `path`
     * (the caller has no title). 404 sheet or no matching row → `'absent'`.
     */
    async removeBlockLibraryRow(
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
    async registerBlocksLibrarySection(org: string, site: string): Promise<boolean> {
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

}
