/**
 * The one network read the storefront teardown makes against the public site: the
 * HTTP status of a page on aem.live, after it was unpublished (EDS-33).
 *
 * Its own module so a suite driving the real teardown can replace it without touching
 * anything else; `tearDownStorefront` takes it as a dependency and defaults to this.
 *
 * @module features/eds/services/storefront/liveStatusCheck
 */

import { TIMEOUTS } from '@/core/utils/timeoutConfig';

/**
 * GET a URL and return its status. 0 when nothing answered (network error or timeout),
 * which the teardown reads as "could not tell", never as "gone".
 *
 * @param url - a page on the live host
 * @returns the HTTP status, or 0
 */
export async function checkLiveStatus(url: string): Promise<number> {
    try {
        const response = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(TIMEOUTS.QUICK) });
        return response.status;
    } catch {
        return 0;
    }
}
