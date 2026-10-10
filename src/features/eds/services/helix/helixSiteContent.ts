/**
 * HelixSiteContent — whole-site content publication.
 *
 * The policy half of a site publish: discover every publishable page from
 * DA.live (`helixPageDiscovery`), try the Admin API's bulk preview and bulk
 * publish (`helixBulkPublish`), and fall back to page-by-page when the bulk
 * API refuses. Also the progress phases a whole-site publish reports.
 *
 * Extracted from `helixService.ts` (god-file cut 3, 2026-08-23); the bulk
 * calls and the DA.live page listing moved out on 2026-10-08 (EDS-8). The
 * single-page preview-and-publish used by the fallback is injected as a
 * callback by the facade, keeping this class free of the page-op half.
 *
 * @module features/eds/services/helix/helixSiteContent
 */

import type { HelixBulkPublish } from './helixBulkPublish';
import type { HelixPageDiscovery } from './helixPageDiscovery';
import type { Logger } from '@/types/logger';

/** Default branch for Helix operations */
const DEFAULT_BRANCH = 'main';

/**
 * Progress callback phases for publish operations
 */
export const SITE_PUBLISH_PHASES = {
    DISCOVERING: 'discovering',
    PUBLISHING: 'publishing',
    COMPLETE: 'complete',
} as const;

/** One phase of a whole-site publish. */
export type SitePublishPhase = (typeof SITE_PUBLISH_PHASES)[keyof typeof SITE_PUBLISH_PHASES];

/** Progress report for a whole-site publish. */
export interface SitePublishProgress {
    phase: SitePublishPhase;
    message: string;
    current?: number;
    total?: number;
    currentPath?: string;
}

/** Parse "owner/repo" into its two halves. */
function parseRepoFullName(fullName: string): [string, string] {
    const parts = fullName.split('/');
    if (parts.length !== 2) {
        throw new Error(`Invalid repository name: ${fullName}. Expected format: owner/repo`);
    }
    return [parts[0], parts[1]];
}

/** What the site-content operations need from their host. */
export interface HelixSiteContentDeps {
    logger: Logger;
    /** The Admin API's bulk preview and bulk publish (the fast path). */
    bulk: Pick<HelixBulkPublish, 'previewAllContent' | 'publishAllContent'>;
    /** The DA.live listing that decides which pages a publish covers. */
    discovery: Pick<HelixPageDiscovery, 'listAllPages'>;
    /** The single-page preview+publish used by the page-by-page fallback. */
    previewAndPublishPage(org: string, site: string, path: string, branch: string): Promise<void>;
}

/**
 * Publishes a whole site's content: bulk-first, page-by-page fallback.
 */
export class HelixSiteContent {
    constructor(private deps: HelixSiteContentDeps) {}

    private get logger(): Logger {
        return this.deps.logger;
    }

    /**
     * Preview and publish all content in one operation.
     * Attempts bulk APIs first for performance, falls back to page-by-page if bulk fails.
     *
     * @param repoFullName - Full repository name (owner/repo) for Helix API
     * @param branch - Branch name (default: main)
     * @param daLiveOrg - DA.live organization (for listing content, may differ from GitHub owner)
     * @param daLiveSite - DA.live site name (for listing content, may differ from GitHub repo)
     * @param onProgress - Optional callback for progress updates
     * @returns the web paths it published: every page DA.live listed. A page the
     *   page-by-page fallback skipped is still in the list; it is current content.
     */
    async publishAllSiteContent(
        repoFullName: string,
        branch: string = DEFAULT_BRANCH,
        daLiveOrg?: string,
        daLiveSite?: string,
        onProgress?: (info: SitePublishProgress) => void,
    ): Promise<string[]> {
        const [githubOrg, githubSite] = parseRepoFullName(repoFullName);

        // Use provided DA.live org/site, or fall back to GitHub org/site
        const contentOrg = daLiveOrg || githubOrg;
        const contentSite = daLiveSite || githubSite;

        this.logger.info(
            `[Helix] Publishing all content from DA.live: ${contentOrg}/${contentSite}`,
        );
        this.logger.info(`[Helix] Target GitHub repo: ${repoFullName}`);

        // Report: Discovering content (still needed to get page count for progress)
        onProgress?.({
            phase: SITE_PUBLISH_PHASES.DISCOVERING,
            message: 'Discovering content to publish',
        });

        // List all publishable pages from DA.live to get count for progress reporting
        const pages = await this.deps.discovery.listAllPages(contentOrg, contentSite);

        if (pages.length === 0) {
            this.logger.warn('[Helix] No publishable pages found');
            throw new Error('No publishable pages found. Ensure the site has content in DA.live.');
        }

        this.logger.info(`[Helix] Found ${pages.length} pages to publish`);

        // Try bulk APIs first for better performance
        // If bulk fails (404 = site not configured), fall back to page-by-page
        try {
            await this.publishAllSiteContentBulk(githubOrg, githubSite, branch, pages, onProgress);
        } catch (error) {
            // Bulk API is a fast path — any failure falls back to reliable page-by-page
            this.logger.warn(
                `[Helix] Bulk publish failed: ${(error as Error).message}, falling back to page-by-page`,
            );
            await this.publishAllSiteContentPageByPage(
                githubOrg,
                githubSite,
                branch,
                pages,
                onProgress,
            );
        }
        return pages;
    }

