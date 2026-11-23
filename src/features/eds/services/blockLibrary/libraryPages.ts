/**
 * The page-level steps the library build repeats for blocks and templates: copying a page from a
 * content site's preview, a site's content.da.live URL, and working through items in batches.
 */

import type { ExamplePage } from './storefrontBlockList';
import { CONTENT_COPY_BATCH_SIZE } from '@/features/eds/services/daLive/daLiveConstants';
import type { DaLiveContentCopy } from '@/features/eds/services/daLive/daLiveContentCopy';

/** The DA.live site written to, with the token the copies use. */
export interface Destination {
    org: string;
    site: string;
    token: string;
}

/** A path on the destination as DA.live's palette names it. */
export function contentUrl(dest: Destination, path: string): string {
    return `https://content.da.live/${dest.org}/${dest.site}/${path}`;
}

/**
 * Copies a page from a content site to the destination. PREVIEW, not published: library pages
 * are previewed and left there, so the published host 404s for them.
 */
export function copyPreviewPage(
    copyOps: Pick<DaLiveContentCopy, 'copySingleFile'>,
    dest: Destination,
    source: ExamplePage,
    destPath: string,
): Promise<boolean> {
    const from = { org: source.org, site: source.site, preview: true };
    const to = { org: dest.org, site: dest.site };
    return copyOps.copySingleFile(dest.token, from, source.path, to, destPath);
}

/**
 * Runs `work` over the items `size` at a time (the doc-page writes' batch by default); results
 * in the items' order.
 */
export async function inBatches<T, R>(
    items: T[],
    work: (item: T) => Promise<R>,
    size: number = CONTENT_COPY_BATCH_SIZE,
): Promise<R[]> {
    const results: R[] = [];
    for (let i = 0; i < items.length; i += size) {
        results.push(...await Promise.all(items.slice(i, i + size).map(work)));
    }
    return results;
}
