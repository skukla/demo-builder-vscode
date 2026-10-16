/**
 * After a reset republishes, take off the pages that are still published but were not
 * republished (EDS-33, the reset door; owner decision 2026-10-09).
 *
 * ## Why after, and why from Helix
 *
 * A reset used to unpublish every DA.live page it deleted, then copy and republish. The
 * storefront was offline for the minutes in between, and a page that was live on Helix
 * but no longer in DA.live (an earlier demo's page, or one whose DA.live file was already
 * gone) was in no list, so it stayed live for good. Now the reset only deletes the DA.live
 * content up front; the republish overwrites every page that still exists, and this step
 * asks Helix what is published (`listPublishedPaths` over the whole site, the same
 * listing the teardown uses, `storefrontUnpublish.ts`) and unpublishes, live and preview,
 * whatever the reset did not republish.
 *
 * ## What is never on the list
 *
 * - Product pages (`/products/...`). The pre-warm runs after this step and publishes the
 *   current catalog's; the old catalog's were taken out before the content copy, by
 *   `removeProductPages` and its shared-repository refusal (EDS-26). Taking them here
 *   would skip that refusal.
 * - Anything that is not a page (a sheet, an image), and pages the whole-site publish
 *   never publishes (`EXCLUDED_NAMES` / `EXCLUDED_FOLDERS`). The republish only publishes
 *   pages, so "not republished" says nothing about those.
 * - The block library pages, published by the step after the content publish.
 *
 * Helix's spelling of a path is matched loosely: case is ignored and a folder `index` is
 * the folder itself, so a home page Helix lists as `/index` is the republished `/`.
 * The listing's shape is not yet seen live (`helixPublishedPaths.ts`); these rules lean
 * towards leaving a page rather than removing one.
 *
 * When Helix cannot say what is published, nothing is removed and the answer says the
 * old pages may still be live. Never a clean finish without the list. Never throws.
 *
 * @module features/eds/services/storefront/leftoverPages
 */

import { EXCLUDED_FOLDERS, EXCLUDED_NAMES } from '../helix/helixPageDiscovery';
import { aemLiveBaseUrl } from './storefrontProbe';
import { WHOLE_SITE, type UnpublishHelix } from './storefrontUnpublish';
import type { Logger } from '@/types/logger';

/**
 * `removed`: the leftovers were taken off. `none`: there were none. `some-left`: some
 * could not be taken off live. `not-listed`: Helix could not say what is published.
 * `not-compared`: it is not known what the reset republished.
 */
type LeftoverPagesStatus = 'removed' | 'none' | 'some-left' | 'not-listed' | 'not-compared';

export interface LeftoverPagesResult {
    status: LeftoverPagesStatus;
    /** Pages taken off live or preview. */
    removed: number;
    /** One or two plain sentences, for the SC and the agent. */
    summary: string;
    /**
     * Pages the republish missed that DA.live still has (or could not say it does not):
     * left on, for the caller to publish. Absent when there were none.
     */
    kept?: string[];
}

/** Whether DA.live still has a page's document: undefined when it could not say. */
export type PageInSource = (webPath: string) => Promise<boolean | undefined>;

/** The source read `pageInSource` needs. */
interface SourceReader {
    readSource(org: string, site: string, path: string, maxBytes?: number): Promise<{ status: number }>;
}

/** The documents a web path can come from: `/a` is `a.html` or `a/index.html`. */
function documentsFor(webPath: string): string[] {
    if (webPath === '/') return ['/index.html'];
    return [`${webPath}.html`, `${webPath}/index.html`];
}

/**
 * Ask DA.live whether it still has a page. Only a not-found is a no: an error, or a
 * read that throws, is "cannot say", which keeps the page on (the unpublish it guards
 * is the step that cannot be taken back).
 *
 * @param source - DA.live source reads
 * @param org - the DA.live org
 * @param site - the DA.live site
 * @returns the check, for one web path at a time
 */
export function pageInSource(source: SourceReader, org: string, site: string): PageInSource {
    return async (webPath) => {
        let unsure = false;
        for (const document of documentsFor(webPath)) {
            try {
                const { status } = await source.readSource(org, site, document, 0);
                if (status === 200) return true;
                if (status !== 404) unsure = true;
            } catch {
                unsure = true;
            }
        }
        return unsure ? undefined : false;
    };
}

/** Split the candidates into those the source no longer has and those it may still have. */
async function bySource(
    paths: string[],
    inSource: PageInSource | undefined,
): Promise<{ gone: string[]; kept: string[] }> {
    if (!inSource) return { gone: paths, kept: [] };
    const answers = await Promise.all(paths.map((path) => inSource(path)));
    return {
        gone: paths.filter((_, i) => answers[i] === false),
        kept: paths.filter((_, i) => answers[i] !== false),
    };
}

/** The statuses that leave old pages live, or may. Said as a warning, never as done. */
export const LEFTOVERS_MAY_REMAIN: ReadonlySet<LeftoverPagesStatus> = new Set([
    'some-left',
    'not-listed',
    'not-compared',
]);