    /**
     * Publish all content using bulk APIs (fast path)
     */
    private async publishAllSiteContentBulk(
        githubOrg: string,
        githubSite: string,
        branch: string,
        pages: string[],
        onProgress?: (info: SitePublishProgress) => void,
    ): Promise<void> {
        // Phase 1: Bulk preview (sync from DA.live to preview CDN)
        onProgress?.({
            phase: SITE_PUBLISH_PHASES.PUBLISHING,
            message: 'Previewing all content',
            current: 0,
            total: pages.length,
        });

        await this.deps.bulk.previewAllContent(
            githubOrg,
            githubSite,
            branch,
            (processed, total) => {
                onProgress?.({
                    phase: SITE_PUBLISH_PHASES.PUBLISHING,
                    message: `Previewing content (${processed}/${total})`,
                    current: Math.floor(processed / 2), // First half of progress
                    total: pages.length,
                });
            },
            pages, // Pass the discovered pages explicitly
        );

        this.logger.info('[Helix] Bulk preview completed');

        // Phase 2: Bulk publish (sync from preview to live CDN)
        onProgress?.({
            phase: SITE_PUBLISH_PHASES.PUBLISHING,
            message: 'Publishing to live CDN',
            current: Math.floor(pages.length / 2),
            total: pages.length,
        });

        await this.deps.bulk.publishAllContent(
            githubOrg,
            githubSite,
            branch,
            (processed, total) => {
                onProgress?.({
                    phase: SITE_PUBLISH_PHASES.PUBLISHING,
                    message: `Publishing to CDN (${processed}/${total})`,
                    current: Math.floor(pages.length / 2) + Math.floor(processed / 2), // Second half
                    total: pages.length,
                });
            },
            pages, // Pass the discovered pages explicitly
        );

        this.logger.info(`[Helix] Successfully published ${pages.length} pages using bulk API`);

        // Report completion
        onProgress?.({
            phase: SITE_PUBLISH_PHASES.COMPLETE,
            message: `Published ${pages.length} pages to CDN`,
            current: pages.length,
            total: pages.length,
        });
    }

    /**
     * Publish all content page-by-page (fallback for sites where bulk API isn't available)
     */
    private async publishAllSiteContentPageByPage(
        githubOrg: string,
        githubSite: string,
        branch: string,
        pages: string[],
        onProgress?: (info: SitePublishProgress) => void,
    ): Promise<void> {
        let publishedCount = 0;
        let skippedCount = 0;

        for (let i = 0; i < pages.length; i++) {
            const path = pages[i];

            onProgress?.({
                phase: SITE_PUBLISH_PHASES.PUBLISHING,
                message: `Publishing to CDN (${i + 1}/${pages.length})`,
                current: i,
                total: pages.length,
                currentPath: path,
            });

            try {
                await this.deps.previewAndPublishPage(githubOrg, githubSite, path, branch);
                publishedCount++;
                this.logger.debug(`[Helix] Published: ${path}`);
            } catch (error) {
                const errorMessage = (error as Error).message;

                // 404 means the page has no content (placeholder) - skip it
                if (errorMessage.includes('404')) {
                    skippedCount++;
                    this.logger.debug(`[Helix] Skipping ${path} - no content (404)`);
                    continue;
                }

                // Other errors should propagate
                throw error;
            }
        }

        this.logger.info(
            `[Helix] Successfully published ${publishedCount}/${pages.length} pages (${skippedCount} skipped)`,
        );

        // Report completion
        onProgress?.({
            phase: SITE_PUBLISH_PHASES.COMPLETE,
            message: `Published ${publishedCount} pages to CDN${skippedCount > 0 ? ` (${skippedCount} skipped)` : ''}`,
            current: pages.length,
            total: pages.length,
        });
    }
}
