/**
 * Remembering what a prompt used to cost.
 *
 * "Is this getting better?" is the question the whole feature exists to answer,
 * and until this existed it could only be answered inside one sitting — close
 * the window and "$0.14, down from $0.21" was gone. A delta that dies with the
 * session is a demo of the idea rather than the idea.
 *
 * ## What is kept, and what is deliberately not
 *
 * Five numbers per run and the prompt that produced them. **Not the trace.**
 * That is the diagnostic someone reads once, it is large, and keeping it would
 * recreate the unbounded-log concern the in-memory recorder was capped to avoid.
 *
 * ## The key is the THREAD, not the prompt text
 *
 * A thread is one piece of work — "getting this prompt right". It began by
 * keying on the text, which meant improving a prompt destroyed its history:
 * "down from $0.24" fired only when re-running something unchanged, the one case
 * where nothing improved. The headline feature did not work during the loop it
 * was built for.
 *
 * Threads are DECLARED. The workbench starts one when a producer types into an
 * empty composer, continues it while they refine, and resumes one when they load
 * a saved prompt. No fuzzy matching: a producer must be able to say why two runs
 * are in the same thread.
 *
 * Each run still stores the text it used, which is what makes "revert to the
 * cheapest version" possible.
 *
 * ## Where it lives
 *
 * `Project.evaluationHistory` in `.demo-builder.json`, matching the rule
 * `aiPrompts` already set — project-specific in the manifest, global in
 * extension state. An evaluation is always against one project.
 *
 * @module features/ai/evaluation/evaluationHistory
 */

import type { EvaluationRun } from '@/types/base';

/**
 * Runs kept per THREAD, and how they are chosen.
 *
 * Ten is what a trend needs. Note WHICH ten: the newest, plus the CHEAPEST run
 * even when it is old. Pure recency would evict the best version of a prompt for
 * being old — and that is the one a producer would come back for, which is the
 * whole reason to keep history at all.
 */
export const RUNS_PER_THREAD = 10;

/**
 * How many threads a project keeps.
 *
 * The second bound: without it, a producer who never repeats a prompt
 * accumulates one thread each, forever. The LEAST RECENTLY RUN thread is dropped
 * whole — recency is the honest proxy for "still working on this", and a stump
 * of one run is not comparable against anything, so partial eviction costs bytes
 * and buys nothing.
 */
export const THREADS_PER_PROJECT = 25;

/**
 * Worst case on disk: 25 threads x 10 runs x (~5 numbers + the prompt text).
 * A 200-byte prompt puts that near 50KB — small for a manifest that already
 * carries component state, and the reason the caps can be generous.
 */

/** What a new run should be compared against, if anything. */
export interface Delta {
    /** The most recent PREVIOUS run in this thread. */
    previous: EvaluationRun;
    /** How many earlier runs the thread holds. */
    priorRuns: number;
    /** The cheapest run so far — what "go back to" would mean. */
    best: EvaluationRun;
}

/**
 * What this thread cost last time, and at its best.
 *
 * @param history - the project's stored runs, oldest first
 * @param threadId - the piece of work being continued
 * @returns the comparison, or undefined when the thread has no past
 */
export function findDelta(
    history: readonly EvaluationRun[] | undefined,
    threadId: string,
): Delta | undefined {
    const mine = (history ?? []).filter((r) => r.threadId === threadId);
    const previous = mine[mine.length - 1];
    // Undefined rather than a zero delta: "no change" and "never run before" are
    // different facts, and a zero would read as the first.
    if (!previous) return undefined;
    const best = mine.reduce((a, b) => (b.costUSD < a.costUSD ? b : a), mine[0]);
    return { previous, priorRuns: mine.length, best };
}

/** Every run of one thread, oldest first. */
export function runsInThread(
    history: readonly EvaluationRun[] | undefined,
    threadId: string,
): EvaluationRun[] {
    return (history ?? []).filter((r) => r.threadId === threadId);
}

/**
 * The thread a saved prompt belongs to, so loading it resumes rather than restarts.
 *
 * @returns the thread id, or undefined when that prompt has never been evaluated
 */
export function threadForPrompt(
    history: readonly EvaluationRun[] | undefined,
    promptId: string,
): string | undefined {
    const mine = (history ?? []).filter((r) => r.promptId === promptId);
    return mine[mine.length - 1]?.threadId;
}

