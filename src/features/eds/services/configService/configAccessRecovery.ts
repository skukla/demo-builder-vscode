/**
 * Recovering Configuration Service access for a site that refuses its own user.
 *
 * `configServiceAccess` provides the primitives; this decides what a REFUSED
 * user should actually do, and then verifies that it worked.
 *
 * ## Why this exists at all
 *
 * A 403 from `/config/*` used to end the story: the extension warned, suggested
 * a storefront reset (which repeats the same refused call), and stopped. It was
 * also gated to new repos by assumption — `storefrontSetupPhase3` only retried a
 * 403 when `repoMode === 'new'` — so an existing project had no path whatsoever.
 * That is what left `leahrayard/leah-b2b-demo` unable to serve a single PDP.
 *
 * ## The one thing we cannot promise
 *
 * The admin role is minted when the AEM Code Sync App is installed. Whether
 * Adobe's bot RE-mints it for an org that already exists is unverified, and
 * cannot be tested from an account that already holds the role. So this module
 * never asserts the recovery worked — it polls {@link probeConfigWriteAccess}
 * and reports `refused` if the flip never comes. A recovery flow that assumed
 * success would hand the user back a storefront that still cannot serve a PDP,
 * which is the exact failure mode this whole batch exists to remove.
 *
 * @module features/eds/services/configService/configAccessRecovery
 */

import {
    ensureSiteAdmin,
    probeConfigWriteAccess,
    readOrgAdmins,
    type CodeSyncSetupParams,
    type ConfigWriteAccess,
} from './configServiceAccess';
import type { TokenProvider } from '../daLive/daLiveContentOperations';
import { maskEmail } from '@/core/utils/maskEmail';
import { sleep } from '@/core/utils/sleep';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types/logger';

/**
 * How long to keep asking after the user says they finished the setup flow.
 *
 * Same RATIONALE as `CONFIG_SERVICE_PROPAGATION_DELAYS_MS` — the role propagates
 * across Adobe identity systems in a documented 30–90s window, so checking once
 * immediately after the browser step reliably reports a false "still refused" —
 * but deliberately NOT the same values. This poll starts after a human finished a
 * browser flow, so it front-loads two checks inside the first minute (30/30/45,
 * ~105s total) instead of stretching to 135s: the user is watching a progress
 * notification here, not waiting on a background write.
 */
const ACCESS_POLL_DELAYS_MS: readonly number[] = [
    TIMEOUTS.CONFIG_SERVICE_RETRY_DELAY, // 30s
    TIMEOUTS.CONFIG_SERVICE_RETRY_DELAY, // +30s
    TIMEOUTS.CONFIG_SERVICE_RETRY_DELAY * 1.5, // +45s
];

/**
 * State the site's configuration-access position in the log, before anything
 * depends on it.
 *
 * Access used to surface only when a write FAILED — deep in phase 3, after the
 * code push — so a debug log sent for triage was silent about the one fact that
 * explained the whole run. One cheap GET up front makes it explicit every time,
 * and the refusal line names the CONSEQUENCE (no product pages) rather than just
 * a status code, because "403" on its own taught nobody anything.
 *
 * Non-fatal and non-blocking: this only reports. `unknown` stays quiet rather
 * than warning, so a network blip never reads as a permissions problem.
 *
 * @returns the access state, for callers that want to branch on it
 */
export async function logConfigAccessState(
    tokenProvider: TokenProvider,
    site: Pick<CodeSyncSetupParams, 'owner' | 'repo'>,
    logger: Logger,
): Promise<ConfigWriteAccess> {
    const access = await probeConfigWriteAccess(tokenProvider, site.owner, site.repo, logger);
    const target = `${site.owner}/${site.repo}`;

    if (access === 'granted') {
        logger.info(`[ConfigAccess] ${target}: admin access confirmed`);
    } else if (access === 'unauthenticated') {
        // NOT a missing role. The identity may well hold it — the session was
        // refused, so nothing about it could be read. Saying "no admin role" here
        // sends the user to grant a permission they already have.
        logger.warn(
            `[ConfigAccess] ${target}: the DA.live session was refused (401) — sign in ` +
                'again. This says nothing about the admin role; it could not be checked.',
        );
    } else if (access === 'refused') {
        logger.warn(
            `[ConfigAccess] ${target}: this Adobe identity holds no admin role on the site ` +
                'configuration — the overlay cannot be registered, so product pages (PDPs) ' +
                'will not load until access is granted',
        );
    } else {
        logger.debug(`[ConfigAccess] ${target}: access could not be determined`);
    }
    return access;
}

/**
 * Poll the oracle until the site's configuration becomes readable.
 *
 * Call after the user completes the setup flow. `unknown` is treated as
 * not-yet-granted and keeps waiting — only a real 200 ends this as `granted`.
 *
 * @param onAttempt - fires before each wait so a long poll is not silent
 * @returns `granted` when the flip happens, `refused` when it never does
 */
