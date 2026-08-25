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
 * ## Why the prompt is the key, verbatim
 *
 * The comparison is a prompt against its OWN past. Normalising or truncating the
 * key would silently merge two prompts that differ in exactly the way the
 * producer was testing. This is also the failure `battery/` exists to prevent:
 * six prompts were once lost, and every number measured against them became
 * uncomparable.
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
 * Runs kept per PROMPT, oldest dropped first.
 *
 * Per prompt, not per project — and the first version got this wrong. A single
 * global cap of 20 evicts by recency across ALL prompts, so a producer
 * alternating between five prompts keeps only four runs of each, and a trend
 * they were building disappears because of runs that had nothing to do with it.
 * Worse, it disappears SILENTLY: an evicted history is indistinguishable from a
 * prompt that was never run.
 *
 * Ten is what a trend needs. The unit of meaning is the prompt, so that is what
 * the cap counts.
 */
export const RUNS_PER_PROMPT = 10;

/**
 * How many distinct prompts keep any history at all.
 *
 * The second half of the bound: without it, a producer who never repeats a
 * prompt would accumulate one row each, forever. When the cap is reached the
 * LEAST RECENTLY RUN prompt is dropped whole — recency is the honest proxy for
 * "still working on this", and dropping a whole prompt is cleaner than leaving
 * a stump nobody can compare against.
 */
export const TRACKED_PROMPTS = 25;

/**
 * Worst case on disk: 25 prompts × 10 runs × (~5 numbers + the prompt text).
 * A 200-byte prompt puts that near 50KB — small for a manifest that already
 * carries component state, and the reason the cap can be generous.
 */

/** What a new run should be compared against, if anything. */
export interface Delta {
    /** The most recent PREVIOUS run of the same prompt. */
    previous: EvaluationRun;
    /** How many earlier runs exist, including that one. */
    priorRuns: number;
}

/**
 * The most recent previous run of this exact prompt.
 *
 * @param history - the project's stored runs, oldest first
 * @param prompt - the prompt about to be run, verbatim
 * @returns the comparison, or undefined when this prompt has no past
 */
export function findDelta(
    history: readonly EvaluationRun[] | undefined,
    prompt: string,
): Delta | undefined {
    const matches = (history ?? []).filter((r) => r.prompt === prompt);
    const previous = matches[matches.length - 1];
    // Undefined rather than a zero delta: "no change" and "never run before" are
    // different facts, and a zero would read as the first.
    return previous ? { previous, priorRuns: matches.length } : undefined;
}

/**
 * Add a run, evicting per prompt and then per prompt-count.
 *
 * Pure — the caller persists the result. That keeps the eviction rule testable
 * without a state manager, and it is the rule most likely to be got wrong: the
 * first version capped globally, which let unrelated prompts evict a trend.
 *
 * @param history - existing runs, oldest first
 * @param run - the run just completed
 * @returns the new list, oldest first, bounded on both axes
 */
export function appendRun(
    history: readonly EvaluationRun[] | undefined,
    run: EvaluationRun,
): EvaluationRun[] {
    const all = [...(history ?? []), run];

    // 1. Cap the runs of THIS prompt. Other prompts are untouched, which is the
    //    whole correction — a trend is per prompt, so eviction must be too.
    const mine = all.filter((r) => r.prompt === run.prompt);
    const dropFromMine = Math.max(0, mine.length - RUNS_PER_PROMPT);
    const doomed = new Set(mine.slice(0, dropFromMine));
    let kept = all.filter((r) => !doomed.has(r));

    // 2. Cap how many distinct prompts are tracked, dropping the LEAST RECENTLY
    //    RUN one whole. A stump of one run is not comparable against anything,
    //    so half-dropping a prompt would keep bytes and lose the meaning.
    const lastSeen = new Map<string, number>();
    kept.forEach((r, i) => lastSeen.set(r.prompt, i));
    if (lastSeen.size > TRACKED_PROMPTS) {
        const stale = [...lastSeen.entries()]
            .sort((a, b) => a[1] - b[1])
            .slice(0, lastSeen.size - TRACKED_PROMPTS)
            .map(([prompt]) => prompt);
        const drop = new Set(stale);
        kept = kept.filter((r) => !drop.has(r.prompt));
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
