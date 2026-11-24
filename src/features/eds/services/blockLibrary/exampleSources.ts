/**
 * Where a block's example can come from besides Adobe's library, read for the library build:
 * each installed block library's content site and the storefront blocks it provides, the pages
 * those sites keep for a block, and the real uses of blocks on a list of sites. Every read that
 * fails leaves its source out (logged); none throws.
 * Design: `.rptc/plans/block-library-without-universal-editor/step-02.md`.
 */

import {
    buildBlockUseIndex,
    PAGE_FETCH_CONCURRENCY,
    photosInUses,
    type BlockUse,
} from './blockUseIndex';
import { inBatches } from './libraryPages';
import { siteReader, sitePagePaths, type SiteReader } from './siteReads';
import { previewOrigin, type SiteRef } from './siteRef';
import type { InstalledLibrary } from './storefrontBlockList';
import { refOfSource } from '@/core/releases/componentRelease';
import {
    getBlockLibraryContentSource,
    getBlockLibrarySource,
} from '@/features/components/services/blockLibraryLoader';
import type { UnresolvedContentSource } from '@/features/eds/services/contentIndex';
import type { GitHubFileOperations } from '@/features/eds/services/github/githubFileOperations';
import type { AddonSource } from '@/types/demoPackages';
import type { Logger } from '@/types/logger';

/** Where a library site may keep a block's page, in the order tried. */
const LIBRARY_PAGE_FOLDERS = ['/docs/library/blocks/', '/.da/library/blocks/'] as const;

/** What reading a library's repository needs. */
export interface LibraryRepoDeps {
    files: Pick<GitHubFileOperations, 'listRepoFiles'>;
    logger: Logger;
}

/** The block ids of a repository listing: every `blocks/<id>/` folder, in first-seen order. */
export function blockFolders(entries: Array<{ path: string }>): string[] {
    const ids = new Set<string>();
    for (const { path } of entries) {
        const [top, id, rest] = path.split('/');
        if (top === 'blocks' && id && rest !== undefined) ids.add(id);
    }
    return [...ids];
}

/**
 * The installed libraries, each with its id, its content site when it has one, and the
 * storefront blocks it provides (a library with no site still has shipped examples), then an
 * added demo's content site, which shows every block the storefront has.
 */
export async function readInstalledLibraries(
    deps: LibraryRepoDeps,
    libraryIds: string[],
    repoBlockIds: string[],
    demoSite?: SiteRef,
): Promise<InstalledLibrary[]> {
    const storefront = new Set(repoBlockIds);
    const read = await Promise.all(libraryIds.map(async (id) => {
        const site = getBlockLibraryContentSource(id);
        const source = getBlockLibrarySource(id);
        if (!source) return [];
        const blockIds = (await libraryBlockIds(deps, id, source)).filter((b) => storefront.has(b));
        return [{ id, ...(site ? { site } : {}), blockIds }];
    }));
    const libraries: InstalledLibrary[] = read.flat();
    return demoSite ? [...libraries, { site: demoSite, blockIds: repoBlockIds }] : libraries;
}

/** The library's block folders at the ref its install reads; none when unreadable. */
async function libraryBlockIds(
    deps: LibraryRepoDeps,
    libraryId: string,
    source: AddonSource,
): Promise<string[]> {
    try {
        const { ref } = await refOfSource(source);
        return blockFolders(await deps.files.listRepoFiles(source.owner, source.repo, ref));
    } catch (error) {
        deps.logger.warn(`[BlockLibrary] Blocks of ${libraryId} not read: ${(error as Error).message}`);
        return [];
    }
}

/**
 * For each wanted block a library provides, the first page its site keeps for it, keyed
 * `${org}/${site}/${blockId}` (the shape `buildStorefrontBlockList` reads).
 */
export async function probeLibraryPages(
    libraries: InstalledLibrary[],
    wanted: Set<string>,
    read: SiteReader,
): Promise<Map<string, string>> {
    const probes = libraries.flatMap(({ site, blockIds }) => (site
        ? blockIds.filter((id) => wanted.has(id)).map((id) => ({ site, id }))
        : []));
    const found = await inBatches(
        probes, ({ site, id }) => firstLibraryPage(site, id, read), PAGE_FETCH_CONCURRENCY,
    );
    const pages = new Map<string, string>();
    probes.forEach(({ site, id }, n) => {
        const path = found[n];
        if (path) pages.set(`${site.org}/${site.site}/${id}`, path);
    });
    return pages;
}

async function firstLibraryPage(
    site: SiteRef,
    blockId: string,
    read: SiteReader,
): Promise<string | undefined> {
    for (const folder of LIBRARY_PAGE_FOLDERS) {
        const path = `${folder}${blockId}`;
        if ((await read.text(`${previewOrigin(site)}${path}.plain.html`)) !== undefined) return path;
    }
    return undefined;
}

/**
 * The real uses on the sites, read in order (the first site that uses a block wins), and the
 * photos in them (`photosInUses`).
 */
export async function readUseIndex(
    sites: UnresolvedContentSource[],
    fetchImpl: typeof fetch,
    logger: Logger,
): Promise<{ uses: Map<string, BlockUse>; photos: string[] }> {
    const uses = new Map<string, BlockUse>();
    const photos = new Set<string>();
    const read = siteReader(fetchImpl);
    for (const site of uniqueSites(sites)) {
        const paths = await sitePagePaths(site, fetchImpl, logger);
        const index = await buildBlockUseIndex(site, paths, read.text);
        index.forEach((use, id) => {
            if (!uses.has(id)) uses.set(id, use);
        });
        photosInUses(site, index).forEach((photo) => photos.add(photo));
    }
    return { uses, photos: [...photos] };
}

/**
 * The real uses on each library site, keyed `${org}/${site}/${blockId}` (the shape
 * `buildStorefrontBlockList` reads), so a library block's use comes from its own library's site.
 */
export async function readLibrarySiteUses(
    sites: SiteRef[],
    fetchImpl: typeof fetch,
    logger: Logger,
): Promise<Map<string, BlockUse>> {
    const uses = new Map<string, BlockUse>();
    for (const site of uniqueSites(sites)) {
        const { uses: index } = await readUseIndex([site], fetchImpl, logger);
        index.forEach((use, id) => uses.set(`${site.org}/${site.site}/${id}`, use));
    }
    return uses;
}

function uniqueSites<T extends SiteRef>(sites: T[]): T[] {
    const seen = new Set<string>();
    return sites.filter(({ org, site }) => {
        const key = `${org}/${site}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}
