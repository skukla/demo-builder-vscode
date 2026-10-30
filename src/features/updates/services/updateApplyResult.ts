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

import { describeEdit } from '@/features/updates/services/templateSyncMessages';
import type { ClashEdit } from '@/features/updates/services/templateSyncTypes';

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
    /** Whose edit each clashing file holds, when the update could tell. */
    edits?: ClashEdit[];
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
 * @param aiAsksFirst - whether the SC's AI asks before a fix goes live (`whenItGoesLive`)
 * @returns skipped with what became of the clash, else as `outcomeOf` says
 */
export function answeredClashOutcome(result: CategoryResult, aiAsksFirst: boolean): ItemOutcome {
    const clashes = result.clashes ?? [];
    const answered = clashes.length > 0 && clashes.length === result.failCount && clashes.every((c) => !c.notKept);
    if (!answered) return outcomeOf(result);
    return { state: 'skipped', message: clashes.map((clash) => answeredClashLine(clash, aiAsksFirst)).join(' ') };
}

/**
 * When a fix the SC's AI is making goes live, by `demoBuilder.ai.requireAgentConsent`: on,
 * the AI asks first; off, nothing asks (owner, 2026-10-30: "nothing goes live until you
 * approve it" was said either way, and was false with approvals off).
 *
 * @param aiAsksFirst - whether the setting is on
 * @returns the clause, lowercase, without a full stop
 */
function whenItGoesLive(aiAsksFirst: boolean): string {
    return aiAsksFirst ? 'your AI asks you before anything goes live' : 'it goes live as soon as your AI finishes';
}

/** {@link whenItGoesLive} as a sentence of its own. */
export function whenItGoesLiveSentence(aiAsksFirst: boolean): string {
    const clause = whenItGoesLive(aiAsksFirst);
    return `${clause.charAt(0).toUpperCase()}${clause.slice(1)}.`;
}

/**
 * Whose edits a clash ran into, in a few words and no file names (owner, 2026-10-24: the AI is
 * handed those): "an edit that came with kmanns/justrite", or "an edit made in this storefront".
 */
function whoseEditsLine(clash: ClashReport): string {
    const edits = clash.edits ?? [];
    const from = edits.length > 0 && edits.every((e) => e.whose === 'copied-demo' && e.from === edits[0].from) ? edits[0].from : undefined;
    const noun = clash.files.length > 1 ? 'edits' : 'an edit';
    return from ? `${noun} that came with ${from}` : `${noun} made in this storefront`;
}

/** What a clash the SC answered says under its row, which already names the update. */
function answeredClashLine(clash: ClashReport, aiAsksFirst: boolean): string {
    if (clash.keptIn) return `Not updated yet. Your AI is working on it, and ${whenItGoesLive(aiAsksFirst)}.`;
    const left = clash.files.length > 1 ? 'were left as they are' : 'was left as it is';
    return `Not updated. It clashes with ${whoseEditsLine(clash)}, which ${left}. Nothing was changed.`;
}

/** A storefront update that stopped on a clash, as the agent tool reports it at the top. */
export interface StoppedUpdate {
    project: string;
    projectName: string;
    /** Which update stopped. */
    update: 'template' | 'Adobe boilerplate' | 'finishing a kept fix';
    files: string[];
    edits?: ClashEdit[];
    /** Always false: a stopped update pushes nothing. */
    pushed: false;
    keptIn?: string;
    notKept?: string;
}

const UPDATE_NAME: Record<'template' | 'boilerplate' | 'finish', StoppedUpdate['update']> = {
    template: 'template',
    boilerplate: 'Adobe boilerplate',
    finish: 'finishing a kept fix',
};

/** Every storefront update in a run that stopped on a clash, across the three categories that can. */
export function stoppedUpdates(result: Pick<ApplyUpdatesResult, 'template' | 'boilerplate' | 'finish'>): StoppedUpdate[] {
    return (['template', 'boilerplate', 'finish'] as const).flatMap((category) =>
        (result[category].clashes ?? []).map((clash) => ({
            project: clash.project,
            projectName: clash.projectName,
            update: category === 'finish' ? UPDATE_NAME.finish : UPDATE_NAME[clash.track],
            files: clash.files,
            ...(clash.edits ? { edits: clash.edits } : {}),
            pushed: false as const,
            ...(clash.keptIn ? { keptIn: clash.keptIn } : {}),
            ...(clash.notKept ? { notKept: clash.notKept } : {}),
        })),
    );
}

/** One sentence for the stopped updates: what stopped, on what, and that nothing changed. */
export function describeStopped(stopped: readonly StoppedUpdate[]): string {
    const each = stopped.map((s) => {
        const files = s.edits?.length ? s.edits.map(describeEdit).join('; ') : s.files.join(', ');
        const kept = s.keptIn ? ` Kept in ${s.keptIn} to fix.` : '';
        return `${s.project} (${s.update}) stopped on ${files}.${kept}`;
    });
    const noun = stopped.length === 1 ? 'update' : 'updates';
    return `${stopped.length} storefront ${noun} did NOT apply and changed nothing on GitHub. ${each.join(' ')}`;
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
