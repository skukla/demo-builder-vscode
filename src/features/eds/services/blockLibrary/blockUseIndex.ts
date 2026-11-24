/**
 * Indexes the real uses of blocks on a site: for each block id, the first page that uses it and
 * the first example seen for each style variant, across pages in page order. That is what
 * DA.live's Import Blocks puts in a block doc (`blockDoc` takes the first example per variant).
 * Every block class is recorded; nothing is excluded. This is the "real use" example source.
 */

import { pageBlocks, type VariantExample } from './blockTable';
import { previewOrigin, type SiteRef } from './siteRef';

/** Where a block is first used, and its first example of each variant. */
export interface BlockUse {
    path: string;
    examples: VariantExample[];
}

/** Pages read at once: a few in parallel, not the whole site at once. */
export const PAGE_FETCH_CONCURRENCY = 4;

/**
 * Reads each page's `.plain.html` (sheets skipped) and records every block it finds. The first
 * page in the given order wins; a page that cannot be read is skipped.
 */
export async function buildBlockUseIndex(
    site: SiteRef,
    pagePaths: string[],
    fetchText: (url: string) => Promise<string | undefined>,
): Promise<Map<string, BlockUse>> {
    const origin = previewOrigin(site);
    const paths = pagePaths.filter((path) => !path.endsWith('.json'));
    const index = new Map<string, BlockUse>();
    for (let i = 0; i < paths.length; i += PAGE_FETCH_CONCURRENCY) {
        const batch = paths.slice(i, i + PAGE_FETCH_CONCURRENCY);
        const pages = await Promise.all(
            batch.map((path) => readPage(fetchText, `${origin}${plainHtmlPath(path)}`)),
        );
        batch.forEach((path, n) => addPageBlocks(index, path, pages[n]));
    }
    return index;
}

/** `/cart` reads `/cart.plain.html`; a folder path such as `/` reads its `index.plain.html`. */
function plainHtmlPath(path: string): string {
    return path.endsWith('/') ? `${path}index.plain.html` : `${path}.plain.html`;
}

const IMAGE_SRC = /<img\b[^>]*?\ssrc="([^"]+)"/g;
const WEB_ADDRESS = /^https?:\/\/[^\s"'<>]+$/;

/**
 * The photos in the uses, each as an http(s) address (a page's `./media_…` resolved against the
 * page it is on, its resize query dropped), once each in the order first seen. These are the
 * site's own images, for a shipped example's image cells (`shippedBlockExamples.ts`).
 */
export function photosInUses(site: SiteRef, index: ReadonlyMap<string, BlockUse>): string[] {
    const origin = previewOrigin(site);
    const photos = new Set<string>();
    for (const { path, examples } of index.values()) {
        const page = `${origin}${plainHtmlPath(path)}`;
        for (const { html } of examples) {
            for (const [, src] of html.matchAll(IMAGE_SRC)) {
                const address = photoAddress(src, page);
                if (address) photos.add(address);
            }
        }
    }
    return [...photos];
}

function photoAddress(src: string, page: string): string | undefined {
    try {
        const url = new URL(src, page);
        url.search = '';
        url.hash = '';
        const address = url.toString();
        return WEB_ADDRESS.test(address) ? address : undefined;
    } catch {
        return undefined;
    }
}

async function readPage(
    fetchText: (url: string) => Promise<string | undefined>,
    url: string,
): Promise<string | undefined> {
    try {
        return await fetchText(url);
    } catch {
        return undefined;
    }
}

function addPageBlocks(index: Map<string, BlockUse>, path: string, page: string | undefined): void {
    if (!page) return;
    for (const { name, variant, html } of pageBlocks(page)) {
        const use = index.get(name) ?? { path, examples: [] };
        index.set(name, use);
        if (!use.examples.some((example) => example.variant === variant)) {
            use.examples.push({ variant, html });
        }
    }
}
