/**
 * Organization Handlers
 *
 * Backs the in-app org-picker so org selection is a normal pick-from-list step
 * (no forced re-login dead-end):
 * - get-organizations: list orgs with a selectable flag (reapplies the CLI's
 *   filterToSelectableOrgs rule; non-selectable orgs are returned, not dropped,
 *   so the picker can disable + explain them).
 * - select-org: route the chosen org through the canonical ensureOrgContext.
 *   On `ok` → success; on `needs_relogin` → a structured account-switch signal.
 *   NEVER forces re-login and NEVER runs `aio console org select`.
 * - re-detect-context: clear the org-context caches and re-read `console where`
 *   without forcing re-login (the terminal-then-reload dance, in-app).
 */

import {
    ensureOrgContext,
    getOrgSelectability,
    type SelectableOrgCandidate,
} from '@/features/authentication/services/ensureOrgContext';
import type { AdobeContext, AdobeOrg } from '@/features/authentication/services/types';
import { ErrorCode } from '@/types/errorCodes';
import { HandlerContext } from '@/types/handlers';
import { DataResult, SimpleResult } from '@/types/results';
import { toError } from '@/types/typeGuards';

/** An org row for the picker: display fields + a selectability verdict. */
export interface OrgPickerItem {
    id: string;
    code?: string;
    name?: string;
    selectable: boolean;
    reason?: string;
}

/** Map a raw org record to a picker row using the single selectability rule. */
function toOrgPickerItem(org: AdobeOrg): OrgPickerItem {
    const candidate: SelectableOrgCandidate = {
        id: org.id,
        code: org.code,
        name: org.name,
        type: org.type,
        runtime: org.runtime,
    };
    const { selectable, reason } = getOrgSelectability(candidate);
    return { id: org.id, code: org.code, name: org.name, selectable, reason };
}

/**
 * get-organizations - list orgs for the picker (no re-login).
 *
 * Returns the RAW org list (selectable ∪ non-selectable) so the UI can show
 * non-selectable orgs disabled with the "sign in with a different account"
 * affordance rather than silently hiding them.
 */
export async function handleGetOrganizations(
    context: HandlerContext,
): Promise<DataResult<OrgPickerItem[]>> {
    try {
        const orgs = (await context.authManager?.getOrganizations()) ?? [];
        const items = orgs.map(toOrgPickerItem);
        await context.sendMessage('get-organizations', items);
        return { success: true, data: items };
    } catch (error) {
        const message = 'Failed to load organizations. Please try again.';
        context.logger.error('Failed to get organizations:', toError(error));
        await context.sendMessage('get-organizations', { error: message });
        return { success: false, error: message };
    }
}

/**
 * select-org - establish org-context targeting for the chosen org (no re-login).
 *
 * Routes through ensureOrgContext (env targeting only). On `ok` we confirm; on
 * any non-ok status we emit a structured signal carrying the status + targetOrg
 * so the UI can offer the account-switch fallback. This handler itself NEVER
 * forces re-login and NEVER runs `aio console org select`.
 */
export async function handleSelectOrg(
    context: HandlerContext,
    payload: { orgId: string },
): Promise<SimpleResult> {
    const { orgId } = payload;

    const ctxResult = await ensureOrgContext(orgId, {
        listSelectableOrgs: async () => {
            const orgs = (await context.authManager?.getOrganizations()) ?? [];
            return orgs.map((org): SelectableOrgCandidate => ({
                id: org.id,
                code: org.code,
                name: org.name,
                type: org.type,
                runtime: org.runtime,
            }));
        },
    });

    if (ctxResult.status === 'ok') {
        await context.sendMessage('select-org', {
            status: 'ok',
            targetOrg: ctxResult.targetOrg,
        });
        return { success: true };
    }

    await context.sendMessage('select-org', {
        status: ctxResult.status,
        code: ErrorCode.ORG_MISMATCH,
        targetOrg: ctxResult.targetOrg,
    });
    return { success: false, code: ErrorCode.ORG_MISMATCH };
}

/**
 * re-detect-context - clear org-context caches + re-read `console where`.
 *
 * Composes the targeted cache clears (session + console-where + validation) so
 * an external auth change (terminal force-login / org-select) becomes visible
 * in-app WITHOUT forcing re-login and WITHOUT nuking the auth-status / token
 * caches (which `clearAll` would).
 */
export async function handleReDetectContext(
    context: HandlerContext,
): Promise<DataResult<AdobeContext>> {
    try {
        const cacheManager = context.authManager?.getCacheManager();
        cacheManager?.clearSessionCaches();
        cacheManager?.clearConsoleWhereCache();
        cacheManager?.clearValidationCache();

        const adobeContext = (await context.authManager?.getCurrentContext()) ?? {};
        await context.sendMessage('re-detect-context', adobeContext);
        return { success: true, data: adobeContext };
    } catch (error) {
        const message = 'Failed to re-detect Adobe context. Please try again.';
        context.logger.error('Failed to re-detect context:', toError(error));
        await context.sendMessage('re-detect-context', { error: message });
        return { success: false, error: message };
    }
}
