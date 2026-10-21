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
    /**
     * One per template or Adobe boilerplate update that stopped on a clash: the files,
     * and where the clash is kept for fixing when it was (EDS-57).
     */
    clashes?: ClashReport[];
}

/** A clash a storefront update stopped on (EDS-57). */
export interface ClashReport {
    /** The project, as the SC names it. */
    project: string;
    /** `template`: the template's (or a colleague's) changes; `boilerplate`: Adobe's tested version. */
    track: 'template' | 'boilerplate';
    /** The clashing files, repository-relative. */
    files: string[];
    /** The local storefront copy holding the clash, when it was kept for fixing. */
    keptIn?: string;
    /** Why keeping it for fixing did not work, when that was tried. */
    notKept?: string;
}

/** Aggregate outcome across all categories. */
export interface ApplyUpdatesResult {
    forkSync: CategoryResult;
    template: CategoryResult;
    /** A colleague's storefront's Adobe half, to our tested version (EDS-56). */
    boilerplate: CategoryResult;
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
