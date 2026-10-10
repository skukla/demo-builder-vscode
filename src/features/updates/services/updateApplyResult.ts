/**
 * What a headless update run reports: one outcome per category, and the totals.
 *
 * Read by `updateApplyService` (which fills them), by `integrationUpdates`
 * (which fills the integration category) and by the `apply_updates` tool
 * (which hands them to the agent). Its own file so a category's apply code can
 * build an outcome without importing the orchestrator.
 *
 * @module features/updates/services/updateApplyResult
 */

/** Per-category outcome. */
export interface CategoryResult {
    successCount: number;
    failCount: number;
    /** Human-readable per-item failures (sanitized). */
    errors: string[];
    /**
     * Not applied, by policy: block libraries under the headless 'ask' → 'disabled'
     * rule, and integration pairs in a project of another Adobe org (the line says
     * to open that project).
     */
    deferred?: string[];
    /** One plain line per integration pair updated: what the update did (AB-73). */
    applied?: string[];
    /** One plain line per block library installed: what was added to the storefront. */
    installed?: string[];
    /**
     * One plain line per block library update that left authoring entries out
     * because the SC had removed them by hand (EDS-36).
     */
    leftOut?: string[];
}

/** Aggregate outcome across all categories. */
export interface ApplyUpdatesResult {
    forkSync: CategoryResult;
    template: CategoryResult;
    component: CategoryResult;
    adobeMcp: CategoryResult;
    addon: CategoryResult;
    blockLibraryInstall: CategoryResult;
    integration: CategoryResult;
    totalApplied: number;
    totalFailed: number;
}

/** A category outcome with nothing applied and nothing failed. */
export function emptyResult(): CategoryResult {
    return { successCount: 0, failCount: 0, errors: [] };
}
