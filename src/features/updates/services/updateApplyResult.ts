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
    /** The project's folder name: what the project tools and finish_storefront_update take. */
    projectName: string;
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
    /** Storefront updates kept to fix with AI, finished (EDS-57). */
    finish: CategoryResult;
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

/**
 * How one item of a run went, for a caller that shows each as it goes (the Updates
 * modal, 2026-10-21): started, done (with what to know), failed or left alone (with why).
 */
export type ItemOutcome =
    | { state: 'running' }
    | { state: 'done'; note?: string }
    | { state: 'failed' | 'skipped'; message: string };

/**
 * One item's outcome, from the result of applying it alone.
 *
 * @param result - what applying that one item answered
 * @param deferredLine - how a deferral reads, when the core records only a name
 * @returns failed when it failed, skipped when deferred, else done
 */
export function outcomeOf(result: CategoryResult, deferredLine?: (deferred: string) => string): ItemOutcome {
    if (result.failCount > 0) return { state: 'failed', message: result.errors.join(' ') };
    const deferred = result.deferred?.[0];
    if (deferred) return { state: 'skipped', message: deferredLine ? deferredLine(deferred) : deferred };
    const note = [...(result.applied ?? []), ...(result.installed ?? []), ...(result.leftOut ?? [])].join(' ');
    return note ? { state: 'done', note } : { state: 'done' };
}

/**
 * A template or Adobe boilerplate item's outcome, when the SC was asked about its clash.
 *
 * The result counts a clash as not applied, which the agent's totals rely on. But the
 * Updates modal always asks, so a clash it reports was the SC's answer: leave it, or
 * keep it for their AI to fix. That reads as left alone, not failed (owner,
 * 2026-10-21: a red "Merge conflicts" after choosing "Leave it as it is"). A clash that
 * could not be kept, or any other failure alongside it, still fails with its reason.
 *
 * @param result - what applying that one item answered
 * @returns skipped with what became of the clash, else as `outcomeOf` says
 */
export function answeredClashOutcome(result: CategoryResult): ItemOutcome {
    const clashes = result.clashes ?? [];
    const answered = clashes.length > 0 && clashes.length === result.failCount && clashes.every((c) => !c.notKept);
    if (!answered) return outcomeOf(result);
    return { state: 'skipped', message: clashes.map(answeredClashLine).join(' ') };
}

/** What a clash the SC answered says under its row, which already names the update. */
function answeredClashLine(clash: ClashReport): string {
    if (clash.keptIn) return 'Not updated yet. Your AI is working on it, and nothing goes live until you approve it.';
    return 'Not updated. The earlier edits were left as they are.';
}

const LINE_LISTS = ['deferred', 'applied', 'installed', 'leftOut'] as const;

/** Add one item's result to its category's. */
export function mergeInto(target: CategoryResult, from: CategoryResult): void {
    target.successCount += from.successCount;
    target.failCount += from.failCount;
    target.errors.push(...from.errors);
    for (const key of LINE_LISTS) {
        const lines = from[key];
        if (lines?.length) (target[key] ??= []).push(...lines);
    }
    if (from.clashes?.length) (target.clashes ??= []).push(...from.clashes);
}
