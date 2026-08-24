/**
 * Keeping a site's admin grants alive across a delete-and-re-register.
 *
 * `updateSiteConfig` is not an update — it deletes the site config and writes it
 * back, and the `access` sub-resource lives UNDERNEATH that config. Measured
 * 2026-08-14: two admins granted, config deleted and re-registered,
 * `access/admin.json` back to 404. Because that runs on every project edit, a
 * team's whole admin list evaporated each time, and the create path's
 * single-user pin made the result look healthy afterwards.
 *
 * Both halves can fail, and each failure had to be made explicit:
 *
 *  - **Capture** — a failed read and "no grants" are indistinguishable, so a
 *    flaky GET would have looked like an empty list and the delete would have
 *    erased the real one. {@link captureSiteGrants} refuses instead.
 *  - **Restore** — a failed write-back leaves the grants gone with the config
 *    updated. {@link restoreCapturedGrants} retries once, then reports the
 *    masked addresses rather than swallowing them.
 *
 * Neither loss is recoverable from inside the extension: the access endpoint
 * requires the very role that went missing, so only a human who still holds it
 * can put it back. That is why these report rather than log quietly.
 *
 * Extracted from `configurationService` to keep that file to its job — the REST
 * client — while this protocol, which has its own test file, sits on its own.
 *
 * @module features/eds/services/configService/siteGrantPreservation
 */

import { readSiteAccess, restoreSiteRoles } from './configServiceAccess';
import type { TokenProvider } from '../daLive/daLiveContentOperations';
import { lostGrantsMessage } from './lostGrantsMessage';
import { maskEmail } from '@/core/utils/maskEmail';
import type { Logger } from '@/types/logger';

/** Roles captured before the destructive write, or the reason we must not proceed. */
export type CaptureOutcome =
    | { ok: true; roles: Record<string, string[]> }
    | { ok: false; statusCode?: number; error: string };

/**
 * Read the site's grants before anything destroys them.
 *
 * @returns `ok: false` when the list could not be READ — the caller must not
 *   delete, because it cannot tell an empty list from an unreadable one.
 */
export async function captureSiteGrants(
    tokenProvider: TokenProvider,
    org: string,
    site: string,
    logger: Logger,
): Promise<CaptureOutcome> {
    const captured = await readSiteAccess(tokenProvider, org, site, logger);
    if (captured.status === 'ok') return { ok: true, roles: captured.roles ?? {} };

    logger.error(
        `[ConfigService] ${org}/${site}: could not capture site grants ` +
            `(${captured.status}) — refusing to update rather than risk erasing them`,
    );
    return {
        ok: false,
        // The status Adobe actually returned. Folding 401 into 403 sent an expired
        // session down the "grant yourself the admin role" path — a deep link and
        // ~135s of propagation retries for something only a re-auth fixes. A 403
        // here still drives the propagation retry and the recovery dialog.
        statusCode: captured.status === 'not_authorized' ? (captured.httpStatus ?? 403) : undefined,
        error:
            'Could not read the current site administrators, so the update was ' +
            'refused — continuing would have erased them. Check the Debug Logs and retry.',
    };
}

/** What became of the captured grants. `undefined` means there were none to restore. */
export interface RestoreOutcome {
    grantsRestored?: boolean;
    lostGrants?: string[];
}

/**
 * Hand the captured grants back after the re-register.
 *
 * Attempted even when the re-register FAILED: the delete already happened, so the
 * grants are gone either way, and a POST that recreates the access document is
 * the only chance to return them.
 */
export async function restoreCapturedGrants(
    tokenProvider: TokenProvider,
    org: string,
    site: string,
    roles: Record<string, string[]>,
    logger: Logger,
): Promise<RestoreOutcome> {
    if (!Object.values(roles).some((list) => list.length > 0)) return {};

    const restored = await restoreSiteRoles(tokenProvider, org, site, roles, logger);
    if (restored.status === 'ok') return { grantsRestored: true };

    // One retry: the common failure here is a transient blip immediately after a
    // write, not a refusal.
    const retry = await restoreSiteRoles(tokenProvider, org, site, roles, logger);
    if (retry.status === 'ok') return { grantsRestored: true };

    const lost = Object.values(roles).flat().map(maskEmail);
    logger.error(
        `[ConfigService] ${org}/${site} (${retry.status}): ` +
            lostGrantsMessage(lost, 'The site configuration updated'),
    );
    return { grantsRestored: false, lostGrants: lost };
}
