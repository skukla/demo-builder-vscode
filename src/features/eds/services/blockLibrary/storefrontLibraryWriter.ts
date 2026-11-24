/**
 * Writes the storefront's block list to DA.live: each block's example page by its source, the
 * blocks sheet, Adobe's templates, and ONE site-config write carrying Blocks and Templates
 * (the config's `library` sheet is replaced whole on each write).
 * Design: `.rptc/plans/block-library-without-universal-editor/step-02.md`.
 *
 * Paths returned are ABSOLUTE, and load-bearing: they go to the AEM admin bulk API, which
 * addresses content from the site root. Relative ones matched nothing while the call still
 * reported success, so every block in the palette read "It appears <block> has not been
 * previewed" with no failure in the log. `HelixBulkPublish.previewAllContent` passes every
 * path through untouched, so nothing downstream normalises them (verified 2026-08-18).
 */

import type { BlockCodeAnalysis } from './blockCode';
import { blockDoc } from './blockDoc';
import { blockSheetRows, sheetColumns, type SheetRow } from './blockSheetRows';
import { contentUrl, copyPreviewPage, inBatches, type Destination } from './libraryPages';
import {
    BLOCKS_SHEET,
    OLD_LIBRARY_SHEETS,
    deleteLibrarySheets,
    paletteEmptyWarning,
} from './libraryRegistration';
import { TEMPLATES_SHEET, writeAdobeTemplates, type AdobeTemplates } from './libraryTemplates';
import { samePage } from './oldStubPages';
import { shippedExamplePage } from './shippedBlockExamples';
import type { StorefrontBlock } from './storefrontBlockList';
import type { DaLiveApiClient } from '@/features/eds/services/daLive/daLiveApiClient';
import type { DaLiveBlockLibrarySheet } from '@/features/eds/services/daLive/daLiveBlockLibrarySheet';
import type { DaLiveConfigOperations } from '@/features/eds/services/daLive/daLiveConfigOperations';
import type { DaLiveContentCopy } from '@/features/eds/services/daLive/daLiveContentCopy';
import type { DaLiveSourceOperations } from '@/features/eds/services/daLive/daLiveSourceOperations';
import { DaLiveAuthError } from '@/features/eds/services/types';
import type { Logger } from '@/types/logger';

/** The DA.live operations the writer uses, as the existing ops objects provide them. */
export interface StorefrontLibraryDeps {
    apiClient: Pick<DaLiveApiClient, 'getImsToken' | 'fetchWithRetry'>;
    sourceOps: Pick<DaLiveSourceOperations, 'createSource' | 'deleteSource'>;
    copyOps: Pick<DaLiveContentCopy, 'copySingleFile'>;
    configOps: Pick<DaLiveConfigOperations, 'updateSiteConfig'>;
    sheet: Pick<
        DaLiveBlockLibrarySheet,
        'createJsonSpreadsheet' | 'readBlocksSheetRows' | 'readSheetRows'
    >;
    logger: Logger;
}

/** The ordered list, Adobe's templates when the package has an Adobe source, the code reader. */
export interface StorefrontLibraryInput {
    blocks: StorefrontBlock[];
    templates?: AdobeTemplates;
    /** Blocks whose page Demo Builder generated (`oldStubPages.ts`): their new page replaces it. */
    replacePageIds?: ReadonlySet<string>;
    /** Those pages' current source, by id: a write that would not change one is skipped. */
    replacedPages?: ReadonlyMap<string, string>;
    /** The block's code analysis, for a placeholder shaped like its table. */
    placeholderFor: (blockId: string) => Promise<BlockCodeAnalysis>;
    /** Photos from the storefront's own content pages, for a shipped example's image cells. */
    photos?: readonly string[];
}

/** What a library build did: whether it took, how many blocks, the paths to publish. */
export interface BlockLibraryResult {
    success: boolean;
    blocksCount: number;
    paths: string[];
    error?: string;
    /**
     * The listed blocks whose page is still the placeholder shaped by their code: no example
     * yet (EDS-71 step 4c). Present only when the list was written; absent, nothing is known.
     */
    needsExample?: string[];
}

const BLOCK_PAGES = '.da/library/blocks';
const UNREADABLE = 'The block list in DA.live could not be read, so it was left unchanged.';

