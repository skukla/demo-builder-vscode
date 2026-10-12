/**
 * After a copy is published, name what the source has that the storefront does not.
 *
 * The content copy takes every path the storefront's own code loads that the source
 * site serves (`backfillCodePaths`, EDS-40). This asks the finished storefront for
 * the same paths, the same way, and anything it does not serve is a gap: the cart
 * page the SC would otherwise meet as a blank screen in front of a customer.
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

import { probePaths } from '../sitePathProbe';
import { aemLiveBaseUrl } from './storefrontProbe';
import type { Logger } from '@/types/logger';

/**
 * `complete`: the storefront serves everything that could be checked. `missing`: it
 * does not serve some. `not-checked`: it answered nothing, or the check failed.
 */
type MissingPagesStatus = 'complete' | 'missing' | 'not-checked';

export interface MissingPagesResult {
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

/**
 * Ask the published storefront for every path the source has.
 *
 * @param site - the GitHub owner and repository the live site is keyed on
 * @param onSource - the paths the copy found on the source (`codePathsOnSource`)
 * @param logger - gets one line with the count, then the paths
 * @returns what is missing, with the sentence to show. Never throws.
 */
export async function findMissingPages(
    site: { owner: string; repo: string },
    onSource: readonly string[],
    logger: Logger,
): Promise<MissingPagesResult> {
    if (onSource.length === 0) return { status: 'complete', missing: [] };
    try {
        const { served, absent, unknown } = await probePaths(aemLiveBaseUrl(site.owner, site.repo), onSource);
        const unchecked = unknown.length > 0 ? ` (${unknown.length} could not be checked)` : '';

        if (absent.length > 0) {
            const summary = missingPagesSentence(absent);
            logger.warn(
                `[EdsPipeline] ${absent.length} of ${onSource.length} pages the source has are missing from this storefront${unchecked}`,
            );
            logger.warn(`[EdsPipeline] Missing: ${absent.join(' ')}`);
            return { status: 'missing', missing: absent, summary };
        }
        if (served.length === 0) {
            logger.warn(`[EdsPipeline] ${NOT_CHECKED} The storefront did not answer.`);
            return { status: 'not-checked', missing: [], summary: NOT_CHECKED };
        }
        logger.info(
            `[EdsPipeline] The storefront serves all ${served.length} pages the source has${unchecked}`,
        );
        return { status: 'complete', missing: [] };
    } catch (error) {
        logger.warn(`[EdsPipeline] ${NOT_CHECKED} ${(error as Error).message}`);
        return { status: 'not-checked', missing: [], summary: NOT_CHECKED };
    }
}
