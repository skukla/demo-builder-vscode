/**
 * Taking a storefront's pages off aem.live, and saying truthfully whether they went
 * (EDS-33). The first step of `tearDownStorefront`.
 *
 * ## Why the list comes from Helix
 *
 * The list of pages to unpublish used to be the DA.live content. Once that content is
 * gone (a delete that removed it first, or a second cleanup run) the list is empty, the
 * unpublish of nothing "succeeds", and the teardown answered `stillPublished: false`.
 * Measured 2026-10-09: 174 pages kept answering 200 at aem.live after exactly that answer.
 * What is published is Helix's own record, read with `listPublishedPaths` (the Admin
 * API's bulk status job) over the whole site. The DA.live list is still read and joined
 * to it, and it is all there is when Helix cannot be read.
 *
 * Generated product pages are left out of this list on purpose: `removeProductPages`
 * takes them down next, and refuses when another project publishes to the same
 * repository (EDS-26). Unpublishing them here would skip that refusal.
 *
 * ## Why the answer is checked
 *
 * After the unpublish, the home page and the first few unpublished pages are fetched
 * from the live host. The site is reported down only when Helix could say what was
 * published (or DA.live listed something), every live copy was removed, nothing checked
 * still answers, and at least one check came back 404. Anything short of that is
 * `still-live` or `unknown`, said in a sentence. Never a clean "down" without a check.
 *
 * Never throws: a failure becomes `unknown` with the reason.
 *
 * @module features/eds/services/storefront/storefrontUnpublish
 */

import { isGeneratedProductPage } from './productPageRemoval';
import { aemLiveBaseUrl } from './storefrontProbe';
import type { UnpublishPagesResult } from '@/features/eds/services/helix/helixPageDeletion';
import type { Logger } from '@/types/logger';

/** `down`: checked and gone. `still-live`: something still answers or was not removed. `unknown`: could not tell. */
export type PublishState = 'down' | 'still-live' | 'unknown';

/** The Helix calls the unpublish makes. `HelixService` satisfies it. */
export interface UnpublishHelix {
    listPublishedPaths(org: string, site: string, branch: string, pattern: string): Promise<string[]>;
    unpublishPages(org: string, site: string, branch: string, webPaths: string[]): Promise<UnpublishPagesResult>;
}

/**
 * Fetch a URL on the live host and return its HTTP status; 0 when nothing answered.
 * A read: GET only.
 */
export type LiveStatusCheck = (url: string) => Promise<number>;

export interface StorefrontUnpublishResult {
    /** Pages taken off live or preview (the larger of the two counts). */
    unpublishedPages: number;
    publishState: PublishState;
    /** One or two plain sentences, for the SC and the agent. */
    publishSummary: string;
}

const BRANCH = 'main';
/** Every path the site holds in preview or live. */
const WHOLE_SITE = '/*';
/** How many unpublished pages are checked on the live host, besides the home page. */
const PAGES_CHECKED = 3;
const HTTP_NOT_FOUND = 404;

const rawOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));
const pagesWord = (n: number): string => `${n} ${n === 1 ? 'page' : 'pages'}`;

interface Listing {
    paths: string[];
    /** Set when Helix could not say what is published; the reason. */
    helixUnreadable?: string;
}

/** Helix's record of what is published, joined to DA.live's list, minus generated product pages. */
async function listWhatIsPublished(
    owner: string,
    repo: string,
    daLivePages: string[],
    helix: UnpublishHelix,
    logger: Logger,
): Promise<Listing> {
    let fromHelix: string[] = [];
    let helixUnreadable: string | undefined;
    try {
        fromHelix = await helix.listPublishedPaths(owner, repo, BRANCH, WHOLE_SITE);
    } catch (error) {
        helixUnreadable = rawOf(error);
        logger.warn(`[Teardown] Helix could not list what ${owner}/${repo} has published: ${helixUnreadable}`);
    }
    const authored = new Set(daLivePages.map((path) => path.toLowerCase()));
    const union = [...new Set([...daLivePages, ...fromHelix])];
    return { paths: union.filter((path) => !isGeneratedProductPage(path, authored)), helixUnreadable };
}

