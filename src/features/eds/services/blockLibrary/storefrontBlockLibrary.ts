/**
 * The one door that builds a storefront's DA.live block library: creation, reset, Refresh Blocks,
 * Configure and the import path's content setup all come here (pinned in
 * `tests/templates/spine-chokepoints.test.ts`).
 *
 * It gathers what the list is computed from (the storefront's `blocks/<id>/` folders, Adobe's
 * library from whichever of the package's content sources publishes it, the installed libraries'
 * sites and pages, the real uses of blocks and the photos on the storefront's own pages, the
 * examples Demo Builder ships (`shippedBlockExamples.ts`), the pages the storefront already has,
 * where a page Demo Builder generated counts as none and is replaced (`oldStubPages.ts`)),
 * builds the list with `buildStorefrontBlockList`, and writes it with
 * `writeStorefrontBlockLibrary`.
 * Design: `.rptc/plans/block-library-without-universal-editor/step-02.md`.
 */

import { readAdobeContentLibrary, type AdobeContentLibrary } from './adobeContentLibrary';
import { analyzeBlockCode, type BlockCodeAnalysis } from './blockCode';
import { displayName } from './blockDoc';
import type { BlockUse } from './blockUseIndex';
import {
    blockFolders,
    probeLibraryPages,
    readInstalledLibraries,
    readLibrarySiteUses,
    readUseIndex,
} from './exampleSources';
import { findReplaceablePages } from './oldStubPages';
import { loadShippedBlockExamples, type ShippedExamples } from './shippedBlockExamples';
import { siteReader, type SiteReader } from './siteReads';
import type { SiteRef } from './siteRef';
import { buildStorefrontBlockList, type InstalledLibrary } from './storefrontBlockList';
import type { BlockLibraryResult } from './storefrontLibraryWriter';
import type { UnresolvedContentSource } from '@/features/eds/services/contentIndex';
import type { DaLiveBlockLibraryOperations } from '@/features/eds/services/daLive/daLiveBlockLibraryOperations';
import type { GitHubFileOperations } from '@/features/eds/services/github/githubFileOperations';
import { DaLiveAuthError } from '@/features/eds/services/types';
import type { Logger } from '@/types/logger';

/** What the build reads and writes through. */
export interface StorefrontBlockLibraryDeps {
    blockLibOps: Pick<
        DaLiveBlockLibraryOperations,
        | 'getBlocksWithDocs'
        | 'readBlockDocPage'
        | 'readBlocksSheetRows'
        | 'writeStorefrontBlockLibrary'
    >;
    files: Pick<GitHubFileOperations, 'listRepoFiles' | 'getFileContent'>;
    /** Reads published sites (Adobe's library, library pages, content indexes, pages). */
    fetchImpl: typeof fetch;
    logger: Logger;
    /** The examples Demo Builder ships; the bundled ones when absent. */
    shippedExamples?: ShippedExamples;
}

/** The storefront the library is built for, and the sites its examples may come from. */
export interface StorefrontBlockLibraryParams {
    daLiveOrg: string;
    daLiveSite: string;
    /** The storefront's GitHub repository. */
    repo: { owner: string; repo: string };
    /** The package's content source; tried first for Adobe's library. */
    contentSource?: UnresolvedContentSource;
    /** The package's account content source (B2B account pages), tried second. */
    accountContentSource?: SiteRef;
    /** The block libraries the storefront has (`withAlwaysIncludedBlockLibraries`). */
    blockLibraries: string[];
    /** An added demo's content site: example pages for every block. */
    demoSite?: SiteRef;
}

/** The storefront's code is read at its default branch, as the block install writes it. */
const STOREFRONT_BRANCH = 'main';
const REPO_UNREADABLE = 'The storefront\'s blocks could not be read from GitHub, so the block '
    + 'list in DA.live was left unchanged.';

/** Builds and writes the library. Never throws but for an expired DA.live sign-in. */
export async function buildStorefrontBlockLibrary(
    deps: StorefrontBlockLibraryDeps,
    params: StorefrontBlockLibraryParams,
): Promise<BlockLibraryResult> {
    const { daLiveOrg: org, daLiveSite: site } = params;
    const repoBlockIds = await readRepoBlockIds(deps, params.repo);
    if (!repoBlockIds) return { success: false, blocksCount: 0, paths: [], error: REPO_UNREADABLE };
    const read = siteReader(deps.fetchImpl);
    const adobe = await findAdobeLibrary(params, read);
    const adobeIds = adobe?.library.blocks.map((entry) => entry.id) ?? [];
    const allIds = [...new Set([...adobeIds, ...repoBlockIds])];
    const { existingPageIds, replacePageIds, replacedPages } =
        await readExistingPages(deps, org, site, allIds);
    const wanted = new Set(repoBlockIds.filter((id) =>
        !existingPageIds.has(id) && !adobeIds.includes(id)));
    const { photos, ...sources } = await readExampleSources(deps, params, repoBlockIds, wanted, read);
    const blocks = buildStorefrontBlockList({
        adobeBlocks: adobe?.library.blocks ?? [],
        adobeSite: adobe?.site,
        repoBlockIds,
        existingPageIds,
        shipped: deps.shippedExamples ?? loadShippedBlockExamples(),
        ...sources,
    });
    const templates = adobe && adobe.library.templates.length > 0
        ? { entries: adobe.library.templates, source: adobe.site }
        : undefined;
    return deps.blockLibOps.writeStorefrontBlockLibrary(org, site, {
        blocks,
        ...(templates ? { templates } : {}),
        replacePageIds,
        replacedPages,
        placeholderFor: (blockId) => readBlockCode(deps, params.repo, blockId),
        photos,
    });
}

