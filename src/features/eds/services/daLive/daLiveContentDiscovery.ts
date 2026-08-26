/**
 * DaLiveContentDiscovery — enumerate content paths on a source DA.live site.
 *
 * The two raw enumerators the content-copy pipeline builds on: the complete
 * DA.live list-API walk (`getContentPathsFromDaLive`) and the CDN content-index
 * read (`getContentPathsFromIndex`). Extracted from `DaLiveContentOperations`
 * as part of its decomposition; the facade constructs one and delegates.
 *
 * Keep this module `vscode`-free (the MCP server constructs the DA.live stack
 * in a separate Node process).
 *
 * @module features/eds/services/daLive/daLiveContentDiscovery
 */

import { DaLiveError, type DaLiveContentSource } from '../types';
import { DaLiveSourceOperations } from './daLiveSourceOperations';

/** Enumerate content paths on a source DA.live site. */
export class DaLiveContentDiscovery {
    constructor(private readonly sourceOps: DaLiveSourceOperations) {}

    /**
     * Get content paths by recursively listing all content on the source DA.live site.
     *
     * Uses the authenticated DA.live list API to enumerate every file,
     * then filters to content types (.html, .xlsx) and strips extensions
     * so the returned paths match the format expected by copySingleFile.
     *
     * This is more complete than getContentPathsFromIndex because the CDN
     * content index excludes fragment documents (nav, footer) and some
     * spreadsheets that are not indexed.
     *
     * @param org - Source organization name
     * @param site - Source site name
     * @returns Array of content paths (extension-free, e.g. '/nav', '/about')
     */
    async getContentPathsFromDaLive(org: string, site: string): Promise<string[]> {
        const contentPaths: string[] = [];
        const pathPrefix = `/${org}/${site}`;
        const contentExtensions = new Set(['.html', '.xlsx']);

        const stripPrefix = (entryPath: string): string => entryPath.replace(pathPrefix, '') || '/';

        const stripExtension = (filePath: string, ext: string): string =>
            filePath.slice(0, -ext.length);

        const collectPaths = async (dirPath: string): Promise<void> => {
            const entries = await this.sourceOps.listDirectory(org, site, dirPath);

            for (const entry of entries) {
                if (entry.ext) {
                    // File — include only content types
                    if (contentExtensions.has(entry.ext)) {
                        const relativePath = stripPrefix(entry.path);
                        contentPaths.push(stripExtension(relativePath, entry.ext));
                    }
                } else {
                    // Directory — recurse
                    const relativePath = stripPrefix(entry.path);
                    await collectPaths(relativePath);
                }
            }
        };

        await collectPaths('/');
        return contentPaths;
    }

    /**
     * Get content paths from a content source index
     *
     * Fetches the content index (e.g., full-index.json) from the source site
     * and returns the list of content paths. This is useful for operations
     * that need to know what content exists before copying it.
     *
     * @param source - Source content configuration (org, site, indexUrl)
     * @returns Array of content paths from the index
     */
    async getContentPathsFromIndex(source: DaLiveContentSource): Promise<string[]> {
        const indexResponse = await fetch(source.indexUrl);
        if (!indexResponse.ok) {
            throw new DaLiveError(
                `Failed to fetch content index from ${source.org}/${source.site}`,
                'INDEX_FETCH_ERROR',
                indexResponse.status,
            );
        }

        const indexData = await indexResponse.json();
        return indexData.data?.map((item: { path: string }) => item.path) || [];
    }
}
