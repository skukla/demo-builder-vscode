/**
 * Undo what the ERP integration wrote onto Commerce, before it is removed.
 *
 * The integration sets company credit limits and blocks, and ERP order numbers
 * on orders. Its `erp/detach` action reverts those (Commerce cannot delete the
 * notes it also wrote). Once the integration is undeployed that action is gone,
 * so removal has to call it first; nothing did until 2026-09-17, and every
 * removal left those writes behind.
 *
 * @module features/app-builder/services/erpDetach
 */

import type { AppManagementAuth } from './appManagementClient';
import { ErpIntegrationClient, deriveErpActionUrl, type ErpDetachReport } from './erpIntegrationClient';

export interface CommerceDetachResult {
    /** skipped: the component deploys no detach action (it is not the ERP integration). */
    status: 'detached' | 'skipped' | 'failed';
    /** Plain-words line for the SC. */
    detail?: string;
}

export interface ErpDetachDeps {
    getAuth: () => Promise<AppManagementAuth | undefined>;
    onProgress?: (message: string) => void;
    fetchImpl?: typeof fetch;
}

const count = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

function describe(report: ErpDetachReport): CommerceDetachResult {
    const reverted = report.reverted?.reverted ?? 0;
    const cleared = report.orders?.cleared ?? 0;
    const failed = (report.reverted?.failed.length ?? 0) + (report.orders?.failed.length ?? 0);
    const done =
        `Undid ${count(reverted, 'company change', 'company changes')} and cleared ` +
        `${count(cleared, 'ERP order number', 'ERP order numbers')} in Commerce.`;
    if (failed > 0) {
        return {
            status: 'failed',
            detail: `${done} ${count(failed, 'change', 'changes')} could not be undone and stay in Commerce.`,
        };
    }
    return { status: 'detached', detail: done };
}

/**
 * Call the integration's `erp/detach`, when it has one.
 *
 * @param deployedUrls - the integration's per-action URL map
 * @returns what was undone, or why it was not
 */
export async function detachErpWrites(
    deployedUrls: Record<string, string> | undefined,
    deps: ErpDetachDeps,
): Promise<CommerceDetachResult> {
    if (!deriveErpActionUrl(deployedUrls, 'detach')) {
        return { status: 'skipped' };
    }
    deps.onProgress?.("Undoing the ERP's changes in Commerce");
    const auth = await deps.getAuth();
    if (!auth) {
        return {
            status: 'failed',
            detail: "Could not sign in to undo the ERP's changes in Commerce; they stay there.",
        };
    }
    try {
        return describe(await new ErpIntegrationClient(deployedUrls, auth, deps.fetchImpl).detach());
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        return { status: 'failed', detail: `The ERP's changes in Commerce were not undone: ${reason}` };
    }
}