const BRANCH = 'main';
const PRODUCT_PAGES = '/products/';
const AGAIN = 'Reset again to remove them.';

const rawOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));
const pagesWord = (n: number): string => `${n} ${n === 1 ? 'page' : 'pages'}`;

/** Lower case, a leading slash, and a folder `index` as the folder itself. */
function comparable(path: string): string {
    const absolute = (path.startsWith('/') ? path : `/${path}`).toLowerCase();
    if (absolute === '/index') return '/';
    return absolute.endsWith('/index') ? absolute.slice(0, -'/index'.length) : absolute;
}

/** A page the whole-site publish would have republished, had DA.live still held it. */
function isRepublishablePage(path: string): boolean {
    const segments = comparable(path).split('/').filter(Boolean);
    const name = segments[segments.length - 1] ?? '';
    if (name.includes('.')) return false;
    if (EXCLUDED_NAMES.includes(name)) return false;
    return !segments.slice(0, -1).some((folder) => EXCLUDED_FOLDERS.includes(folder));
}

/** What Helix lists that the reset did not publish, and may be removed. */
function leftovers(listed: string[], kept: ReadonlySet<string>): string[] {
    return listed.filter((path) => {
        const key = comparable(path);
        return !key.startsWith(PRODUCT_PAGES) && !kept.has(key) && isRepublishablePage(path);
    });
}

async function unpublish(
    site: { owner: string; repo: string },
    paths: string[],
    host: string,
    helix: UnpublishHelix,
): Promise<LeftoverPagesResult> {
    try {
        const done = await helix.unpublishPages(site.owner, site.repo, BRANCH, paths);
        if (done.liveFailed > 0) {
            return {
                status: 'some-left',
                removed: done.count,
                summary:
                    `${done.liveFailed} of ${pagesWord(paths.length)} from before the reset could not be taken ` +
                    `off ${host} and are still live. ${AGAIN}`,
            };
        }
        const preview =
            done.previewFailed > 0 ? ` ${done.previewFailed} preview copies stayed on the .aem.page host.` : '';
        return {
            status: 'removed',
            removed: done.count,
            summary: `Took ${pagesWord(paths.length)} from before the reset off ${host}.${preview}`,
        };
    } catch (error) {
        return {
            status: 'some-left',
            removed: 0,
            summary: `Couldn't take ${pagesWord(paths.length)} from before the reset off ${host} (${rawOf(error)}). ${AGAIN}`,
        };
    }
}

/**
 * Unpublish, live and preview, what the site still has published that the reset did not
 * republish.
 *
 * @param site - the GitHub owner and repository Helix is keyed on
 * @param kept - `republished`: the pages the content publish published (undefined when
 *   that is not known); `alsoPublished`: other paths this run published (the block library)
 * @param deps - Helix and a logger
 * @returns what happened, in a status, a count and a sentence. Never throws.
 */
export async function unpublishLeftoverPages(
    site: { owner: string; repo: string },
    kept: { republished: readonly string[] | undefined; alsoPublished: readonly string[] },
    deps: { helix: UnpublishHelix; logger: Logger; inSource?: PageInSource },
): Promise<LeftoverPagesResult> {
    const host = aemLiveBaseUrl(site.owner, site.repo).replace(/^https:\/\//, '');
    const result = await findAndUnpublish(site, kept, host, deps);
    const log = LEFTOVERS_MAY_REMAIN.has(result.status) ? deps.logger.warn : deps.logger.info;
    log.call(deps.logger, `[EdsPipeline] ${result.summary}`);
    return result;
}

async function findAndUnpublish(
    site: { owner: string; repo: string },
    kept: { republished: readonly string[] | undefined; alsoPublished: readonly string[] },
    host: string,
    { helix, inSource }: { helix: UnpublishHelix; inSource?: PageInSource },
): Promise<LeftoverPagesResult> {
    if (!kept.republished) {
        return {
            status: 'not-compared',
            removed: 0,
            summary:
                `Pages from before the reset may still be live on ${host}: the republish did not say ` +
                `which pages it published. ${AGAIN}`,
        };
    }
    let listed: string[];
    try {
        listed = await helix.listPublishedPaths(site.owner, site.repo, BRANCH, WHOLE_SITE);
    } catch (error) {
        return {
            status: 'not-listed',
            removed: 0,
            summary:
                `Pages from before the reset may still be live on ${host}: Helix could not list what is ` +
                `published (${rawOf(error)}). ${AGAIN}`,
        };
    }
    const keep = new Set([...kept.republished, ...kept.alsoPublished].map(comparable));
    const { gone, kept: stillInSource } = await bySource(leftovers(listed, keep), inSource);
    const handBack = stillInSource.length > 0 ? { kept: stillInSource } : {};
    if (gone.length === 0) {
        return {
            status: 'none',
            removed: 0,
            summary: `No pages from before the reset were left on ${host}.`,
            ...handBack,
        };
    }
    return { ...(await unpublish(site, gone, host, helix)), ...handBack };
}