/**
 * Add a run, evicting within the thread and then across threads.
 *
 * Pure — the caller persists the result. That keeps the eviction rules testable
 * without a state manager, and they are the part most likely to be got wrong:
 * two earlier versions of this function were both wrong, first capping globally
 * and then evicting purely by recency.
 *
 * @param history - existing runs, oldest first
 * @param run - the run just completed
 * There is deliberately NO preference for threads anchored to a saved prompt.
 * One was built and removed on 2026-08-25: it required reading both prompt
 * stores, threading the result through this function, and reaching across a
 * feature boundary to do it — and it could only change WHICH thread fell off
 * past twenty-five, which nobody would ever see. Real machinery, invisible
 * result. If it comes back it needs a producer who noticed its absence.
 *
 * @returns the new list, oldest first, bounded on both axes
 */
export function appendRun(
    history: readonly EvaluationRun[] | undefined,
    run: EvaluationRun,
): EvaluationRun[] {
    const all = [...(history ?? []), run];

    // 1. Cap this THREAD's runs — keep the newest, and keep the cheapest even
    //    when it is old. Other threads are untouched: a trend is per thread, so
    //    eviction must be too.
    const mine = all.filter((r) => r.threadId === run.threadId);
    let kept = all;
    if (mine.length > RUNS_PER_THREAD) {
        const cheapest = mine.reduce((a, b) => (b.costUSD < a.costUSD ? b : a), mine[0]);
        const newest = mine.slice(-RUNS_PER_THREAD);
        const keep = new Set(newest);
        // Make room for the cheapest run only when it is not already in the
        // newest — otherwise the cap silently keeps one fewer than it says.
        if (!keep.has(cheapest)) {
            keep.delete(newest[0]);
            keep.add(cheapest);
        }
        const doomed = new Set(mine.filter((r) => !keep.has(r)));
        kept = all.filter((r) => !doomed.has(r));
    }

    // 2. Cap the number of THREADS, dropping the least recently run one whole.
    const lastSeen = new Map<string, number>();
    kept.forEach((r, i) => lastSeen.set(r.threadId, i));
    if (lastSeen.size > THREADS_PER_PROJECT) {
        const oldestFirst = [...lastSeen.entries()].sort((a, b) => a[1] - b[1]);
        const drop = new Set(
            oldestFirst.slice(0, lastSeen.size - THREADS_PER_PROJECT).map(([t]) => t),
        );
        kept = kept.filter((r) => !drop.has(r.threadId));
    }
    return kept;
}

/**
 * Reduce a finished evaluation to the row that is stored.
 *
 * The narrow signature is the point: it takes only what is kept, so a trace
 * cannot be persisted by someone passing the whole result through.
 *
 * @param at - ISO timestamp; injected so the caller owns the clock
 */
export function toStoredRun(
    fields: {
        threadId: string;
        promptId?: string;
        prompt: string;
        costUSD: number;
        steps: number;
        wastedSteps: number;
        durationMs: number;
    },
    at: string,
): EvaluationRun {
    return { ...fields, at };
}

/**
 * Attach a thread to a saved prompt, retroactively.
 *
 * Saving happens AFTER the runs — a producer refines a prompt, decides it is
 * good, and only then saves it. So anchoring only future runs would leave the
 * exact journey this exists for broken: the thread would be unfindable from the
 * library until it was run again. Every run in the thread is stamped.
 *
 * @returns a new list; the input is untouched
 */
export function anchorThread(
    history: readonly EvaluationRun[] | undefined,
    threadId: string,
    promptId: string,
): EvaluationRun[] {
    return (history ?? []).map((r) => (r.threadId === threadId ? { ...r, promptId } : r));
}

/**
 * Migrate history written before threads existed.
 *
 * Each distinct prompt TEXT becomes a thread of its own — lossless, needs no
 * decision, and preserves exactly the comparisons the old shape could make. Runs
 * that already carry a thread are left alone, so this is safe to call on every
 * load.
 */
export function migrateHistory(
    history: readonly (EvaluationRun & { threadId?: string })[] | undefined,
): EvaluationRun[] {
    const byText = new Map<string, string>();
    return (history ?? []).map((r) => {
        if (r.threadId) return r as EvaluationRun;
        let id = byText.get(r.prompt);
        if (!id) {
            id = `migrated-${byText.size + 1}`;
            byText.set(r.prompt, id);
        }
        return { ...r, threadId: id };
    });
}