/** Reported, not just logged, as EDS-38's warning is: blocks were asked for and none got a page. */
const noPageWarning = (asked: number): string =>
    `The block palette in DA.live will be empty: none of the ${asked} blocks got a page.`;

/** Writes the pages, sheets and site config for the list. A page that fails is left out. */
export async function writeStorefrontBlockLibrary(
    deps: StorefrontLibraryDeps,
    org: string,
    site: string,
    input: StorefrontLibraryInput,
): Promise<BlockLibraryResult> {
    const existing = await readExistingRows(deps, org, site);
    if (!existing) return { success: false, blocksCount: 0, paths: [], error: UNREADABLE };
    const dest = { org, site, token: await deps.apiClient.getImsToken() };
    const pages = await writeBlockPages(deps, dest, input);
    const listed = pages.map(({ block }) => block);
    const idsOf = (kind: BlockPage): string[] => pages.filter(({ page }) => page === kind)
        .map(({ block }) => block.id);
    const needsExample = idsOf('placeholder');
    const withoutPhotos = idsOf('example-without-photos');
    if (withoutPhotos.length > 0) {
        deps.logger.info(`[DA.live] No storefront photo for the image cells of: ${withoutPhotos.join(', ')}`);
    }
    if (listed.length === 0) {
        deps.logger.info(`[DA.live] No block pages to list in ${org}/${site}`);
        const asked = input.blocks.length;
        if (asked === 0) return { success: true, blocksCount: 0, paths: [], needsExample };
        return { success: false, blocksCount: 0, paths: [], error: noPageWarning(asked) };
    }
    const templatePaths = input.templates
        ? await writeAdobeTemplates(deps, dest, input.templates)
        : [];
    await deleteLibrarySheets(deps.sourceOps, org, site, OLD_LIBRARY_SHEETS);
    if (!(await writeBlocksSheet(deps, dest, existing, listed))) {
        const error = `Failed to create /${BLOCKS_SHEET}`;
        return { success: false, blocksCount: 0, paths: [], error };
    }
    const warning = await registerLists(deps, dest, templatePaths.length > 0);
    const blockPaths = listed.map((block) => `/${BLOCK_PAGES}/${block.id}`);
    const paths = [`/${BLOCKS_SHEET}`, ...blockPaths, ...templatePaths];
    deps.logger.info(
        `[DA.live] Block library written: ${listed.length}/${input.blocks.length} blocks`,
    );
    const written = { blocksCount: listed.length, paths, needsExample };
    if (warning) return { success: false, ...written, error: warning };
    return { success: true, ...written };
}

/**
 * The rows already in the sheet ([] when there is none), or undefined when it cannot be read. An
 * expired DA.live sign-in is let through, so the caller can ask again.
 */
async function readExistingRows(
    deps: StorefrontLibraryDeps,
    org: string,
    site: string,
): Promise<SheetRow[] | undefined> {
    try {
        return (await deps.sheet.readBlocksSheetRows(org, site)) ?? [];
    } catch (error) {
        if (error instanceof DaLiveAuthError) throw error;
        deps.logger.warn(`[DA.live] Block list not read: ${(error as Error).message}`);
        return undefined;
    }
}

/**
 * What a block's page is once written: an example, a shipped example whose image cells got no
 * photo, or the placeholder shaped by its code.
 */
type BlockPage = 'example' | 'example-without-photos' | 'placeholder';

/** The blocks that got a page, each with what the page is. */
async function writeBlockPages(
    deps: StorefrontLibraryDeps,
    dest: Destination,
    input: StorefrontLibraryInput,
): Promise<Array<{ block: StorefrontBlock; page: BlockPage }>> {
    const written = await inBatches(input.blocks, (block) =>
        writeBlockPage(deps, dest, block, input));
    const failed = input.blocks.filter((_, n) => !written[n]).map((block) => block.id);
    if (failed.length > 0) {
        deps.logger.warn(`[DA.live] Left out of the block list, no page: ${failed.join(', ')}`);
    }
    return input.blocks.flatMap((block, n) => {
        const page = written[n];
        return page ? [{ block, page }] : [];
    });
}