interface Verdict {
    host: string;
    listed: number;
    liveFailed: number;
    helixUnreadable?: string;
    checks: Array<{ path: string; status: number }>;
}

const answers = (status: number): boolean => status >= 200 && status < 300;

/** The state and its sentence, from what was listed, removed and checked. */
function judge(v: Verdict): Pick<StorefrontUnpublishResult, 'publishState' | 'publishSummary'> {
    const helixNote = v.helixUnreadable
        ? ` Helix could not list what is published (${v.helixUnreadable}), so the list came from DA.live alone.`
        : '';
    const answering = v.checks.filter((c) => answers(c.status)).map((c) => c.path);
    if (answering.length > 0) {
        return {
            publishState: 'still-live',
            publishSummary:
                `${answering.length} of ${pagesWord(v.checks.length)} checked on ${v.host} still answer ` +
                `(${answering.join(', ')}).${helixNote}`,
        };
    }
    if (v.liveFailed > 0) {
        return {
            publishState: 'still-live',
            publishSummary: `${v.liveFailed} of ${pagesWord(v.listed)} could not be taken off ${v.host} and may still be live.`,
        };
    }
    const gone = v.checks.some((c) => c.status === HTTP_NOT_FOUND);
    if (!gone) {
        return {
            publishState: 'unknown',
            publishSummary: `Could not tell whether ${v.host} is down: the check after unpublishing got no clear answer.`,
        };
    }
    if (v.helixUnreadable && v.listed === 0) {
        return {
            publishState: 'unknown',
            publishSummary:
                `Could not tell whether ${v.host} is down: Helix could not list what is published ` +
                `(${v.helixUnreadable}) and DA.live has no pages left to list. The home page does not answer, ` +
                'but other pages may.',
        };
    }
    const done =
        v.listed > 0
            ? `Unpublished ${pagesWord(v.listed)} from ${v.host}; none of the ${v.checks.length} checked still answer.`
            : `Helix lists nothing published on ${v.host}, and the home page does not answer.`;
    return { publishState: 'down', publishSummary: `${done}${helixNote}` };
}

/** The home page and the first few unpublished pages, each checked once. */
async function checkLiveHost(base: string, paths: string[], checkLive: LiveStatusCheck) {
    const sample = [...new Set(['/', ...paths.slice(0, PAGES_CHECKED)])];
    return Promise.all(sample.map(async (path) => ({ path, status: await checkLive(`${base}${path}`) })));
}

/**
 * Unpublish everything the site has published, then check the live host.
 *
 * @param site - the GitHub owner and repository Helix is keyed on
 * @param daLivePages - the web paths DA.live still lists (may be empty)
 * @param deps - Helix, the live check, a logger
 * @returns how many pages went, whether the site is down, and a sentence. Never throws.
 */
export async function unpublishStorefront(
    site: { owner: string; repo: string },
    daLivePages: string[],
    deps: { helix: UnpublishHelix; checkLive: LiveStatusCheck; logger: Logger },
): Promise<StorefrontUnpublishResult> {
    const { owner, repo } = site;
    const base = aemLiveBaseUrl(owner, repo);
    const host = base.replace(/^https:\/\//, '');
    try {
        const listing = await listWhatIsPublished(owner, repo, daLivePages, deps.helix, deps.logger);
        const unpublished =
            listing.paths.length > 0
                ? await deps.helix.unpublishPages(owner, repo, BRANCH, listing.paths)
                : { count: 0, liveFailed: 0 };
        const checks = await checkLiveHost(base, listing.paths, deps.checkLive);
        const verdict = judge({
            host,
            listed: listing.paths.length,
            liveFailed: unpublished.liveFailed,
            helixUnreadable: listing.helixUnreadable,
            checks,
        });
        deps.logger.info(`[Teardown] ${verdict.publishSummary}`);
        return { unpublishedPages: unpublished.count, ...verdict };
    } catch (error) {
        const reason = rawOf(error);
        deps.logger.warn(`[Teardown] CDN unpublish failed for ${owner}/${repo}: ${reason}`);
        return {
            unpublishedPages: 0,
            publishState: 'unknown',
            publishSummary: `Couldn't take the pages off ${host} (${reason}). They may still be live.`,
        };
    }
}
