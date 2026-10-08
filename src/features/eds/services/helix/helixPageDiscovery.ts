/**
 * HelixPageDiscovery — which DA.live documents are publishable pages.
 *
 * Walks the site's DA.live tree and returns the web paths a publish should
 * cover: HTML documents only, minus the exclusion lists that keep non-content
 * files (metadata, redirects, placeholders) and config folders out of a
 * publish, with `/index` collapsed to its folder.
 *
 * Extracted from `helixSiteContent.ts` on 2026-10-08 (EDS-8). This knows
 * DA.live's listing shape and nothing about the Admin API.
 *
 * @module features/eds/services/helix/helixPageDiscovery
 */

import type { DaLiveContentOperations } from '../daLive/daLiveContentOperations';
import type { Logger } from '@/types/logger';

/**
 * File names to exclude from publishing (non-content files)
 */
const EXCLUDED_NAMES = [
    'metadata', // metadata.json
    'redirects', // redirects.json
    'placeholders', // placeholders.json
    'query-index', // query-index.json
    'test-index', // test files
];

/**
 * Folder names to exclude from publishing
 */
const EXCLUDED_FOLDERS = [
    '.helix',
    '.milo',
    'placeholders',
    'experiments', // A/B test config
    'enrichment', // PDP enrichment data
];

/** What page discovery needs: the DA.live listing and somewhere to log. */
export interface HelixPageDiscoveryDeps {
    logger: Logger;
    daLiveOps: Pick<DaLiveContentOperations, 'listDirectory'>;
}

/**
 * Lists the publishable pages of a DA.live site.
 */
export class HelixPageDiscovery {
    constructor(private deps: HelixPageDiscoveryDeps) {}

    private get logger(): Logger {
        return this.deps.logger;
    }

    /**
     * Recursively list all publishable pages from DA.live
     *
     * DA.live API response structure:
     * - Files have: { name, path, ext, lastModified }
     * - Folders have: { name, path } (no ext field)
     *
     * @param org - Organization name (DA.live org)
     * @param site - Site name in DA.live
     * @param path - Starting path (default: root)
     * @returns Array of web paths to publish
     */
    async listAllPages(org: string, site: string, path: string = '/'): Promise<string[]> {
        const pages: string[] = [];
        // DA.live paths include org/site prefix, need to strip it for recursion
        const pathPrefix = `/${org}/${site}`;

        try {
            const entries = await this.deps.daLiveOps.listDirectory(org, site, path);

            for (const entry of entries) {
                // Determine if it's a folder (no ext field) or file (has ext field)
                const isFolder = !entry.ext;

                if (isFolder) {
                    // Skip excluded folders
                    if (EXCLUDED_FOLDERS.includes(entry.name)) {
                        continue;
                    }

                    // Recursively list subdirectory
                    // The path in the response is like /org/site/folder, need to strip prefix for recursion
                    const relativePath = entry.path.replace(pathPrefix, '') || '/';
                    const subPages = await this.listAllPages(org, site, relativePath);
                    pages.push(...subPages);
                } else {
                    // It's a file - check if it's publishable HTML content
                    if (entry.ext !== 'html') {
                        continue;
                    }

                    // Skip excluded names
                    if (EXCLUDED_NAMES.includes(entry.name)) {
                        continue;
                    }

                    // Convert DA.live path to web path
                    // entry.path is like /org/site/accessories.html
                    // We need /accessories (strip prefix and .html)
                    const webPath = this.daLivePathToWebPath(entry.path, pathPrefix);
                    pages.push(webPath);
                }
            }
        } catch (error) {
            this.logger.warn(`[Helix] Failed to list ${path}: ${(error as Error).message}`);
        }

        return pages;
    }

    /**
     * Convert a DA.live path to a web path
     * DA.live path: /org/site/accessories.html -> /accessories
     * DA.live path: /org/site/products/index.html -> /products
     */
    private daLivePathToWebPath(daLivePath: string, pathPrefix: string): string {
        // Strip the org/site prefix
        let webPath = daLivePath.replace(pathPrefix, '');

        // Remove .html extension
        webPath = webPath.replace(/\.html$/i, '');

        // Convert /index to /
        if (webPath === '/index' || webPath.endsWith('/index')) {
            webPath = webPath.slice(0, -6) || '/';
        }

        return webPath || '/';
    }
}