/**
 * What the block's page is (kept, copied, a real use or shipped: an example; else the
 * placeholder), or undefined when it got none. Throws only an
 * expired DA.live sign-in. The only page bodies written are a copied page, `blockDoc`'s and
 * `shippedExamplePage`'s (pinned in `blockExampleConvention.test.ts`). DA.live writes over any
 * page at the path whatever `overwrite` says (`createSource`), so what keeps a page someone
 * wrote is that a block with one arrives as `existing` and is not written at all; only a page
 * Demo Builder generated (`replacePageIds`, `oldStubPages.ts`) is written over.
 */
async function writeBlockPage(
    deps: StorefrontLibraryDeps,
    dest: Destination,
    block: StorefrontBlock,
    input: StorefrontLibraryInput,
): Promise<BlockPage | undefined> {
    const { example } = block;
    const { replacePageIds, replacedPages } = input;
    try {
        if (example.kind === 'existing') return 'example';
        if (example.kind === 'adobe' || example.kind === 'library') {
            const page = `/${BLOCK_PAGES}/${block.id}`;
            if (await copyPreviewPage(deps.copyOps, dest, example.source, page)) return 'example';
        }
        const { html, kind } = await pageBody(block, input);
        const docPath = `${BLOCK_PAGES}/${block.id}.html`;
        // Same body as the generated page already there: DA.live would only add a version.
        const current = replacedPages?.get(block.id);
        if (current !== undefined && samePage(current, html)) return kind;
        const result = replacePageIds?.has(block.id)
            ? await deps.sourceOps.createSource(dest.org, dest.site, docPath, html, { overwrite: true })
            : await deps.sourceOps.createSource(dest.org, dest.site, docPath, html);
        return result.success ? kind : undefined;
    } catch (error) {
        if (error instanceof DaLiveAuthError) throw error;
        deps.logger.warn(`[DA.live] No page for block ${block.id}: ${(error as Error).message}`);
        return undefined;
    }
}

/**
 * The page Demo Builder writes for a block it does not copy: a shipped example as shipped, a
 * real use through `blockDoc`; a placeholder, or a copy that failed, gets the code's shape.
 */
async function pageBody(
    block: StorefrontBlock,
    { placeholderFor, photos = [] }: StorefrontLibraryInput,
): Promise<{ html: string; kind: BlockPage }> {
    const { example } = block;
    if (example.kind === 'shipped') {
        const { page, photosMissing } = shippedExamplePage(example.example, photos);
        return { html: page, kind: photosMissing ? 'example-without-photos' : 'example' };
    }
    if (example.kind === 'real-use' || example.kind === 'library-use') {
        return { html: blockDoc(block.id, { examples: example.examples }), kind: 'example' };
    }
    const analysis = await placeholderFor(block.id);
    return { html: blockDoc(block.id, { analysis }), kind: 'placeholder' };
}

async function writeBlocksSheet(
    deps: StorefrontLibraryDeps,
    dest: Destination,
    existing: SheetRow[],
    listed: StorefrontBlock[],
): Promise<boolean> {
    const ours = listed.map((block) => ({
        name: block.title,
        path: contentUrl(dest, `${BLOCK_PAGES}/${block.id}`),
    }));
    const rows = blockSheetRows(existing, ours, contentUrl(dest, `${BLOCK_PAGES}/`));
    const result = await deps.sheet.createJsonSpreadsheet(
        dest.org, dest.site, BLOCK_PAGES, sheetColumns(rows), rows, { overwrite: true },
    );
    return result.success;
}

/** One site-config write: Blocks, and Templates when written. The EDS-38 warning, if refused. */
async function registerLists(
    deps: StorefrontLibraryDeps,
    dest: Destination,
    withTemplates: boolean,
): Promise<string | undefined> {
    const entries = [{ title: 'Blocks', path: contentUrl(dest, BLOCKS_SHEET) }];
    if (withTemplates) {
        entries.push({ title: 'Templates', path: contentUrl(dest, TEMPLATES_SHEET) });
    }
    // keepOtherRows: rows the SC added to the config's library (plugins, other lists) survive.
    const result = await deps.configOps.updateSiteConfig(
        dest.org, dest.site, entries, { keepOtherRows: true },
    );
    const warning = paletteEmptyWarning(result);
    if (warning) deps.logger.warn(`[DA.live] ${warning}`);
    return warning;
}
