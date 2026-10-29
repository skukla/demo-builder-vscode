/**
 * After a copy is published, name what the source has that the storefront does not.
 *
 * Two lists say what the storefront should serve:
 *
 * - the paths its own code loads that the source answered for (`backfillCodePaths`,
 *   EDS-40). The source is known to have these, so one the storefront does not
 *   serve is a gap;
 * - everything else the copy carried, from the source's index, listing or
 *   references. These were copied, but a copy can carry a draft, a stub or a file
 *   the source never published, so one the storefront does not serve is a gap only
 *   when the source serves it. The source is asked about those alone.
 *
 * The second list is why the check exists in this shape: on its first live run
 * (2026-10-12) it said "serves all 57 pages the source has" while two enrichment
 * pages the copy had carried were never published. It had only looked at the
 * first list.
 *
 * It runs at the end of a create or reset that has otherwise worked, so it may
 * never fail one and never slow one materially. The requests are bounded by
 * `sitePathProbe`; a request that fails is "could not check", never "missing"; and
 * any error in here becomes `not-checked`. Never throws.
 *
 * The sentence is the one every surface shows: the pipeline's result, the reset's
 * dialog, the wizard's completion card and the agent's `caveats`.
 *
 * @module features/eds/services/storefront/missingPages
 */

import { EXCLUDED_FOLDERS, EXCLUDED_NAMES } from '../helix/helixPageDiscovery';
import { contentSiteBaseUrl, probePaths } from '../sitePathProbe';
import { aemLiveBaseUrl } from './storefrontProbe';
import type { Logger } from '@/types/logger';

/**
 * `complete`: the storefront serves everything that could be checked. `missing`: it
 * does not serve some. `not-checked`: it answered nothing, or the check failed.
 */
type MissingPagesStatus = 'complete' | 'missing' | 'not-checked';

interface MissingPagesResult {
    status: MissingPagesStatus;
    /** What the source serves and the storefront does not, as a browser asks for it. */
    missing: string[];
    /** One plain sentence, for the SC and the agent. Absent when there is nothing to say. */
    summary?: string;
}

/** How many paths the sentence names before it counts the rest. */
const NAMED_IN_SENTENCE = 10;

const NOT_CHECKED = 'Could not check whether every page the source has reached this storefront.';

/**
 * The sentence for a list of missing paths: "2 pages the source has are missing
 * from this storefront: /cart, /checkout".
 */
export function missingPagesSentence(missing: readonly string[]): string {
    const count = missing.length;
    const subject = count === 1 ? '1 page the source has is' : `${count} pages the source has are`;
    const named = missing.slice(0, NAMED_IN_SENTENCE).join(', ');
    const rest = count - NAMED_IN_SENTENCE;
    const tail = rest > 0 ? `, and ${rest} more (all are in the Debug Logs)` : '';
    return `${subject} missing from this storefront: ${named}${tail}`;
}

/** What the storefront should serve once the copy is published, as a browser asks for it. */
export interface ExpectedPaths {
    /** The code's paths the source answered for (`codePathsOnSource`). */
    fromCode: readonly string[];
    /** Everything else the copy carried (`carriedWebPaths`); not yet known to be on the source. */
    carried: readonly string[];
}

/**
 * What the copy carried, as the web paths a browser asks for: every sheet it wrote
 * (`/placeholders/cart.json`), and every other document by its path (`/cart`).
 * Configuration under a dot folder (`/.da/...`) and files with an extension (an
 * image, a PDF) are not documents a storefront serves at that path, and are left out.
 * So are pages the publish never publishes: in such a folder (`EXCLUDED_FOLDERS`), or
 * with such a name (`EXCLUDED_NAMES`), as `leftoverPages` already reads them.
 *
 * @param copiedFiles - the copy's `copiedFiles`, content paths
 * @param sheetPaths - the copy's `sheetPaths`, already web paths
 */
export function carriedWebPaths(copiedFiles: readonly string[], sheetPaths: readonly string[]): string[] {
    const sheets = new Set(sheetPaths);
    const carried = new Set(sheetPaths);
    for (const copied of copiedFiles) {
        const path = copied.startsWith('/') ? copied : `/${copied}`;
        const segments = path.split('/').filter(Boolean);
        const name = segments[segments.length - 1] ?? '';
        if (segments.some((segment) => segment.startsWith('.'))) continue;
        if (name.includes('.') || sheets.has(`${path}.json`)) continue;
        // A folder the publish skips on purpose (`experiments`, owner 2026-10-12) is
        // not missing when it is not on the site; it was never meant to be.
        if (segments.slice(0, -1).some((folder) => EXCLUDED_FOLDERS.includes(folder))) continue;
        // So is a page the publish skips by name. Khalil's JustRite source has empty
        // `/metadata` and `/redirects` documents, and every reset of a copy of it said
        // they were "missing" (2026-10-23).
        if (EXCLUDED_NAMES.includes(name)) continue;
        carried.add(path);
    }
    return [...carried];
}

/**
 * Ask the published storefront for everything the copy should have put there.
 *
 * @param site - the GitHub owner and repository the live site is keyed on
 * @param source - the content site the copy read from; asked only about a carried
 *   path the storefront does not serve
 * @param expected - the two lists; see {@link ExpectedPaths}
 * @param logger - gets one line with the count, then the paths
 * @returns what is missing, with the sentence to show. Never throws.
 */
export async function findMissingPages(
    site: { owner: string; repo: string },
    source: { org: string; site: string },
    expected: ExpectedPaths,
    logger: Logger,
): Promise<MissingPagesResult> {
    const known = new Set(expected.fromCode);
    const carriedOnly = expected.carried.filter((path) => !known.has(path));
    const all = [...expected.fromCode, ...new Set(carriedOnly)];
    if (all.length === 0) return { status: 'complete', missing: [] };
    try {
        const onStorefront = await probePaths(aemLiveBaseUrl(site.owner, site.repo), all);
        const absentKnown = onStorefront.absent.filter((path) => known.has(path));
        const absentCarried = onStorefront.absent.filter((path) => !known.has(path));
        const onSource =
            absentCarried.length > 0
                ? (await probePaths(contentSiteBaseUrl(source), absentCarried)).served
                : [];
        const confirmed = new Set([...absentKnown, ...onSource]);
        const absent = all.filter((path) => confirmed.has(path));
        const unknown = onStorefront.unknown;
        const unchecked = unknown.length > 0 ? ` (${unknown.length} could not be checked)` : '';

        if (absent.length > 0) {
            const summary = missingPagesSentence(absent);
            logger.warn(
                `[EdsPipeline] ${absent.length} of ${all.length} pages the source has are missing from this storefront${unchecked}`,
            );
            logger.warn(`[EdsPipeline] Missing: ${absent.join(' ')}`);
            return { status: 'missing', missing: absent, summary };
        }
        if (onStorefront.served.length === 0) {
            logger.warn(`[EdsPipeline] ${NOT_CHECKED} The storefront did not answer.`);
            return { status: 'not-checked', missing: [], summary: NOT_CHECKED };
        }
        logger.info(
            `[EdsPipeline] The storefront serves all ${onStorefront.served.length} pages the source has${unchecked}`,
        );
        return { status: 'complete', missing: [] };
    } catch (error) {
        logger.warn(`[EdsPipeline] ${NOT_CHECKED} ${(error as Error).message}`);
        return { status: 'not-checked', missing: [], summary: NOT_CHECKED };
    }
}
