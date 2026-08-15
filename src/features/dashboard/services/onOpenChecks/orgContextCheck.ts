/**
 * org-context on-open check (the P1 surprise-browser fix).
 *
 * Opening a dashboard used to run the org check through `getOrganizations()`,
 * whose SDK-unavailable CLI fallback (`aio console org list`) can stall ~14.5s
 * and launch a browser. This check obeys P1 — it uses ONLY non-interactive
 * probes:
 *   - `isAuthenticated()` (token + expiry; no browser), then
 *   - `getOrganizationsSdkOnly()` (SDK-only; never the CLI fallback).
 *
 * and maps to:
 *   - `ok`      — token valid, project's org reachable (self-heals legacy data),
 *   - `warning` — the reachable list doesn't include the project's org — INCLUDING
 *                 the list being empty (a valid token that reaches no Console orgs
 *                 is a real answer, and only the forced "Switch IMS Org" login with
 *                 its account/org chooser can change it; a non-forced sign-in
 *                 silently reuses the same browser SSO session — 2026-08-13),
 *   - `unknown` — no valid token OR the SDK couldn't answer ("sign in to check").
 *
 * The browser only ever opens from a USER action (Switch IMS Org / Sign in) —
 * never from this automatic open-time check.
 *
 * @module features/dashboard/services/onOpenChecks/orgContextCheck
 */

import type { CheckResult, OnOpenCheck, OnOpenCheckContext } from './types';
import { ServiceLocator } from '@/core/di';
import type {
    OrgContextResult,
    OrgMismatchInfo,
} from '@/features/authentication/services/detectProjectOrgMismatch';
import type { Project } from '@/types';
import type { Logger } from '@/types/logger';
import { CHECK_IDS } from '@/types/messages';

/** Banner/badge payload the webview routes from a `checkResult{org-context}`. */
export interface OrgContextCheckData {
    /** Present only on `warning` — drives the mismatch banner. */
    orgMismatch?: OrgMismatchInfo;
    /** Name of the org the token currently reaches — drives the "IMS Org" badge. */
    currentOrg?: string;
}

const SIGN_IN_MESSAGE = 'Sign in to check organization';
const ORG_MISMATCH_MESSAGE = 'This project is configured for a different Adobe organization';

const unknownOutcome = (): CheckResult<OrgContextCheckData> => ({
    status: 'unknown',
    message: SIGN_IN_MESSAGE,
});

/**
 * Self-heal the project's org data when reachable: persist the org NAME (so a
 * later mismatch banner can name it) and migrate a legacy name-stored
 * `organization` to the canonical id (so detection matches by id next time).
 * One-time, manifest-only write; non-fatal.
 */
async function selfHealOrgData(project: Project, result: OrgContextResult, logger: Logger): Promise<void> {
    if (!project.adobe) return;
    let healed = false;
    if (result.currentOrg && project.adobe.organizationName !== result.currentOrg) {
        project.adobe.organizationName = result.currentOrg;
        healed = true;
    }
    if (result.currentOrgId && project.adobe.organization !== result.currentOrgId) {
        project.adobe.organization = result.currentOrgId;
        healed = true;
    }
    if (!healed) return;
    try {
        await ServiceLocator.getStateManager()?.saveProjectConfigOnly(project);
    } catch (error) {
        logger.debug('[OrgContextCheck] Could not self-heal org data (non-fatal)', error);
    }
}

/** Build the mismatch banner payload for the warning outcome. */
function toMismatch(project: Project, result: OrgContextResult): OrgMismatchInfo {
    return {
        expectedOrg: result.expectedOrg,
        // Prefer the persisted name; else fall back to the stored org field when
        // it's already a human name (legacy projects stored the name, which has
        // whitespace; an id/code never does).
        expectedOrgName: project.adobe?.organizationName
            ?? (/\s/.test(result.expectedOrg) ? result.expectedOrg : undefined),
        currentOrg: result.currentOrg,
    };
}

/**
 * Unlike the `createXCheck(deps)` factory checks (mesh/mcp/ai), org-context is a
 * bare singleton that reaches `ServiceLocator` for the auth service + state
 * manager directly. That's deliberate: it's a `reRunnable` live check with no
 * per-request collaborator that varies, so a factory would be abstraction for
 * symmetry's sake (YAGNI). Its tests stub the locator instead of passing fakes.
 */
export const orgContextCheck: OnOpenCheck = {
    id: CHECK_IDS.ORG_CONTEXT,
    mode: 'background',
    // Live check: a forced Switch IMS Org / re-auth re-invokes requestStatus to
    // re-check, so it must run every time (not once per session).
    reRunnable: true,
    async run(ctx: OnOpenCheckContext): Promise<CheckResult<OrgContextCheckData>> {
        const { project, logger, post } = ctx;

        const expectedOrg = project.adobe?.organization;
        if (!expectedOrg) {
            // No Adobe org on this project — nothing to check (badge stays hidden).
            return { status: 'ok' };
        }

        // Telegraph "Checking…" (preserves the min-display UX); resolves fast (no CLI).
        post({ status: 'pending' });

        const authManager = ServiceLocator.getAuthenticationService();

        // P1: token-only check — no browser. No valid token → unknown.
        if (!(await authManager.isAuthenticated())) {
            return unknownOutcome();
        }

        // P1: SDK-only org read — never the CLI fallback. `undefined` means the
        // SDK could not answer → unknown ("sign in to check"). An EMPTY list is a
        // real answer — the token reaches no Console orgs — and flows into the
        // detector below, which resolves it as unreachable → the mismatch warning
        // whose forced "Switch IMS Org" login (account/org chooser) is the only
        // recovery that can change the landed org (2026-08-13: the non-forced
        // sign-in offered by `unknown` reuses the browser SSO session and loops).
        const orgs = await authManager.getOrganizationsSdkOnly();
        if (orgs === undefined) {
            return unknownOutcome();
        }

        // Reuse the canonical detector with an SDK-only org source (no CLI path).
        const { detectProjectOrgMismatch } = await import(
            '@/features/authentication/services/detectProjectOrgMismatch'
        );
        const result = await detectProjectOrgMismatch(
            { getOrganizations: async () => orgs },
            project,
            logger,
        );
        if (!result) {
            // The detector saw the org list — possibly EMPTY, which is the point of this
            // change — and still could not resolve a mismatch.
            return unknownOutcome();
        }

        if (result.reachable) {
            await selfHealOrgData(project, result, logger);
            return { status: 'ok', data: { currentOrg: result.currentOrg } };
        }

        return {
            status: 'warning',
            message: ORG_MISMATCH_MESSAGE,
            data: { orgMismatch: toMismatch(project, result), currentOrg: result.currentOrg },
        };
    },
};
