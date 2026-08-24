/**
 * Configuration Service ACCESS — who holds the admin role, and how it is granted.
 *
 * The sibling of `configurationService` (which writes site config) and
 * `configServiceProbe` (which explains a refusal). This module is the part that
 * can actually FIX one.
 *
 * ## The constraint everything here is shaped by
 *
 * **Nobody can grant themselves, and no outsider can grant them either.** Both
 * measured 2026-08-14 against the live service:
 *
 * - The access endpoint sits behind the SAME `[admin]` gate as the config read.
 *   A caller who gets 403 reading `config/{org}/sites/{site}.json` gets 403 on
 *   `.../access/admin.json` too, so a self-heal cannot exist — it would be the
 *   extension escalating its own privilege.
 * - Authorization is per-ORG. An admin of `skukla` is refused on `leahrayard`,
 *   so "ask a teammate" only works for a teammate already inside that org.
 *
 * The role itself is minted for the GitHub user who installs the AEM Code Sync
 * App, which is why new sites work and older ones can refuse their own owner.
 * For a user with no role, the only bootstrap is a flow writing with authority
 * that is not theirs — the Code Sync bot, reachable at the setup URL this module
 * builds ({@link buildCodeSyncSetupUrl}).
 *
 * ## Two levels, and the org one is the blanket grant
 *
 * `config/{org}.json` carries `users: [{email, roles}]` — an admin there reaches
 * EVERY site in the org. `config/{org}/sites/{site}/access/admin.json` is
 * ADDITIVE per-site. Verified: `bodea-source` served `{role:{}}` while its owner
 * had full access, because the org roster listed them. So an empty site role map
 * is normal, and a missing org entry refuses everything.
 *
 * (`config/{org}/access/admin.json` and `config/{org}/access.json` both 404 —
 * the roster IS the org config. Reading a sub-path reports "no admins" for
 * every healthy org.)
 *
 * ## Never claim a grant worked
 *
 * {@link probeConfigWriteAccess} is the only honest confirmation: the refused
 * user's own config read returning 200. A transport failure reports `unknown`,
 * never `granted` — this value gates a claim made to the user about whether
 * their access is fixed.
 *
 * Full API record: `.rptc/plans/config-service-admin-grant/`.
 *
 * @module features/eds/services/configServiceAccess
 */

import type { TokenProvider } from './daLive/daLiveContentOperations';
import { HELIX_ADMIN_URL } from './helix/helixApiClient';
import { maskEmail } from '@/core/utils/maskEmail';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types/logger';

// Host constant shared from helixApiClient — one definition (2026-08-22 spine sweep).

/**
 * Mask every email-shaped substring in free text from a third party.
 *
 * `,` and `;` are excluded from both halves so a comma-separated list does not
 * match as ONE address — `a@b.com,c@d.com` did, masking only the first and
 * leaving the second whole.
 */
function maskEmailsIn(text: string): string {
    return text.replace(/[^\s"'<>@,;]+@[^\s"'<>@,;]+\.[^\s"'<>@,;]+/g, (m) => maskEmail(m));
}

/**
 * The site's admin-role document. Written out three times before this existed —
 * the Rule of Three threshold, in the one module whose job is knowing where this
 * endpoint lives.
 */
const adminAccessPath = (org: string, site: string): string =>
    `/config/${encodeURIComponent(org)}/sites/${encodeURIComponent(site)}/access/admin.json`;

/** The AEM Code Sync bot's setup flow — the only bootstrap for a user with no role. */
const CODE_SYNC_SETUP_URL = 'https://tools.aem.live/bot/setup';

/** The role name the Configuration Service uses for configuration admins. */
const ADMIN_ROLE = 'admin';

/**
 * Why a read or write ended the way it did.
 *
 * `not_authorized` is deliberately distinct from a generic failure: it is the
 * one outcome no retry can clear, so the UI must offer a different remedy
 * rather than a Retry button.
 */
export type AccessCallStatus = 'ok' | 'not_authorized' | 'no_credential' | 'invalid' | 'failed';

