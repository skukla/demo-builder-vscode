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
 *   - `warning` — reachable list doesn't include the project's org (banner +
 *                 user-initiated "Switch IMS Org"),
 *   - `unknown` — no valid token OR the SDK couldn't answer ("sign in to check").
 *
 * The browser only ever opens from a USER action (Switch IMS Org / Sign in) —
 * never from this automatic open-time check.
 *
 * @module features/dashboard/services/onOpenChecks/orgContextCheck
 */

import type { CheckOutcome, OnOpenCheck, OnOpenCheckContext } from './types';
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

const unknownOutcome = (): CheckOutcome<OrgContextCheckData> => ({
    checkId: CHECK_IDS.ORG_CONTEXT,
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

export const orgContextCheck: OnOpenCheck = {
    id: CHECK_IDS.ORG_CONTEXT,
    mode: 'background',
    // Live check: a forced Switch IMS Org / re-auth re-invokes requestStatus to
    // re-check, so it must run every time (not once per session).
    reRunnable: true,
    async run(ctx: OnOpenCheckContext): Promise<CheckOutcome<OrgContextCheckData>> {
        const { project, logger, post } = ctx;

        const expectedOrg = project.adobe?.organization;
        if (!expectedOrg) {
            // No Adobe org on this project — nothing to check (badge stays hidden).
            return { checkId: CHECK_IDS.ORG_CONTEXT, status: 'ok' };
        }

        // Telegraph "Checking…" (preserves the min-display UX); resolves fast (no CLI).
        post({ checkId: CHECK_IDS.ORG_CONTEXT, status: 'pending' });

        const authManager = ServiceLocator.getAuthenticationService();

        // P1: token-only check — no browser. No valid token → unknown.
        if (!(await authManager.isAuthenticated())) {
            return unknownOutcome();
        }

        // P1: SDK-only org read — never the CLI fallback. Empty → unknown.
        const orgs = await authManager.getOrganizationsSdkOnly();
        if (orgs.length === 0) {
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
            // Defensive: detector couldn't resolve despite a non-empty org list.
            return unknownOutcome();
        }

        if (result.reachable) {
            await selfHealOrgData(project, result, logger);
            return {
                checkId: CHECK_IDS.ORG_CONTEXT,
                status: 'ok',
                data: { currentOrg: result.currentOrg },
            };
        }

        return {
            checkId: CHECK_IDS.ORG_CONTEXT,
            status: 'warning',
            message: 'This project is configured for a different Adobe organization',
            data: { orgMismatch: toMismatch(project, result), currentOrg: result.currentOrg },
        };
    },
};
