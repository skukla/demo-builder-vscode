/**
 * detectProjectOrgMismatch — the canonical "is this project's org reachable?" check.
 *
 * IMS tokens are org-bound: a token reaches exactly one Adobe org. When a user
 * opens/operates on an existing project whose Adobe org differs from the org
 * their current token reaches (e.g. another browser tab silently signed them
 * into a different org), every Adobe op against the project would fail with
 * ORG_MISMATCH.
 *
 * This is the ONE proactive entry check. It surfaces the mismatch up front —
 * before any work — by comparing the project's expected org against the token's
 * reachable org via the canonical `ensureOrgContext` helper (which never mutates
 * the global `aio` selection). Any flow that needs to guard on org reachability
 * (dashboard status, mesh deploy, etc.) MUST call this rather than hand-rolling
 * an `org.id !== project.adobe.organization` comparison.
 *
 * The result names BOTH orgs so callers can be explicit: the expected org (by
 * id — the project stores no org name) and the org the token actually reaches
 * (by name). The recovery is a FORCED sign-in; see handleSwitchOrg.
 */

import { ensureOrgContext } from './ensureOrgContext';
import type { AdobeOrg } from './types';
import type { Project } from '@/types';
import type { Logger } from '@/types/logger';

/**
 * Identifies an org-context mismatch on an existing project.
 */
export interface OrgMismatchInfo {
    /** Org id the project was created under (the target org). */
    expectedOrg: string;
    /** Human name of the org the current token actually reaches, if known. */
    currentOrg?: string;
}

/** Minimal auth surface this detector needs (kept structural for testability). */
export interface OrgAwareAuthManager {
    getOrganizations(): Promise<AdobeOrg[]>;
    getCurrentOrganization?(): Promise<{ id: string; name?: string } | undefined>;
}

/**
 * Detect whether the project's Adobe org is reachable by the current token.
 *
 * @returns `OrgMismatchInfo` when the token reaches a different org than the
 *   project expects; `undefined` when there's no mismatch, no Adobe org to
 *   check, or the check can't run (non-fatal — callers still proceed/render).
 */
export async function detectProjectOrgMismatch(
    authManager: OrgAwareAuthManager,
    project: Project,
    logger: Logger,
): Promise<OrgMismatchInfo | undefined> {
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

        if (result.status === 'ok') {
            // Token reaches the project's org — no mismatch.
            return undefined;
        }

        // Mismatch: name the org the token actually reaches. The token is
        // org-bound, so the current org is the (single) reachable org; prefer
        // the explicit current-org lookup, fall back to the reachable list.
        const current = await authManager.getCurrentOrganization?.();
        const currentOrg = current?.name ?? orgs[0]?.name;
        return { expectedOrg, currentOrg };
    } catch (error) {
        // Non-fatal: if we can't determine reachability (e.g. not authenticated),
        // skip the check — the needs-auth path handles unauthenticated state.
        logger.debug('[Auth] Org-mismatch check skipped (non-fatal)', error);
        return undefined;
    }
}
