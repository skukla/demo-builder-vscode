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
 * Runs kept per project, oldest dropped first.
 *
 * Chosen from what the view can show: a headline delta needs two, and a trend
 * worth reading needs a handful. Twenty is generous for both and small enough
 * that the manifest stays a manifest.
 */
export const HISTORY_LIMIT = 20;

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
 * Add a run, dropping the oldest when the cap is reached.
 *
 * Pure — the caller persists the result. That keeps the rotation rule testable
 * without a state manager, and it is the rule most likely to be got wrong.
 *
 * @param history - existing runs, oldest first
 * @param run - the run just completed
 * @returns the new list, oldest first, never longer than {@link HISTORY_LIMIT}
 */
export function appendRun(
    history: readonly EvaluationRun[] | undefined,
    run: EvaluationRun,
): EvaluationRun[] {
    const next = [...(history ?? []), run];
    return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
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
