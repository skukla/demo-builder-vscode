/**
 * Can this SC read a colleague's AUTHORED storefront content on DA.live, or only
 * what the CDN publishes? (EDS-22, the receiving side.)
 *
 * "Add a demo someone shared" copies a colleague's pages from the public CDN, so
 * without a read grant on their DA.live site it sees published pages only — never
 * the block library under `.da/library/`, never a page kept on preview. The grant
 * is the colleague's to give (`contentAccessManagerHeadless`, Manage Site Access);
 * this module only finds out which side of it the SC is on, so the dialog can say
 * so at the moment of adding, and name who must grant what.
 *
 * One read: `GET /list/{org}/{site}/` with the SC's own DA.live token. Read-only
 * by construction; nothing is written anywhere.
 *
 * Status mapping follows `DaLiveAuthService.isServerAccepted`: 401 indicts the
 * CREDENTIAL (sign in again), 403 is a permission fact (no grant). The EDS-22
 * item's reading of the DA.live permissions docs (2026-09-30) is that an org with
 * no permissions rows restricts nobody; if so, a 200 there is real access too.
 * Which status DA.live gives an ungranted reader is a live check still to run.
 *
 * Keep this module `vscode`-free: deps are handed in.
 *
 * @module features/eds/services/daLive/authoredContentAccess
 */

import { DA_LIVE_BASE_URL } from './daLiveConstants';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types/logger';
import type { AuthoredContentAccess } from '@/types/webviewRequests';

/** What the probe needs: the SC's DA.live token and address, and a fetch. */
export interface AuthoredAccessDeps {
    getAccessToken(): Promise<string | null | undefined>;
    getUserEmail(): Promise<string | null>;
    fetchImpl?: typeof fetch;
}

/**
 * Ask DA.live whether the signed-in SC may list the site's authored tree.
 * Never throws: a failure to find out is `unknown`, not a verdict.
 *
 * @param target - the colleague's DA.live org and site
 * @param deps - token, address and fetch
 * @param logger - receives what was found
 */
export async function probeAuthoredContentAccess(
    target: { org: string; site: string },
    deps: AuthoredAccessDeps,
    logger: Logger,
): Promise<AuthoredContentAccess> {
    const token = await deps.getAccessToken();
    if (!token) return { level: 'not-signed-in' };
    const url = `${DA_LIVE_BASE_URL}/list/${encodeURIComponent(target.org)}/${encodeURIComponent(target.site)}/`;
    let status: number;
    try {
        const response = await (deps.fetchImpl ?? fetch)(url, {
            method: 'GET',
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(TIMEOUTS.QUICK),
        });
        status = response.status;
    } catch (error) {
        logger.debug(`[AuthoredAccess] ${target.org}/${target.site}: no answer (${(error as Error).message})`);
        return { level: 'unknown' };
    }
    logger.info(`[AuthoredAccess] ${target.org}/${target.site}: DA.live answered ${status}`);
    if (status === 200) return { level: 'authored' };
    if (status === 401) return { level: 'not-signed-in' };
    if (status === 403) return { level: 'published-only', reader: await deps.getUserEmail() };
    return { level: 'unknown' };
}

/**
 * The sentence the SC reads when only published pages can be copied: who must
 * grant, what, and where in Demo Builder they do it. Nothing for any other level.
 *
 * @param access - the probe's answer
 * @param target - the colleague's DA.live org and site
 */
export function authoredAccessWarning(
    access: AuthoredContentAccess,
    target: { org: string; site: string },
): string | undefined {
    if (access.level !== 'published-only') return undefined;
    const who = access.reader ?? 'you';
    return (
        "You can copy this demo's published pages only. To copy its block library and unpublished " +
        `pages too, ask the owner of ${target.org} on DA.live to let ${who} read ${target.site}. ` +
        'In Demo Builder that is Manage Site Access, then "Let someone read the authored content".'
    );
}
