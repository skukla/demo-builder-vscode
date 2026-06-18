/**
 * detectProjectOrgMismatch — the canonical "is this project's org reachable?" check.
 *
 * IMS tokens are org-bound: a token reaches exactly one Adobe org. When a user
 * opens/operates on an existing project whose Adobe org differs from the org
 * their current token reaches (e.g. another browser tab silently signed them
 * into a different org), every Adobe op against the project would fail with
 * ORG_MISMATCH.
 *
 * This is the ONE proactive entry check. It compares the project's expected org
 * against the token's reachable org via the canonical `ensureOrgContext` helper
 * (which never mutates the global `aio` selection). Any flow that needs to guard
 * on org reachability (dashboard status, mesh deploy, etc.) MUST call this rather
 * than hand-rolling an `org.id !== project.adobe.organization` comparison.
 *
 * The result names the current org — taken from `getOrganizations()[0]`, the
 * token's single reachable org. We deliberately do NOT use
 * `getCurrentOrganization()`: that reads the Adobe CLI's persisted console
 * selection, which goes stale after a forced account switch (it can still report
 * the *previous* org). The token's reachable list is the source of truth.
 */

import { ensureOrgContext } from './ensureOrgContext';
import type { AdobeOrg } from './types';
import type { Project } from '@/types';
import type { Logger } from '@/types/logger';

/**
 * Identifies an org-context mismatch for the dashboard banner (UI shape).
 */
export interface OrgMismatchInfo {
    /** Org id the project was created under (the target org). */
    expectedOrg: string;
    /** Human name of the project's org, if persisted (created/backfilled). */
    expectedOrgName?: string;
    /** Human name of the org the current token actually reaches, if known. */
    currentOrg?: string;
}

/**
 * Full org-context result: whether the project's org is reachable, plus the name
 * of the org the token currently reaches (for the "IMS Org" status badge).
 */
export interface OrgContextResult {
    /** True when the project's org is reachable by the current token. */
    reachable: boolean;
    /** Org id the project was created under (as stored — may be a legacy name). */
    expectedOrg: string;
    /** Canonical id of the org the token reaches (for self-healing legacy data). */
    currentOrgId?: string;
    /** Name of the org the token actually reaches (the current org), if known. */
    currentOrg?: string;
}

/** Minimal auth surface this detector needs (kept structural for testability). */
export interface OrgAwareAuthManager {
    getOrganizations(): Promise<AdobeOrg[]>;
}

/**
 * Resolve the project's org-context against the current token.
 *
 * @returns an `OrgContextResult` (reachable + current org name); `undefined`
 *   when there's no Adobe org to check, or the check can't run (non-fatal —
 *   callers still proceed/render).
 */
export async function detectProjectOrgMismatch(
    authManager: OrgAwareAuthManager,
    project: Project,
    logger: Logger,
): Promise<OrgContextResult | undefined> {
    const expectedOrg = project.adobe?.organization;
    if (!expectedOrg) {
        // No Adobe org on this project (fresh creation / non-Adobe) — nothing to check.
        return undefined;
    }

    try {
        const orgs = (await authManager.getOrganizations()) ?? [];
        const result = await ensureOrgContext(expectedOrg, {
            listSelectableOrgs: async () =>
                orgs.map((org) => ({ id: org.id, code: org.code, name: org.name })),
        });

        // Token is org-bound: its single reachable org IS the current org.
        const currentOrg = orgs[0]?.name;
        const currentOrgId = orgs[0]?.id;
        return { reachable: result.status === 'ok', expectedOrg, currentOrgId, currentOrg };
    } catch (error) {
        // Non-fatal: if we can't determine reachability (e.g. not authenticated),
        // skip the check — the needs-auth path handles unauthenticated state.
        logger.debug('[Auth] Org-context check skipped (non-fatal)', error);
        return undefined;
    }
}
