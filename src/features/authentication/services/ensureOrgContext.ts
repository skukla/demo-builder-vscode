/**
 * ensureOrgContext — the ONE canonical org-targeting helper.
 *
 * Replaces the ~5 bespoke org-correction variants scattered across the app.
 * Given a target org ID, it resolves whether that org is reachable and
 * establishes per-invocation env targeting for it — WITHOUT ever running the
 * store-mutating `aio console * select` (which races across processes and
 * poisons the shared global). Callers run their dependent op under the returned
 * target via `withOrgContext`.
 *
 * Typed result lets UI and MCP consumers branch precisely:
 * - ok            → target is selectable; run the dependent op under targeting.
 * - needs_relogin → target absent from the selectable list (wrong account /
 *                   filtered org); the UI must FORCE re-login to switch account.
 * - access_revoked→ target is selectable but a probe still 403s under targeting
 *                   (identity lost access); surface "pick a different org".
 * - org_mismatch  → reserved for callers that detect a mismatch they can't heal;
 *                   carried for symmetry with the error taxonomy.
 */

import { getActiveOrgContext, withOrgContext, type OrgContextTarget } from './orgContextEnv';

/**
 * Minimal org shape needed to decide selectability and build a full env target.
 * Mirrors the raw `aio console org list` / SDK org record: enterprise orgs and
 * developer orgs carry a `type`; developer orgs expose a RUNTIME feature flag.
 */
export interface SelectableOrgCandidate {
    id: string;
    code?: string;
    name?: string;
    type?: string;
    /** True when a developer org has the App Builder RUNTIME feature. */
    runtime?: boolean;
}

export type EnsureOrgContextStatus =
    | 'ok'
    | 'org_mismatch'
    | 'needs_relogin'
    | 'access_revoked';

export interface EnsureOrgContextResult {
    status: EnsureOrgContextStatus;
    /** The resolved target org record (or `{ id }` when not found). */
    targetOrg: { id: string } | SelectableOrgCandidate;
}

/**
 * Result of probing the target org under targeting. `forbidden` true means the
 * probe 403'd even with the correct org targeted → access was revoked.
 */
export interface OrgProbeResult {
    forbidden: boolean;
}

export interface EnsureOrgContextOptions {
    /** Returns the SELECTABLE orgs (already filtered). */
    listSelectableOrgs: () => Promise<SelectableOrgCandidate[]>;
    /**
     * Optional probe run UNDER org-context targeting to detect revoked access.
     * Receives the active target so it can issue a targeted `aio` call.
     */
    probe?: (target: OrgContextTarget) => Promise<OrgProbeResult>;
    /**
     * GUARD ONLY. The store-mutating org-select fn that this helper must NEVER
     * call. Injected by tests to assert it is never invoked. Production wiring
     * leaves it undefined.
     */
    runSelect?: (orgId: string) => Promise<unknown>;
}

/** Whether an org can be selected by the CLI, plus a reason when it can't. */
export interface OrgSelectability {
    selectable: boolean;
    reason?: string;
}

/**
 * The ONE selectability rule, mirroring `aio-cli-lib-console`'s
 * `filterToSelectableOrgs`: keep enterprise orgs, plus developer orgs that have
 * the RUNTIME feature. Everything else is non-selectable by the CLI. Returned as
 * a typed verdict so the picker can disable rows AND explain why (the
 * account-switch hint) without duplicating the rule.
 */
export function getOrgSelectability(org: SelectableOrgCandidate): OrgSelectability {
    if (org.type === 'entp') return { selectable: true };
    if (org.type === 'developer') {
        return org.runtime === true
            ? { selectable: true }
            : {
                selectable: false,
                reason: 'This developer organization does not have App Builder runtime access.',
            };
    }
    return {
        selectable: false,
        reason: 'This organization is not available on your current Adobe account. '
            + 'Sign in with a different account to use it.',
    };
}

/**
 * Reimplements `aio-cli-lib-console`'s `filterToSelectableOrgs` on top of the
 * single {@link getOrgSelectability} rule.
 */
export function filterToSelectableOrgs<T extends SelectableOrgCandidate>(orgs: T[]): T[] {
    return orgs.filter((org) => getOrgSelectability(org).selectable);
}

/**
 * Resolve and establish org-context targeting for `orgId`.
 *
 * Never mutates the shared global store and never calls `aio console * select`.
 */
export async function ensureOrgContext(
    orgId: string,
    options: EnsureOrgContextOptions,
): Promise<EnsureOrgContextResult> {
    const selectable = await options.listSelectableOrgs();
    const target = selectable.find((org) => org.id === orgId);

    if (!target) {
        // Target org isn't selectable on this account → only a (force) re-login
        // with the correct account can surface it.
        return { status: 'needs_relogin', targetOrg: { id: orgId } };
    }

    // Establish env targeting and (optionally) probe for revoked access.
    const { probe } = options;
    if (probe) {
        const envTarget: OrgContextTarget = {
            orgId: target.id,
            orgCode: target.code,
            orgName: target.name,
        };
        const probeResult = await withOrgContext(envTarget, () =>
            probe(getActiveOrgContext() ?? envTarget),
        );
        if (probeResult.forbidden) {
            return { status: 'access_revoked', targetOrg: target };
        }
    }

    return { status: 'ok', targetOrg: target };
}
