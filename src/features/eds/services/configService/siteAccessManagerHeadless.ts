/**
 * Manage who administers a storefront's Configuration Service entry — UI-free.
 *
 * The core behind the "Manage Site Access" command, kept free of `vscode` UI so
 * an MCP tool can call the same code (mirrors `refreshBlockLibraryHeadless`).
 *
 * ## Every mutation is confirmed by a re-read
 *
 * A 200 from the write is NOT proof the role landed. This whole feature exists
 * because a storefront reported success while its overlay was never registered,
 * so each mutation here re-reads the role list and reports `verified` separately
 * from `status`. A caller may report success only when both agree.
 *
 * ## Why `canManage` is probed rather than assumed
 *
 * The grant endpoint sits behind the same `[admin]` gate as the config read, so
 * an identity without the role cannot add anyone — including itself. Offering
 * an "Add user" affordance that is guaranteed to 403 is worse than saying up
 * front that this identity cannot manage access.
 *
 * @module features/eds/services/configService/siteAccessManagerHeadless
 */

import type * as vscode from 'vscode';
import { maskEmail } from '@/core/utils/maskEmail';
import { getDaLiveAuthService } from '@/features/eds/handlers/edsHelpers';
import {
    ensureSiteAdmin,
    probeConfigWriteAccess,
    readOrgAdmins,
    readSiteAccess,
    revokeSiteAdmin,
} from '@/features/eds/services/configService/configServiceAccess';
import { createDaLiveServiceTokenProvider } from '@/features/eds/services/daLive/daLiveContentOperations';
import type { Project } from '@/types/base';
import type { Logger } from '@/types/logger';
import { getEdsRepoParts } from '@/types/typeGuards';

/**
 * Outcomes a caller must be able to tell apart to say anything useful.
 *
 * `no_credential` is distinct from `not_authorized` on purpose: one is fixed by
 * signing in to DA.live, the other cannot be fixed by this user at all. Merging
 * them would send someone to re-authenticate against a permissions problem.
 */
export type SiteAccessStatus =
    | 'ok'
    | 'not_authorized'
    | 'no_credential'
    | 'no_site'
    | 'invalid'
    | 'failed';

export interface SiteAccessListing {
    status: SiteAccessStatus;
    /** `owner/repo`, for display. Absent when the project has no EDS storefront. */
    site?: string;
    /** Emails holding the SITE-level admin role. */
    siteAdmins?: string[];
    /** Emails holding the ORG-level role — they administer every site in the org. */
    orgAdmins?: string[];
    /** Whether THIS identity can actually change the list (probed, not assumed). */
    canManage: boolean;
    error?: string;
}

export interface SiteAccessMutation extends SiteAccessListing {
    /** True only when a re-read confirms the intended change actually landed. */
    verified: boolean;
}

/**
 * `canManage` on a MUTATION result is derived, never hand-set.
 *
 * Set per-branch it went incoherent: a revoke refusal returned
 * `status:'not_authorized'` alongside `canManage:true` — "you cannot manage
 * this" paired with "you can".
 *
 * An ALLOW-list, not `!== 'not_authorized'`. That first form said "yes you can
 * manage" for `no_credential` (not signed in) and `no_site`, reintroducing the
 * same contradiction one status over. Only these two mean the identity is
 * genuinely able to manage: the call went through, or it never left because the
 * input was malformed.
 */
const canManageFrom = (status: SiteAccessStatus): boolean =>
    status === 'ok' || status === 'invalid';

/** Cheap sanity check — a typo'd address writes a role nobody can use. */
export function looksLikeEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** Resolve the storefront's `owner/repo` plus a DA.live token provider. */
function resolveSite(
    project: Project,
    context: vscode.ExtensionContext,
): { owner: string; repo: string; tokenProvider: ReturnType<typeof createDaLiveServiceTokenProvider> } | undefined {
    const parts = getEdsRepoParts(project);
    if (!parts) return undefined;
    return {
        owner: parts.owner,
        repo: parts.repo,
        tokenProvider: createDaLiveServiceTokenProvider(getDaLiveAuthService(context)),
    };
}

/**
 * Who administers this project's storefront configuration.
 *
 * @returns the site and org admin lists plus whether this identity can manage them
 */
