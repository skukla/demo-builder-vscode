/**
 * The storefront's block list, and where each block's example page comes from.
 *
 * Pure: every source arrives already read. The list is Adobe's blocks in Adobe's order, then every
 * other block folder the storefront has, A to Z, with the `commerce-*` blocks last. Each example
 * is the first of {@link EXAMPLE_KINDS} that exists; the last, `placeholder`, is built by the
 * caller from the block's code, as DA.live's Import Blocks does.
 * Design: `.rptc/plans/block-library-without-universal-editor/step-02.md`.
 */

import type { LibraryEntry } from './adobeContentLibrary';
import { displayName } from './blockDoc';
import type { VariantExample } from './blockTable';
import type { BlockUse } from './blockUseIndex';
import type { SiteRef } from './siteRef';

/** The example sources, in the order the convention tries them. */
export const EXAMPLE_KINDS = ['existing', 'adobe', 'library', 'real-use', 'placeholder'] as const;

/** A page on a content site to copy the example from. */
export interface ExamplePage extends SiteRef {
    path: string;
}

/** Where one block's example page comes from. */
export type BlockExample =
    | { kind: 'existing' }
    | { kind: 'adobe'; source: ExamplePage }
    | { kind: 'library'; source: ExamplePage }
    | { kind: 'real-use'; examples: VariantExample[]; from: string }
    | { kind: 'placeholder' };

/** One palette entry. */
export interface StorefrontBlock {
    id: string;
    title: string;
    example: BlockExample;
}

/** A block library installed on the storefront; `site` is its content site, when it has one. */
export interface InstalledLibrary {
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
}

const ADOBE_BLOCK_PAGE = '/docs/library/blocks/';

/** Builds the palette: list order, titles and each block's example source. */
export function buildStorefrontBlockList(input: StorefrontBlockListInput): StorefrontBlock[] {
    const adobeIds = new Set(input.adobeBlocks.map((entry) => entry.id));
    const adobe = input.adobeBlocks.map((entry) => ({ ...entry, isAdobe: true }));
    const rest = sortOthers([...new Set(input.repoBlockIds)].filter((id) => !adobeIds.has(id)))
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
    const librarySites = sitesOfLibrariesWith(id, input.libraries);
    const libraryPage = findOnSites(id, librarySites, input.librarySitePages);
    if (libraryPage) {
        return { kind: 'library', source: { ...libraryPage.site, path: libraryPage.found } };
    }
    const use = findOnSites(id, librarySites, input.librarySiteUses)?.found
        ?? input.contentSourceUses.get(id);
    if (use) return { kind: 'real-use', examples: use.examples, from: use.path };
    return { kind: 'placeholder' };
}

function sitesOfLibrariesWith(id: string, libraries: InstalledLibrary[]): SiteRef[] {
    return libraries.flatMap((library) =>
        library.site && library.blockIds.includes(id) ? [library.site] : []);
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
