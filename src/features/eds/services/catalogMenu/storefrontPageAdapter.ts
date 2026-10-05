/**
 * The catalog menu's page port over DA.live and Helix (EDS-24).
 *
 * {@link createStorefrontPages} drives the same calls `read_page`, `write_page` (with
 * publish) and `delete_page` make, in the same order. Storefront setup, reset and
 * republish all hand it their own DA.live and Helix clients.
 *
 * @module features/eds/services/catalogMenu/storefrontPageAdapter
 */

import type { StorefrontPages } from './catalogMenuService';
import { resolveDaPath } from '@/features/eds/services/daLive/daLiveContentHelpers';
import type { DaLiveContentOperations } from '@/features/eds/services/daLive/daLiveContentOperations';
import type { HelixService } from '@/features/eds/services/helix/helixService';

/** The two clients the page adapter drives — narrowed to the calls it makes. */
export interface PageTransport {
    daLive: Pick<DaLiveContentOperations, 'readSource' | 'createSource' | 'deleteSource' | 'listDirectory'>;
    helix: Pick<HelixService, 'previewAndPublishPage' | 'unpublishPage'>;
}

/** DA source path for a web path — `/nav` → `nav.html`. The content pipeline's own rule. */
function sourcePathOf(webPath: string): string {
    return resolveDaPath(webPath, true);
}

/** Folders that hold no category page: product pages, fragments, work in progress. */
const SKIPPED_FOLDERS = new Set(['fragments', 'drafts']);
const PRODUCT_PAGES = '/products';
/** Documents the header and footer load; never a page of their own. */
const CHROME_DOCUMENTS = new Set(['nav', 'footer']);
const PAGE_SUFFIX = '.html';

const lastSegment = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

function isSkippedFolder(path: string): boolean {
    const name = lastSegment(path);
    return path === PRODUCT_PAGES || name.startsWith('.') || SKIPPED_FOLDERS.has(name);
}

/** The web path of a page document, or null for anything that is not a candidate page. */
function pagePathOf(sitePath: string): string | null {
    if (!sitePath.endsWith(PAGE_SUFFIX)) return null;
    const webPath = sitePath.slice(0, -PAGE_SUFFIX.length);
    return CHROME_DOCUMENTS.has(lastSegment(webPath)) ? null : webPath;
}

/**
 * Every page that could be a category page, found by walking the site's folders: one
 * DA.live list call per folder, folders one after another. Product pages (`/products`),
 * `fragments`, `drafts` and dot-folders (`.da`, the block library's own pages) are never
 * opened; nav and footer documents, sheets and media are left out.
 */
async function listCandidatePages(
    daLive: PageTransport['daLive'],
    org: string,
    site: string,
): Promise<string[]> {
    const prefix = `/${org}/${site}`;
    const found: string[] = [];
    const walk = async (folder: string): Promise<void> => {
        for (const entry of await daLive.listDirectory(org, site, folder)) {
            const sitePath = entry.path.startsWith(prefix) ? entry.path.slice(prefix.length) : entry.path;
            if (!entry.ext) {
                if (!isSkippedFolder(sitePath)) await walk(sitePath);
                continue;
            }
            // The path's own ending decides: the list API's `ext` is spelled both ways in this repo.
            const page = pagePathOf(sitePath);
            if (page !== null) found.push(page);
        }
    };
    await walk('/');
    return found;
}

/**
 * The storefront's pages, by web path.
 *
 * - `listPages` is {@link listCandidatePages}: where a hand-built category page is looked for.
 * - `read` reads WHOLE: a cut-short page written back would lose its tail, so a
 *   truncated read throws instead of answering.
 * - `write` is `write_page` with `publish: true`: overwrite the source, then preview and
 *   publish; a failure at either step throws, so nothing is recorded as live that is not.
 * - `remove` is `delete_page`: unpublish FIRST and stop if that fails (the source stays,
 *   so the page can still be removed), then delete the source.
 *
 * @param transport - the DA.live and Helix clients
 * @param target - the storefront's DA.live org and site
 * @returns the pages, by web path
 */
export function createStorefrontPages(
    transport: PageTransport,
    target: { daLiveOrg: string; daLiveSite: string },
): StorefrontPages {
    const { daLiveOrg: org, daLiveSite: site } = target;
    return {
        listPages: () => listCandidatePages(transport.daLive, org, site),
        async read(path) {
            const res = await transport.daLive.readSource(org, site, sourcePathOf(path), Number.POSITIVE_INFINITY);
            if (res.status === 404) return null;
            if (res.status < 200 || res.status >= 300) {
                throw new Error(`Could not read ${path}: HTTP ${res.status}`);
            }
            if (res.truncated) throw new Error(`Could not read all of ${path}`);
            return res.body;
        },
        async write(path, html) {
            const written = await transport.daLive.createSource(org, site, sourcePathOf(path), html, {
                overwrite: true,
            });
            if (!written.success) throw new Error(written.error ?? `Could not write ${path}`);
            await transport.helix.previewAndPublishPage(org, site, path);
        },
        async remove(path) {
            if (!(await transport.helix.unpublishPage(org, site, path))) {
                throw new Error(`Could not unpublish ${path}; its source was left in place`);
            }
            const deleted = await transport.daLive.deleteSource(org, site, sourcePathOf(path));
            if (!deleted.success) throw new Error(deleted.error ?? `Could not delete ${path}`);
        },
    };
}
