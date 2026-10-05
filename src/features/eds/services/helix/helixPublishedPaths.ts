/**
 * Asking Helix which paths a site holds in its preview and live partitions (EDS-26).
 *
 * Product pages are published through the overlay: by pre-warming, and by a shopper's
 * first visit to a product nobody pre-warmed. The second kind is recorded nowhere on
 * our side, and none of them has a DA.live document, so the only complete list is
 * Helix's own. This is the Admin API's bulk status job:
 *
 *     POST /status/{org}/{site}/{ref}/*      { paths: ['/products/*'], select: ['preview', 'live'] }
 *     GET  /job/{org}/{site}/{ref}/status/{name}/details      until state is 'stopped'
 *
 * `org`/`site` are the GitHub owner and repository — the key every Helix admin call
 * uses (ADR-002, `eds-publish-and-config` rule 2).
 *
 * NOT YET SEEN LIVE. The request and the `data.resources[].path` shape are taken from
 * Adobe's Admin API reference, not from a captured response (no credentialled read was
 * available when this was written, 2026-10-05). Two things follow from that:
 *
 * - a finished job WITHOUT a `data.resources` array throws. An answer in a shape this
 *   does not know must never read as "nothing is published";
 * - every listed path is answered, whatever else its row carries. Removing a path that
 *   turns out not to be there is a 404, which the remover counts as gone.
 *
 * A read: it starts a job on Helix's side and changes nothing on the site.
 *
 * @module features/eds/services/helix/helixPublishedPaths
 */

import type { HelixAdminAuth } from './helixAdminAuth';
import { HELIX_ADMIN_URL } from './helixApiClient';
import { parseBulkJobResponse } from './helixBulkJobs';
import { sleep } from '@/core/utils/sleep';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types/logger';

interface PublishedPathsDeps {
    auth: Pick<HelixAdminAuth, 'tryAdminBearer' | 'getGitHubToken'>;
    logger: Logger;
}

interface StatusJobDetails {
    state?: string;
    error?: string;
    data?: { resources?: Array<{ path?: unknown }> };
}

const STATUS_TOPIC = 'status';

/**
 * The DA.live Bearer (what a site with an admin role requires) plus the GitHub token when
 * there is one. Teardown builds its Helix client without GitHub, so its absence is not
 * an error here; Helix's own answer decides.
 */
async function statusHeaders(auth: PublishedPathsDeps['auth']): Promise<Record<string, string>> {
    const headers: Record<string, string> = { ...(await auth.tryAdminBearer()) };
    try {
        headers['x-auth-token'] = await auth.getGitHubToken();
    } catch {
        // No GitHub sign-in on this client.
    }
    return headers;
}

/** The job's page list once it has stopped, or undefined while it is still running. */
async function readStoppedJob(url: string, headers: Record<string, string>): Promise<string[] | undefined> {
    const response = await fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(TIMEOUTS.NORMAL) });
    // The job endpoint can lag the 202 that announced it.
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(`Helix refused the status job's results (HTTP ${response.status})`);
    const details = (await response.json()) as StatusJobDetails;
    if (details.state !== 'stopped') return undefined;
    if (details.error) throw new Error(`Helix's status job failed: ${details.error}`);
    const resources = details.data?.resources;
    if (!Array.isArray(resources)) throw new Error('Helix finished the status job without a page list');
    return resources.map((r) => r.path).filter((path): path is string => typeof path === 'string');
}

/**
 * Every path the site has in preview or live that matches `pattern`.
 *
 * @param deps - the credential seam and a logger
 * @param org - GitHub owner
 * @param site - GitHub repository
 * @param branch - the ref, `main`
 * @param pattern - a path pattern such as `/products/*`
 * @returns the paths; empty only when Helix answered with an empty list
 * @throws when the request is refused, the job fails or outlives its deadline, or the
 *   answer carries no page list
 */
export async function listPublishedPaths(
    deps: PublishedPathsDeps,
    org: string,
    site: string,
    branch: string,
    pattern: string,
): Promise<string[]> {
    const headers = await statusHeaders(deps.auth);
    const response = await fetch(`${HELIX_ADMIN_URL}/status/${org}/${site}/${branch}/*`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: [pattern], select: ['preview', 'live'] }),
        signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
    });
    if (response.status !== 202) {
        throw new Error(`Helix refused to list the published pages (HTTP ${response.status})`);
    }
    const { jobName } = await parseBulkJobResponse(response, STATUS_TOPIC, deps.logger);
    if (!jobName) throw new Error('Helix accepted the status request but named no job');

    const url = `${HELIX_ADMIN_URL}/job/${org}/${site}/${branch}/${STATUS_TOPIC}/${jobName}/details`;
    const deadline = Date.now() + TIMEOUTS.HELIX_STATUS_JOB_MAX;
    while (Date.now() < deadline) {
        const paths = await readStoppedJob(url, headers);
        if (paths) {
            deps.logger.debug(`[Helix] ${paths.length} published path(s) match ${pattern} on ${org}/${site}`);
            return paths;
        }
        await sleep(TIMEOUTS.POLL.INTERVAL);
    }
    throw new Error('Helix did not finish listing the published pages in time');
}