export async function waitForConfigAccess(
    tokenProvider: TokenProvider,
    site: Pick<CodeSyncSetupParams, 'owner' | 'repo'>,
    logger: Logger,
    onAttempt?: (attempt: number, total: number) => void | Promise<void>,
): Promise<ConfigWriteAccess> {
    const total = ACCESS_POLL_DELAYS_MS.length + 1;

    let access = await probeConfigWriteAccess(tokenProvider, site.owner, site.repo, logger);
    // A refused SESSION never propagates into an admin role, so polling for one is
    // pure cost — three sleeps totalling ~105s before telling the user the wrong
    // thing. Stop on the first 401 and say what actually needs doing.
    if (access === 'unauthenticated') {
        logger.warn(
            `[ConfigAccess] ${site.owner}/${site.repo}: the DA.live session was refused ` +
                '(401) — not waiting for an admin role that is not the problem. Sign in again.',
        );
        return access;
    }
    for (let i = 0; i < ACCESS_POLL_DELAYS_MS.length && access !== 'granted'; i++) {
        await onAttempt?.(i + 1, total);
        await sleep(ACCESS_POLL_DELAYS_MS[i]);
        access = await probeConfigWriteAccess(tokenProvider, site.owner, site.repo, logger);
    }

    if (access === 'granted') {
        logger.info(`[ConfigAccess] ${site.owner}/${site.repo}: access confirmed`);
        return 'granted';
    }

    // Deliberately not 'unknown': the user asked whether their access is fixed,
    // and it is not. Saying so is the whole point of polling rather than assuming.
    logger.warn(
        `[ConfigAccess] ${site.owner}/${site.repo}: still refused after ${total} checks — ` +
            'the setup flow did not mint an admin role for this identity',
    );
    return 'refused';
}

/**
 * Announce this site's configuration-access position to BOTH surfaces.
 *
 * Wraps {@link logConfigAccessState} with the wizard-facing half: on a refusal it
 * also posts a progress message naming the consequence and, when the roster is
 * readable, who can grant. Lives here rather than in the phase-3 handler because
 * it is a configuration-access concern wearing a handler's clothes — the handler
 * only needs to know that it happened and what the state was.
 *
 * Deliberately NOT gated on `repoMode`: an existing repo never reaches the
 * wizard's Code Sync install step, so it is exactly the case that needs telling.
 *
 * Report-only. The registration still runs, because a refusal must not block the
 * rest of the pipeline.
 *
 * @param announce - posts a user-facing line (the wizard progress channel)
 * @returns the access state, for callers that branch on it
 */
export async function announceConfigAccess(
    tokenProvider: TokenProvider,
    site: Pick<CodeSyncSetupParams, 'owner' | 'repo'>,
    logger: Logger,
    announce: (message: string) => Promise<void>,
): Promise<ConfigWriteAccess> {
    const access = await logConfigAccessState(tokenProvider, site, logger);
    if (access === 'unauthenticated') {
        // Naming org admins to go ask would be a false remedy: the identity is not
        // short a role, its session is dead. Offering people to chase is worse
        // than offering nothing.
        await announce(
            '⚠️ Your DA.live session was refused — sign in again, then retry. Site ' +
                'configuration could not be checked, so this says nothing about your access.',
        );
        return access;
    }
    if (access !== 'refused') return access;

    const roster = await readOrgAdmins(tokenProvider, site.owner, logger);
    const admins = roster.status === 'ok' ? (roster.admins ?? []) : [];
    const whoCanGrant =
        admins.length > 0 ? ` An org admin can grant it: ${admins.join(', ')}.` : '';

    // Names the commands rather than a URL: this line renders as plain text in
    // the wizard's progress stream, so a link would not be clickable anyway, and
    // the palette entries are the same route the toast's buttons take.
    await announce(
        '⚠️ Your Adobe account holds no admin role on this site — product pages will ' +
            `not load until it does.${whoCanGrant} Run "Demo Builder: Manage Site Access" ` +
            'to check, then "Demo Builder: Repair Site Configuration" once you have it.',
    );
    return access;
}

/**
 * Pin the creating user's admin role on a freshly registered site.
 *
 * The role otherwise exists only as a side effect of whoever installed the Code
 * Sync App — which is why an older site can refuse its own owner with no in-app
 * way back (2026-08-13, leah-b2b-demo). Writing it here makes the grant a fact
 * of registration.
 *
 * MERGES, never replaces: `ensureSiteAdmin` reads first, so a site that already
 * has admins keeps them. Non-fatal by design — a storefront is fine without the
 * pin, and a failure here must not fail a working setup.
 */
export async function pinSiteAdmin(
    tokenProvider: TokenProvider,
    site: Pick<CodeSyncSetupParams, 'owner' | 'repo'>,
    email: string | undefined,
    logger: Logger,
): Promise<void> {
    if (!email) return;

    const target = `${site.owner}/${site.repo}`;
    const pinned = await ensureSiteAdmin(tokenProvider, site.owner, site.repo, email, logger);
    if (pinned.status === 'ok' && pinned.changed) {
        // Masked: info/warn land in the exportable debug buffer users paste into
        // tickets. Full addresses stay in the transient UI surfaces only.
        logger.info(`[ConfigAccess] Pinned ${maskEmail(email)} as an admin on ${target}`);
    } else if (pinned.status !== 'ok') {
        logger.debug(
            `[ConfigAccess] Could not pin the site admin role (${pinned.status}) — ` +
                'the install-granted role still applies',
        );
    }
}
