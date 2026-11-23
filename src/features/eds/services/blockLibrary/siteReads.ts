/**
 * Reads from published Edge Delivery sites for the library build: a page's text, a sheet's JSON,
 * and a site's page list from its content index. Every read answers undefined (or no pages) on
 * a 404, a timeout or a network failure, so a site that cannot be read only leaves its source out.
 */

import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import {
    contentIndexUrl,
    resolveContentIndex,
    type UnresolvedContentSource,
} from '@/features/eds/services/contentIndex';
import type { Logger } from '@/types/logger';

/** A page's text and a sheet's JSON, undefined when the URL does not answer. */
export interface SiteReader {
    text: (url: string) => Promise<string | undefined>;
    json: (url: string) => Promise<unknown>;
}

async function readBody<T>(
    fetchImpl: typeof fetch,
    url: string,
    body: (response: Response) => Promise<T>,
): Promise<T | undefined> {
    try {
        const response = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUTS.QUICK) });
        return response.ok ? await body(response) : undefined;
    } catch {
        return undefined;
    }
}

/** The two readers over one fetch. */
export function siteReader(fetchImpl: typeof fetch): SiteReader {
    return {
        text: (url) => readBody(fetchImpl, url, (response) => response.text()),
        json: (url) => readBody(fetchImpl, url, (response) => response.json()),
    };
}

function isPathRow(row: unknown): row is { path: string } {
    return typeof row === 'object' && row !== null && 'path' in row && typeof row.path === 'string';
}

/** The page paths a site's content index lists, in its order; none when it has no index. */
export async function sitePagePaths(
    site: UnresolvedContentSource,
    fetchImpl: typeof fetch,
    logger: Logger,
): Promise<string[]> {
    const index = await resolveContentIndex(site, fetchImpl, logger);
    if (!index.found) return [];
    const url = contentIndexUrl({ org: site.org, site: site.site, indexPath: index.indexPath });
    const body = await siteReader(fetchImpl).json(url);
    const rows = typeof body === 'object' && body !== null && 'data' in body ? body.data : [];
    return Array.isArray(rows) ? rows.filter(isPathRow).map((row) => row.path) : [];
}