export async function listSiteAccess(
    project: Project,
    context: vscode.ExtensionContext,
    logger: Logger,
): Promise<SiteAccessListing> {
    const resolved = resolveSite(project, context);
    if (!resolved) {
        return { status: 'no_site', canManage: false, error: 'no EDS storefront repo on project' };
    }
    const { owner, repo, tokenProvider } = resolved;
    const site = `${owner}/${repo}`;

    // Distinguish "not signed in" from "refused" BEFORE probing. The probe
    // reports only granted/refused/unknown, so a missing credential arrived as
    // 'failed' and the command told the user to check the Debug Logs instead of
    // to sign in — the exact merge the SiteAccessStatus docstring forbids.
    if (!(await tokenProvider.getAccessToken())) {
        return {
            status: 'no_credential',
            site,
            canManage: false,
            error: 'no DA.live credential stored',
        };
    }

    const access = await probeConfigWriteAccess(tokenProvider, owner, repo, logger);
    if (access !== 'granted') {
        // Do not offer affordances that are guaranteed to be refused.
        const orgRoster = await readOrgAdmins(tokenProvider, owner, logger);
        return {
            // `not_authorized` is a verdict about the ROLE. A 401 is a verdict
            // about the SESSION, and reporting it as not_authorized would send an
            // agent to fix permissions that were never checked.
            status: access === 'refused' ? 'not_authorized' : 'failed',
            ...(access === 'unauthenticated'
                ? { error: 'DA.live session refused (401) — sign in again' }
                : {}),
            site,
            canManage: false,
            orgAdmins: orgRoster.status === 'ok' ? orgRoster.admins : undefined,
        };
    }

    const [siteAccess, orgRoster] = await Promise.all([
        readSiteAccess(tokenProvider, owner, repo, logger),
        readOrgAdmins(tokenProvider, owner, logger),
    ]);

    // A failed site-role read must NOT report ok. `siteAdmins: undefined` renders
    // as an empty list downstream, which a user reads as "this site has no
    // admins" — success claimed over a partial failure, the shape this module
    // exists to prevent.
    if (siteAccess.status !== 'ok') {
        return {
            status: siteAccess.status === 'not_authorized' ? 'not_authorized' : 'failed',
            site,
            orgAdmins: orgRoster.status === 'ok' ? orgRoster.admins : undefined,
            canManage: false,
            error: siteAccess.error ?? 'could not read the site role list',
        };
    }

    return {
        status: 'ok',
        site,
        siteAdmins: siteAccess.roles?.admin ?? [],
        orgAdmins: orgRoster.status === 'ok' ? orgRoster.admins : undefined,
        canManage: true,
    };
}

/** Re-read the role list so a mutation can be confirmed rather than trusted. */
async function confirm(
    tokenProvider: ReturnType<typeof createDaLiveServiceTokenProvider>,
    owner: string,
    repo: string,
    logger: Logger,
    expect: (admins: string[]) => boolean,
): Promise<{ admins?: string[]; verified: boolean }> {
    const after = await readSiteAccess(tokenProvider, owner, repo, logger);
    if (after.status !== 'ok') return { verified: false };
    const admins = after.roles?.admin ?? [];
    return { admins, verified: expect(admins) };
}

const sameEmail = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

/**
 * Add an admin to this project's storefront configuration, then verify it stuck.
 */
export async function addSiteAdmin(
    project: Project,
    email: string,
    context: vscode.ExtensionContext,
    logger: Logger,
): Promise<SiteAccessMutation> {
    if (!looksLikeEmail(email)) {
        return {
            status: 'invalid',
            // Always true: an 'invalid' status means the INPUT was rejected, which says
        // nothing about whether this identity may manage access.
        canManage: true,
            verified: false,
            error: 'not an email address',
        };
    }
    const resolved = resolveSite(project, context);
    if (!resolved) return { status: 'no_site', canManage: false, verified: false };

    const { owner, repo, tokenProvider } = resolved;
    const site = `${owner}/${repo}`;
    const result = await ensureSiteAdmin(tokenProvider, owner, repo, email.trim(), logger);
    if (result.status !== 'ok') {
        return {
            status: result.status,
            site,
            canManage: canManageFrom(result.status),
            verified: false,
            error: result.error,
        };
    }

    const { admins, verified } = await confirm(tokenProvider, owner, repo, logger, (list) =>
        list.some((entry) => sameEmail(entry, email.trim())),
    );
    if (!verified) {
        logger.warn(
            `[SiteAccess] ${site}: grant for ${maskEmail(email)} did not verify on re-read`,
        );
    }
    return { status: 'ok', site, siteAdmins: admins, canManage: true, verified };
}

/**
 * Remove an admin from this project's storefront configuration, then verify it.
 *
 * The last-admin refusal comes from `revokeSiteAdmin` and is passed through: a
 * site with no admin cannot be granted one back from inside the app.
 */
export async function removeSiteAdmin(
    project: Project,
    email: string,
    context: vscode.ExtensionContext,
    logger: Logger,
): Promise<SiteAccessMutation> {
    const resolved = resolveSite(project, context);
    if (!resolved) return { status: 'no_site', canManage: false, verified: false };

    const { owner, repo, tokenProvider } = resolved;
    const site = `${owner}/${repo}`;
    const result = await revokeSiteAdmin(tokenProvider, owner, repo, email.trim(), logger);
    if (result.status !== 'ok') {
        return {
            status: result.status,
            site,
            canManage: canManageFrom(result.status),
            verified: false,
            error: result.error,
        };
    }

    const { admins, verified } = await confirm(tokenProvider, owner, repo, logger, (list) =>
        list.every((entry) => !sameEmail(entry, email.trim())),
    );
    return { status: 'ok', site, siteAdmins: admins, canManage: true, verified };
}
