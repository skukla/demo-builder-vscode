/**
 * The storefront's block list, and where each block's example page comes from.
 *
 * Pure: every source arrives already read. The list is Adobe's blocks the storefront has a folder
 * for (plus {@link CORE_CONTENT_BLOCKS}) in Adobe's order, then every other block folder the
 * storefront has, A to Z, with the `commerce-*` blocks last. Each example
 * is the first of {@link EXAMPLE_KINDS} that exists; the last, `placeholder`, is built by the
 * caller from the block's code, as DA.live's Import Blocks does.
 * Design: `.rptc/plans/block-library-without-universal-editor/step-02.md`.
 */

import type { LibraryEntry } from './adobeContentLibrary';
import { displayName } from './blockDoc';
import { isBlockName, type VariantExample } from './blockTable';
import type { BlockUse } from './blockUseIndex';
import {
    findShippedExample,
    type ShippedBlockExample,
    type ShippedExamples,
} from './shippedBlockExamples';
import type { SiteRef } from './siteRef';

/**
 * Content structures EDS handles in its core script, with no `blocks/<id>/` folder, so Adobe's
 * entry for one is listed though the storefront has no code for it. Checked 2026-11-23:
 * `gh api 'repos/adobe-commerce/boilerplate-b2b-template/contents/blocks?ref=f8eb94d'` lists 76
 * folders, `fragment`, `hero` and `columns` among them, and no `metadata` or `section-metadata`.
 */
export const CORE_CONTENT_BLOCKS: ReadonlySet<string> = new Set(['metadata', 'section-metadata']);

/**
 * The storefront's block folders the list takes: names following the block-name rule (EDS
 * block class names do), once each. Any other folder is not a block the palette can place.
 */
export function listableBlockIds(repoBlockIds: string[]): string[] {
    return [...new Set(repoBlockIds)].filter(isBlockName);
}

/**
 * The example sources, in the order the convention tries them: the page already there, Adobe's
 * page, the library's own page, a real use on the storefront's own content source pages, the
 * example Demo Builder ships, a real use on the library's site, the placeholder.
 */
export const EXAMPLE_KINDS = [
    'existing', 'adobe', 'library', 'real-use', 'shipped', 'library-use', 'placeholder',
] as const;

/** A page on a content site to copy the example from. */
export interface ExamplePage extends SiteRef {
    path: string;
}

/** Where one block's example page comes from. */
export type BlockExample =
    | { kind: 'existing' }
    | { kind: 'adobe'; source: ExamplePage }
    | { kind: 'real-use'; examples: VariantExample[]; from: string }
    | { kind: 'shipped'; source: string; example: ShippedBlockExample }
    | { kind: 'library'; source: ExamplePage }
    | { kind: 'library-use'; examples: VariantExample[]; from: string }
    | { kind: 'placeholder' };

/** One palette entry. */
export interface StorefrontBlock {
    id: string;
    title: string;
    example: BlockExample;
}

/**
 * A block library installed on the storefront: its id (absent for an added demo's site), its
 * content site when it has one, and the storefront blocks it has.
 */
export interface InstalledLibrary {
    id?: string;
    site?: SiteRef;
    blockIds: string[];
}

/** Everything the list is computed from. */
export interface StorefrontBlockListInput {
    adobeBlocks: LibraryEntry[];
    /** Adobe's source site; absent when the package has none. */
    adobeSite?: SiteRef;
    /** Every `blocks/<id>/` folder in the storefront's repository. */
    repoBlockIds: string[];
    libraries: InstalledLibrary[];
    /** Blocks that already have an example page on the storefront. */
    existingPageIds: Set<string>;
    /**
     * Real uses found on the library sites, keyed `${org}/${site}/${blockId}` like
     * `librarySitePages`, so a block's use comes from its own library's site only.
     */
    librarySiteUses: Map<string, BlockUse>;
    /** Real uses found on the storefront's content source. */
    contentSourceUses: Map<string, BlockUse>;
    /** `${org}/${site}/${blockId}` of a library site with a doc page for the block, to its path. */
    librarySitePages: Map<string, string>;
    /** The examples Demo Builder ships (`shippedBlockExamples.ts`). */
    shipped: ShippedExamples;
}

const ADOBE_BLOCK_PAGE = '/docs/library/blocks/';

/** Builds the palette: list order, titles and each block's example source. */
export function buildStorefrontBlockList(input: StorefrontBlockListInput): StorefrontBlock[] {
    const repoIds = listableBlockIds(input.repoBlockIds);
    const inRepo = new Set(repoIds);
    // An Adobe entry follows the code too: listed only when its folder is there (or it is a
    // core content structure), so a block whose code was removed does not come back.
    const adobe = input.adobeBlocks
        .filter((entry) => inRepo.has(entry.id) || CORE_CONTENT_BLOCKS.has(entry.id))
        .map((entry) => ({ ...entry, isAdobe: true }));
    const adobeIds = new Set(adobe.map((entry) => entry.id));
    const rest = sortOthers(repoIds.filter((id) => !adobeIds.has(id)))
        .map((id) => ({ id, title: displayName(id), isAdobe: false }));
    return [...adobe, ...rest].map(({ id, title, isAdobe }) => ({
        id,
        title,
        example: chooseExample(id, isAdobe, input),
    }));
}

function sortOthers(ids: string[]): string[] {
    const isCommerce = (id: string): boolean => id.startsWith('commerce-');
    const byName = (a: string, b: string): number => a.localeCompare(b);
    return [
        ...ids.filter((id) => !isCommerce(id)).sort(byName),
        ...ids.filter(isCommerce).sort(byName),
    ];
}

function chooseExample(id: string, isAdobe: boolean, input: StorefrontBlockListInput): BlockExample {
    if (input.existingPageIds.has(id)) return { kind: 'existing' };
    if (isAdobe && input.adobeSite) {
        return { kind: 'adobe', source: { ...input.adobeSite, path: `${ADOBE_BLOCK_PAGE}${id}` } };
    }
    const withBlock = input.libraries.filter((library) => library.blockIds.includes(id));
    const librarySites = withBlock.flatMap((library) => (library.site ? [library.site] : []));
    const libraryPage = findOnSites(id, librarySites, input.librarySitePages);
    if (libraryPage) {
        return { kind: 'library', source: { ...libraryPage.site, path: libraryPage.found } };
    }
    const ownUse = input.contentSourceUses.get(id);
    if (ownUse) return { kind: 'real-use', examples: ownUse.examples, from: ownUse.path };
    const libraryIds = withBlock.flatMap((library) => (library.id ? [library.id] : []));
    const shipped = findShippedExample(id, libraryIds, input.shipped);
    if (shipped) return { kind: 'shipped', ...shipped };
    const use = findOnSites(id, librarySites, input.librarySiteUses)?.found;
    if (use) return { kind: 'library-use', examples: use.examples, from: use.path };
    return { kind: 'placeholder' };
}

/** The first of the sites with an entry for the block in `found` (keyed `org/site/id`). */
function findOnSites<T>(
    id: string,
    sites: SiteRef[],
    found: Map<string, T>,
): { site: SiteRef; found: T } | undefined {
    for (const site of sites) {
        const entry = found.get(`${site.org}/${site.site}/${id}`);
        if (entry) return { site, found: entry };
    }
    return undefined;
}
