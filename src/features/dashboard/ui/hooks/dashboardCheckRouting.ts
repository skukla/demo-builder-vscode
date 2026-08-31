/**
 * Dashboard Check Routing
 *
 * Routes the on-open orchestrator's `checkResult` messages (decoupled from
 * statusUpdate) to the useDashboardStatus state they drive, by checkId.
 * Extracted from the hook's mount effect; the hook passes its setters in as
 * `CheckRoutingActions`, so the state itself stays owned by the hook.
 *
 * @module features/dashboard/ui/hooks/dashboardCheckRouting
 */

import type { Dispatch, SetStateAction } from 'react';
import type { DashboardStatusUpdatePayload, VerifyAiSetupResponse } from './dashboardStatusTypes';
import type { OrgMismatchInfo } from '@/features/authentication/services/detectProjectOrgMismatch';
import type { MeshVerifyCheckData } from '@/features/dashboard/services/onOpenChecks/meshVerifyCheck';
import type { OrgContextCheckData } from '@/features/dashboard/services/onOpenChecks/orgContextCheck';
import type { CheckOutcome, CheckStatus } from '@/features/dashboard/services/onOpenChecks/types';
import { CHECK_IDS } from '@/types/messages';

/** The slices of useDashboardStatus state a check outcome may update. */
export interface CheckRoutingActions {
    setOrgChecked: (checked: boolean) => void;
    setOrgStatus: (status: CheckStatus | undefined) => void;
    setOrgMismatch: (mismatch: OrgMismatchInfo | undefined) => void;
    setOrgCurrentName: (name: string | undefined) => void;
    setMcpHealing: (healing: boolean) => void;
    setAiToolingMissing: (missing: boolean) => void;
    setProjectStatus: Dispatch<SetStateAction<DashboardStatusUpdatePayload | null>>;
    setVerifyResult: (result: VerifyAiSetupResponse | null) => void;
    setVerifyFailed: (failed: boolean) => void;
    setAiBusy: (busy: boolean) => void;
}

/**
 * Apply one on-open check result, routed by checkId:
 *   - org-context: `pending` telegraph → ok / warning (mismatch) / unknown
 *     ("sign in to check"). Re-checks (after a switch / re-auth) repeat.
 *   - mcp-health: `warning` telegraphs a visible self-heal of stale MCP
 *     paths; ok/error ends it.
 *   - ai-context-freshness, mesh-verify, ai-verify: see the branch comments.
 */
export function routeCheckOutcome(
    outcome: CheckOutcome<OrgContextCheckData>,
    actions: CheckRoutingActions,
): void {
    if (outcome.checkId === CHECK_IDS.ORG_CONTEXT) {
        if (outcome.status === 'pending') {
            actions.setOrgChecked(false);
            actions.setOrgStatus('pending');
            actions.setOrgMismatch(undefined);
            actions.setOrgCurrentName(undefined);
            return;
        }
        actions.setOrgChecked(true);
        actions.setOrgStatus(outcome.status);
        actions.setOrgMismatch(outcome.data?.orgMismatch);
        actions.setOrgCurrentName(outcome.data?.currentOrg);
        return;
    }

    if (outcome.checkId === CHECK_IDS.MCP_HEALTH) {
        // `warning` = heal in flight; `ok`/`error` end it. The AI badge
        // reflects the in-flight state; a failed heal falls back to the
        // verify-driven badge (whose "Regenerate AI files" is the retry).
        actions.setMcpHealing(outcome.status === 'warning');
        return;
    }

    if (outcome.checkId === CHECK_IDS.AI_CONTEXT_FRESHNESS) {
        // Detect-only: `warning` = the COMPOSITION axis found tooling the
        // project qualifies for but does not have (a real download —
        // consent stays with the user) → flip the badge to "AI tooling
        // missing". Version staleness no longer warns here: the
        // activation sweep repairs it silently (ADR-013 hash-and-skip).
        // reRunnable, so a Regenerate clears this on the next refresh.
        actions.setAiToolingMissing(outcome.status === 'warning');
        return;
    }

    if (outcome.checkId === CHECK_IDS.MESH_VERIFY) {
        // The deployed mesh was background-verified. `warning` = it's gone
        // → flip the badge to not-deployed (now VISIBLE, not a silent state
        // mutation). `unknown` = transient verify error → leave the badge as
        // persisted (don't scare). `ok` = still there → keep current badge.
        const meshOutcome = outcome as CheckOutcome<MeshVerifyCheckData>;
        if (meshOutcome.status === 'warning') {
            actions.setProjectStatus((prev) =>
                prev
                    ? {
                          ...prev,
                          mesh: {
                              status: 'not-deployed',
                              message: meshOutcome.message,
                              endpoint: prev.mesh?.endpoint,
                          },
                      }
                    : prev,
            );
        }
        return;
    }

    if (outcome.checkId === CHECK_IDS.AI_VERIFY) {
        // The single on-open AI verification (the hook no longer pulls it).
        // `data` carries {checks, inventory} → drives the AI badge + skills/
        // MCP modal. A thrown verify arrives as an error outcome with no data
        // → mark verify failed so the badge leaves 'Verifying'.
        const aiData = (outcome as CheckOutcome<VerifyAiSetupResponse>).data;
        if (aiData) {
            actions.setVerifyResult(aiData);
            actions.setVerifyFailed(false);
        } else {
            actions.setVerifyFailed(true);
        }
        actions.setAiBusy(false);
    }
}