/**
 * The blocks with a page to keep, and those whose page Demo Builder generated (`oldStubPages.ts`):
 * such a page counts as none, so the convention picks a real example and the writer replaces it.
 */
async function readExistingPages(
    deps: StorefrontBlockLibraryDeps,
    org: string,
    site: string,
    ids: string[],
): Promise<{
    existingPageIds: Set<string>;
    replacePageIds: Set<string>;
    replacedPages: Map<string, string>;
}> {
    const found = await deps.blockLibOps.getBlocksWithDocs(org, site, ids.map((id) => ({ id })));
    const rowNames = found.length > 0
        ? await readRowNames(deps, org, site)
        : new Map<string, string>();
    const replacedPages = await findReplaceablePages(
        found,
        (id) => deps.blockLibOps.readBlockDocPage(org, site, id),
        (id) => [displayName(id), rowNames.get(id) ?? displayName(id)],
    );
    const existingPageIds = new Set(found.filter((id) => !replacedPages.has(id)));
    return { existingPageIds, replacePageIds: new Set(replacedPages.keys()), replacedPages };
}

/**
 * Each block's row name in the blocks sheet, by the block id its path ends in: the old stub held
 * the same title. Empty when the sheet cannot be read (the writer then refuses to write); an
 * expired DA.live sign-in is let through.
 */
async function readRowNames(
    deps: StorefrontBlockLibraryDeps,
    org: string,
    site: string,
): Promise<Map<string, string>> {
    try {
        const rows = (await deps.blockLibOps.readBlocksSheetRows(org, site)) ?? [];
        return new Map(rows.flatMap((row) => {
            const id = /\/\.da\/library\/blocks\/([^/]+)$/.exec(row.path ?? '')?.[1];
            return id && row.name ? [[id, row.name] as const] : [];
        }));
    } catch (error) {
        if (error instanceof DaLiveAuthError) throw error;
        deps.logger.warn(`[BlockLibrary] Block list not read: ${(error as Error).message}`);
        return new Map();
    }
}

/** The storefront's block folders, or undefined when its repository cannot be listed. */
async function readRepoBlockIds(
    deps: StorefrontBlockLibraryDeps,
    repo: StorefrontBlockLibraryParams['repo'],
): Promise<string[] | undefined> {
    try {
        return blockFolders(await deps.files.listRepoFiles(repo.owner, repo.repo, STOREFRONT_BRANCH));
    } catch (error) {
        deps.logger.warn(`[BlockLibrary] Storefront blocks not read: ${(error as Error).message}`);
        return undefined;
    }
}

/** The first of the package's content sources that publishes Adobe's library, if any. */
async function findAdobeLibrary(
    params: StorefrontBlockLibraryParams,
    read: SiteReader,
): Promise<{ site: SiteRef; library: AdobeContentLibrary } | undefined> {
    const candidates = [params.contentSource, params.accountContentSource]
        .flatMap((source) => (source ? [{ org: source.org, site: source.site }] : []));
    for (const site of candidates) {
        const library = await readAdobeContentLibrary(site, read.json);
        if (library.blocks.length > 0) return { site, library };
    }
    return undefined;
}

interface ExampleSources {
    libraries: InstalledLibrary[];
    librarySitePages: Map<string, string>;
    librarySiteUses: Map<string, BlockUse>;
    contentSourceUses: Map<string, BlockUse>;
    /** Photos on the storefront's content source pages, for shipped examples' image cells. */
    photos: string[];
}

/** The library and real-use sources, read only when some block still needs an example. */
async function readExampleSources(
    deps: StorefrontBlockLibraryDeps,
    params: StorefrontBlockLibraryParams,
    repoBlockIds: string[],
    wanted: Set<string>,
    read: SiteReader,
): Promise<ExampleSources> {
    if (wanted.size === 0) {
        return {
            libraries: [], librarySitePages: new Map(),
            librarySiteUses: new Map(), contentSourceUses: new Map(), photos: [],
        };
    }
    const libraries = await readInstalledLibraries(
        deps, params.blockLibraries, repoBlockIds, params.demoSite,
    );
    const librarySites = libraries.flatMap((library) => (library.site ? [library.site] : []));
    const contentSites = [params.contentSource, params.accountContentSource]
        .flatMap((source) => (source ? [source] : []));
    const librarySitePages = await probeLibraryPages(libraries, wanted, read);
    const librarySiteUses = await readLibrarySiteUses(librarySites, deps.fetchImpl, deps.logger);
    const own = await readUseIndex(contentSites, deps.fetchImpl, deps.logger);
    return {
        libraries, librarySitePages, librarySiteUses, contentSourceUses: own.uses, photos: own.photos,
    };
}

/** The block's code shape from the storefront's files; a file that cannot be read is absent. */
function readBlockCode(
    deps: StorefrontBlockLibraryDeps,
    repo: StorefrontBlockLibraryParams['repo'],
    blockId: string,
): Promise<BlockCodeAnalysis> {
    return analyzeBlockCode(blockId, async (path) => {
        try {
            const file = await deps.files.getFileContent(repo.owner, repo.repo, path, STOREFRONT_BRANCH);
            return file?.content;
        } catch {
            return undefined;
        }
    });
}