export interface OrgAdminsResult {
    status: AccessCallStatus;
    /** Emails holding the admin role. Absent unless `status` is `ok`. */
    admins?: string[];
    error?: string;
}

export interface SiteAccessResult {
    status: AccessCallStatus;
    /** Role name → emails. `{}` is a normal, healthy answer (see module note). */
    roles?: Record<string, string[]>;
    error?: string;
    /**
     * The raw HTTP status.
     *
     * `classify` folds 401 and 403 into `not_authorized`, which is right for
     * deciding whether to retry but wrong for choosing a remedy: an expired
     * session needs a re-auth, not a "grant yourself the admin role" deep link
     * and ~135s of propagation retries. Callers that pick a remedy read this.
     */
    httpStatus?: number;
}

export interface GrantResult {
    status: AccessCallStatus;
    error?: string;
}

/**
 * What the oracle saw. `unknown` never means granted.
 *
 * `unauthenticated` (401) is deliberately distinct from `refused` (403). Both mean
 * "you did not get in", and folding them is right for deciding whether to RETRY —
 * but wrong for choosing a REMEDY, exactly as the `httpStatus` note above says. A
 * refused session needs a re-auth; a missing admin role needs an org admin. Told
 * the wrong one, a user grants permissions they already have while the real cause
 * sits untouched — measured 2026-08-16, where one identity was told it "holds no
 * admin role" and then, having changed nothing but re-authenticating, "admin
 * access confirmed" forty minutes later.
 */
export type ConfigWriteAccess = 'granted' | 'refused' | 'unauthenticated' | 'unknown';

interface RawOrgConfig {
    users?: Array<{ email?: string; roles?: string[] }>;
}

interface RawSiteAccess {
    role?: Record<string, string[]>;
}

