/**
 * The content index: where an Edge Delivery site lists its pages, and the ONE
 * place this repo says where to look.
 *
 * The copy step (creation, import, reset) reads a site's index to know which
 * pages to copy; the Add a demo package probe reads it to say whether a colleague's
 * pages are published; the reset door reads it to know whether the copy can
 * run. The shipped brands publish theirs under two different names, and a
 * site names its own path in its catalog entry or description file. Found live
 * on 2026-09-12: the probe and the copy step each spelled the default
 * themselves, so a demo built from Bodea (which publishes `/sitemap.json`)
 * read as "no published pages" and would have copied nothing. Every reader
 * now comes here; `tests/sop/content-index-path.test.ts` keeps it that way.
 *
 * @module features/eds/services/contentIndex
 */

import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types/logger';

/**
 * The paths a site may publish its index under, in the order they are tried
 * when a source names none. Each is one the shipped brands use.
 */
export const CONTENT_INDEX_PATHS = ['/full-index.json', '/sitemap.json', '/query-index.json'] as const;

/**
 * The path recorded when a repository names no site path and nothing answers:
 * the row still says where to look, and the probe says nothing is there yet.
 */
export const FALLBACK_CONTENT_INDEX_PATH: (typeof CONTENT_INDEX_PATHS)[number] = CONTENT_INDEX_PATHS[0];

/** A site as the probe first reads it from a repository: the path is not known yet. */
export interface UnresolvedContentSource {
    org: string;
    site: string;
    indexPath?: string;
}

/** A content source as the catalog, a description file and a project row all state it: the path is named. */
export type ContentIndexSource = UnresolvedContentSource & { indexPath: string };

/** The published URL of a site's index. Every reader builds it here; none of them guesses a path. */
export function contentIndexUrl(source: ContentIndexSource): string {
    return `https://main--${source.site}--${source.org}.aem.live${source.indexPath}`;
}

export interface ResolvedContentIndex {
    /** The path the index answered under, or the stated/default path when none answered. */
    indexPath: string;
    found: boolean;
    /** How many pages the index lists, when it answered. */
    pageCount?: number;
}

async function readIndex(
    source: UnresolvedContentSource,
    indexPath: string,
    fetchImpl: typeof fetch,
    logger: Logger,
): Promise<{ ok: boolean; pageCount?: number }> {
    const url = contentIndexUrl({ org: source.org, site: source.site, indexPath });
    try {
        const response = await fetchImpl(url, { method: 'GET', signal: AbortSignal.timeout(TIMEOUTS.QUICK) });
        if (!response.ok) {
            logger.debug(`[ContentIndex] ${url} returned HTTP ${response.status}`);
            return { ok: false };
        }
        const body = (await response.json()) as { data?: unknown[] };
        return { ok: true, pageCount: Array.isArray(body.data) ? body.data.length : 0 };
    } catch (error) {
        logger.debug(`[ContentIndex] Could not read ${url}: ${(error as Error).message}`);
        return { ok: false };
    }
}

/**
 * Find a site's index. A stated path is read as stated (a statement is not
 * second-guessed); with none, the known paths are tried in order and the
 * first that answers is the site's. Never throws.
 */
export async function resolveContentIndex(
    source: UnresolvedContentSource,
    fetchImpl: typeof fetch,
    logger: Logger,
): Promise<ResolvedContentIndex> {
    if (source.indexPath) {
        const read = await readIndex(source, source.indexPath, fetchImpl, logger);
        return { indexPath: source.indexPath, found: read.ok, ...(read.ok ? { pageCount: read.pageCount } : {}) };
    }
    for (const indexPath of CONTENT_INDEX_PATHS) {
        const read = await readIndex(source, indexPath, fetchImpl, logger);
        if (read.ok) return { indexPath, found: true, pageCount: read.pageCount };
    }
    return { indexPath: FALLBACK_CONTENT_INDEX_PATH, found: false };
}