/** One authenticated call. Returns the status so callers classify, not guess. */
async function call(
    tokenProvider: TokenProvider,
    path: string,
    method: 'GET' | 'POST',
    body?: unknown,
    // The oracle reads only the STATUS. Forcing a JSON parse there made a 200
    // with an unparseable body throw into the catch and report 'unknown' —
    // "access indeterminate" for a site the caller can plainly read.
    parseBody = true,
): Promise<{ status: number; body?: unknown; error?: string; noCredential?: boolean }> {
    const token = await tokenProvider.getAccessToken();
    // Flagged, not spelled: `classify` used to detect this by substring-matching
    // the message, so any fetch rejection mentioning "credential" was misread as
    // a missing session.
    if (!token) return { status: 0, error: 'no DA.live credential', noCredential: true };

    try {
        const response = await fetch(`${HELIX_ADMIN_URL}${path}`, {
            method,
            headers: {
                Authorization: `Bearer ${token}`,
                ...(body ? { 'Content-Type': 'application/json' } : {}),
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
            signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
        });
        if (!response.ok) {
            // Keep the server's own words. Dropping them rendered "The change did not
            // go through: unknown error" for a response that explained itself.
            let body: string | undefined;
            try {
                const text = await response.text();
                // Mask BEFORE truncating. Slicing first left an address straddling
                // the cut unmatched — its local part survived whole into `error`,
                // which reaches both a dialog and the exportable log buffer. This
                // endpoint echoes the role state, so a 4xx body can carry the site's
                // entire admin list.
                body = text ? maskEmailsIn(text).slice(0, 300) : undefined;
            } catch {
                body = undefined;
            }
            return { status: response.status, error: body };
        }
        if (!parseBody) return { status: response.status };
        return { status: response.status, body: await response.json() };
    } catch (error) {
        return { status: 0, error: (error as Error).message };
    }
}

/** Map an HTTP status onto the typed outcome. 403 is never a retryable failure. */
function classify(status: number, noCredential?: boolean): AccessCallStatus {
    if (status >= 200 && status < 300) return 'ok';
    if (status === 401 || status === 403) return 'not_authorized';
    if (noCredential) return 'no_credential';
    return 'failed';
}

/**
 * Who holds the admin role on an org.
 *
 * @param tokenProvider - supplies the DA.live IMS bearer
 * @param org - GitHub owner (the Config Service org key)
 * @param logger - for the one-line outcome
 * @returns the admin emails, or a typed refusal
 */
export async function readOrgAdmins(
    tokenProvider: TokenProvider,
    org: string,
    logger: Logger,
): Promise<OrgAdminsResult> {
    const result = await call(tokenProvider, `/config/${encodeURIComponent(org)}.json`, 'GET');
    const status = classify(result.status, result.noCredential);

    if (status !== 'ok') {
        logger.debug(`[ConfigAccess] Org roster read for ${org}: ${status} (${result.status})`);
        return { status, error: result.error };
    }

    const users = (result.body as RawOrgConfig)?.users ?? [];
    const admins = users
        .filter((user) => user.roles?.includes(ADMIN_ROLE) && user.email)
        .map((user) => user.email as string);

    logger.debug(`[ConfigAccess] Org ${org} has ${admins.length} admin(s)`);
    return { status: 'ok', admins };
}

/**
 * The site-level (additive) role map.
 *
 * @returns the roles, or a typed refusal. `{}` is healthy — see the module note.
 */
export async function readSiteAccess(
    tokenProvider: TokenProvider,
    org: string,
    site: string,
    logger: Logger,
): Promise<SiteAccessResult> {
    const path = adminAccessPath(org, site);
    const result = await call(tokenProvider, path, 'GET');

    // 404 means the access doc does not exist YET — the normal state of a site
    // that was just registered. Measured 2026-08-14: `PUT /sites/{site}.json`
    // returns 201 and leaves no `access` key at all; the doc is created by the
    // setup tool's Users step, or by our own POST (which answers 200 and creates
    // it). Reading that as a failure made the admin pin a silent no-op on every
    // new site — precisely the case it was written for.
    //
    // Safe to treat as empty, unlike a drifted 200: an absent resource
    // definitively holds no admins, so seeding it cannot clobber anyone.
    if (result.status === 404) {
        logger.debug(`[ConfigAccess] ${org}/${site}: no access doc yet — treating as empty`);
        return { status: 'ok', roles: {} };
    }

    const status = classify(result.status, result.noCredential);

    if (status !== 'ok') {
        logger.debug(`[ConfigAccess] Site access read for ${org}/${site}: ${status}`);
        return { status, error: result.error, httpStatus: result.status };
    }

    // An ABSENT `role` key is not the same as an empty one. `{role:{}}` is a
    // healthy site with no site-level grants; a 200 whose body has no `role` at
    // all means the shape drifted, and reading that as "no admins" would let
    // ensureSiteAdmin write a single-element list — silently replacing every
    // other admin, the exact clobber the read-merge wrapper exists to prevent.
    //
    // Reported through the STATUS, not by leaving `roles` undefined on an `ok`.
    // Encoding it in the value asks every consumer to remember a convention, and
    // an earlier version of this function did exactly that: two call sites
    // honoured it and two did not, so a drifted body surfaced as "this site has
    // no admins" in the UI and as a verified removal in the manager. Status is
    // the one thing every caller already checks.
    const role = (result.body as RawSiteAccess)?.role;
    if (!role) {
        logger.warn(
            `[ConfigAccess] ${org}/${site}: site access response had no role map — ` +
                'treating as unreadable rather than empty',
        );
        return { status: 'failed', error: 'site access response had no role map' };
    }
    return { status: 'ok', roles: role };
}

/**
 * Grant the admin role on a site to the given emails.
 *
 * MODULE-PRIVATE on purpose. The payload REPLACES the `admin` role list, so a
 * caller passing one email silently drops every other admin. Exporting it left
 * that footgun reachable beside the safe wrappers; go through
 * {@link ensureSiteAdmin} / {@link revokeSiteAdmin}, which read first.
 *
 * An empty list is rejected rather than sent, because sending it clears
 * everyone's access.
 *
 * @param emails - the complete intended admin list (must be non-empty)
 * @returns `ok`, or `not_authorized` when the caller holds no admin role either
 */
async function grantSiteAdmin(
    tokenProvider: TokenProvider,
    org: string,
    site: string,
    emails: string[],
    logger: Logger,
): Promise<GrantResult> {
    if (emails.length === 0) {
        return { status: 'invalid', error: 'refusing to write an empty admin list' };
    }

    // No token pre-check here: `call` already returns the no-credential shape and
    // `classify` maps it to 'no_credential'. Doing it twice also doubled the
    // keychain reads per grant.
    const path = adminAccessPath(org, site);
    const result = await call(tokenProvider, path, 'POST', { role: { [ADMIN_ROLE]: emails } });
    const status = classify(result.status, result.noCredential);

    if (status === 'ok') {
        logger.info(`[ConfigAccess] Granted admin on ${org}/${site} to ${emails.length} user(s)`);
    } else {
        logger.warn(`[ConfigAccess] Grant on ${org}/${site} failed: ${status} (${result.status})`);
    }
    return { status, error: result.error };
}

/**
 * THE oracle: can this identity actually use the site's configuration?
 *
 * GET only — a diagnostic that wrote could clobber a live storefront, and a test
 * enforces the verb. Poll this after any recovery attempt instead of trusting
 * that the attempt worked.
 *
 * @returns `granted` on 200, `unauthenticated` on 401 (the session was
 *   refused — says nothing about the role), `refused` on 403 (the role is
 *   missing), `unknown` for anything else (a transport failure must never
 *   read as success)
 */
export async function probeConfigWriteAccess(
    tokenProvider: TokenProvider,
    org: string,
    site: string,
    logger: Logger,
): Promise<ConfigWriteAccess> {
    const path = `/config/${encodeURIComponent(org)}/sites/${encodeURIComponent(site)}.json`;
    const result = await call(tokenProvider, path, 'GET', undefined, false);

    if (result.status >= 200 && result.status < 300) {
        logger.debug(`[ConfigAccess] ${org}/${site}: config readable — admin role held`);
        return 'granted';
    }
    if (result.status === 401) {
        logger.debug(`[ConfigAccess] ${org}/${site}: session refused (401)`);
        return 'unauthenticated';
    }
    if (result.status === 403) {
        logger.debug(`[ConfigAccess] ${org}/${site}: refused (403)`);
        return 'refused';
    }
    logger.debug(`[ConfigAccess] ${org}/${site}: access indeterminate (${result.status})`);
    return 'unknown';
}

export interface RoleChangeResult extends GrantResult {
    /** False when the role list already matched the intent (no write issued). */
    changed?: boolean;
}

/** Case-insensitive membership — IMS and GitHub disagree on email casing. */
function includesEmail(list: string[], email: string): boolean {
    const target = email.toLowerCase();
    return list.some((entry) => entry.toLowerCase() === target);
}

/**
 * Make sure `email` holds the admin role on this site, keeping everyone else.
 *
 * Wraps {@link grantSiteAdmin}, which REPLACES the role list — calling that
 * directly with one email silently removes every other admin. This reads first
 * and merges, so the caller expresses an intent ("this person should be an
 * admin") rather than authoring a whole new list.
 *
 * Never writes when the current list could not be read: writing blind is exactly
 * the clobber this wrapper exists to prevent.
 *
 * @returns `ok` with `changed` telling you whether a write actually happened
 */
export async function ensureSiteAdmin(
    tokenProvider: TokenProvider,
    org: string,
    site: string,
    email: string,
    logger: Logger,
): Promise<RoleChangeResult> {
    const current = await readSiteAccess(tokenProvider, org, site, logger);
    // `readSiteAccess` reports an unreadable body as a non-ok status, so this
    // single check covers refusals, transport failures and shape drift alike.
    if (current.status !== 'ok' || !current.roles) {
        return { status: current.status, error: current.error };
    }

    const admins = current.roles[ADMIN_ROLE] ?? [];
    if (includesEmail(admins, email)) {
        // Masked like every other address here. `debug` is not buffered for export,
        // but it still reaches the Debug Logs channel users paste into tickets.
        logger.debug(`[ConfigAccess] ${org}/${site}: ${maskEmail(email)} already holds admin`);
        return { status: 'ok', changed: false };
    }

    const result = await grantSiteAdmin(tokenProvider, org, site, [...admins, email], logger);
    return { ...result, changed: result.status === 'ok' };
}

/**
 * Remove `email` from the site's admin role, keeping everyone else.
 *
 * Refuses to remove the LAST admin. Nobody could grant it back — the access
 * endpoint requires the very role being removed — so the site would be stranded
 * with no in-app recovery.
 */
export async function revokeSiteAdmin(
    tokenProvider: TokenProvider,
    org: string,
    site: string,
    email: string,
    logger: Logger,
): Promise<RoleChangeResult> {
    const current = await readSiteAccess(tokenProvider, org, site, logger);
    // Same single check as ensureSiteAdmin — see the note there.
    if (current.status !== 'ok' || !current.roles) {
        return { status: current.status, error: current.error };
    }

    const admins = current.roles[ADMIN_ROLE] ?? [];
    if (!includesEmail(admins, email)) {
        return { status: 'ok', changed: false };
    }

    const remaining = admins.filter((entry) => entry.toLowerCase() !== email.toLowerCase());
    if (remaining.length === 0) {
        logger.warn(
            `[ConfigAccess] ${org}/${site}: refusing to remove the last admin — ` +
                'the site would have no one able to grant access back',
        );
        return { status: 'invalid', error: 'cannot remove the last admin' };
    }

    const result = await grantSiteAdmin(tokenProvider, org, site, remaining, logger);
    return { ...result, changed: result.status === 'ok' };
}

/**
 * Write a whole role map back, verbatim.
 *
 * The one legitimate REPLACE: restoring grants that a delete destroyed. Deleting
 * a site config takes its access sub-resource with it (measured 2026-08-14 — two
 * admins in, delete + re-register, doc back at 404), so `updateSiteConfig`
 * captures the map first and hands it back here afterwards.
 *
 * Not for adding a person — that is {@link ensureSiteAdmin}, which reads and
 * merges. This one deliberately overwrites, because the caller already holds the
 * complete prior state.
 */
export async function restoreSiteRoles(
    tokenProvider: TokenProvider,
    org: string,
    site: string,
    roles: Record<string, string[]>,
    logger: Logger,
): Promise<GrantResult> {
    const path = adminAccessPath(org, site);
    const result = await call(tokenProvider, path, 'POST', { role: roles });
    const status = classify(result.status, result.noCredential);
    if (status === 'ok') {
        const count = Object.values(roles).reduce((n, list) => n + list.length, 0);
        logger.info(`[ConfigAccess] Restored ${count} grant(s) on ${org}/${site}`);
    } else {
        logger.warn(`[ConfigAccess] Could not restore grants on ${org}/${site}: ${status}`);
    }
    return { status, error: result.error };
}

/** Everything the Code Sync setup flow reads from its query string. */
export interface CodeSyncSetupParams {
    owner: string;
    repo: string;
    /** The DA.live content source; omitting it lands the tool's Content step empty. */
    contentSourceUrl: string;
    /** Pre-fills the Users step. Absent is fine — the user types it. */
    userEmail?: string;
}

/**
 * Build the AEM Code Sync setup deep link for a site.
 *
 * This is the bootstrap path for a user holding no admin role: the bot writes
 * with its own authority, so it can mint what the user cannot grant themselves.
 * Param shape observed verbatim 2026-08-14.
 *
 * @returns the setup URL, ready to open in a browser
 */
export function buildCodeSyncSetupUrl(params: CodeSyncSetupParams): string {
    const url = new URL(CODE_SYNC_SETUP_URL);
    url.searchParams.set('user', params.userEmail ?? '');
    url.searchParams.set('site', params.repo);
    url.searchParams.set('url', params.contentSourceUrl);
    url.searchParams.set('org', params.owner);
    return url.toString();
}
