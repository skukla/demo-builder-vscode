/**
 * What a trace says the prompt should have said.
 *
 * Suggestions are DERIVED FROM THE TRACE, deterministically, and each names the
 * evidence that produced it. That is a deliberate first cut, not the end state —
 * see the note at the bottom.
 *
 * ## Grade outcomes, not paths
 *
 * The trace is a DIAGNOSTIC shown to a person, never a pass/fail score. The
 * research this plan follows is explicit that path-grading is "too rigid…
 * overly brittle, as agents regularly find valid approaches that eval designers
 * didn't anticipate." So nothing here fails a prompt. Every suggestion is an
 * observation with its evidence attached, and the person decides.
 *
 * ## Why these are not written by Claude yet
 *
 * The documented mechanism is to hand the trace to Claude and ask what should
 * change, and that is the right end state. It is NOT built here for two honest
 * reasons: it doubles the cost of every evaluation, in a feature whose whole
 * purpose is reducing cost; and there is no held-out set yet, which the same
 * research says is what stops the loop overfitting to the prompts it was tuned
 * on. Build the held-out set first, then this module becomes the fallback for
 * when the model has nothing to add.
 *
 * @module features/ai/evaluation/evaluationSuggestions
 */

import type { TraceEntry } from '../server/toolTraceRecorder';

/** One thing a person could change, and why. */
export interface Suggestion {
    /** What to do, in plain words. */
    text: string;
    /** The trace fact behind it — never a suggestion without its evidence. */
    evidence: string;
    /**
     * Text to append to the prompt, when the fix is that mechanical.
     *
     * Absent when the suggestion needs a human decision. A one-click apply that
     * guesses at the project name would be worse than no button.
     */
    append?: string;
}

/** Tools whose repetition means the agent was working out WHICH project. */
const ORIENTATION_TOOLS = new Set(['get_current_project', 'list_projects', 'get_project']);

/**
 * Read a trace and say what could be better.
 *
 * @param trace - every call the run made, in order
 * @param projectName - the open project, when known; enables a one-click fix
 * @param prompt - the prompt that produced the trace, so advice already TAKEN
 *   is not offered again. Without it the workbench told producers to name the
 *   project in a prompt that already named it — which reads as the tool not
 *   having looked, and it is the reason the argument exists.
 * @returns suggestions, most useful first; empty when the run was clean
 */
export function suggestionsFor(
    trace: TraceEntry[],
    projectName?: string,
    prompt?: string,
): Suggestion[] {
    const out: Suggestion[] = [];

    const repeated = countRepeats(trace);
    const orientation = [...repeated.entries()].filter(([tool]) => ORIENTATION_TOOLS.has(tool));
    const orientationSteps = orientation.reduce((n, [, count]) => n + count, 0);
    const alreadyNamed = namesTheProject(prompt, projectName);

    if (orientationSteps > 0 && !alreadyNamed) {
        out.push({
            text: projectName
                ? `Say which project you mean, so it does not have to work it out.`
                : `Name the project in your prompt, so it does not have to work it out.`,
            evidence:
                orientationSteps === 1
                    ? 'It looked up which project you meant twice.'
                    : `It looked up which project you meant ${orientationSteps + 1} times.`,
            // Only offered when the name is KNOWN. Guessing it would produce a
            // one-click button that quietly rewrites the prompt to the wrong
            // project.
            ...(projectName ? { append: ` for ${projectName}` } : {}),
        });
    }

    for (const [tool, count] of repeated) {
        if (ORIENTATION_TOOLS.has(tool)) continue;
        out.push({
            text: 'Ask for this once, or say what you want done with the answer.',
            evidence: `It asked ${tool} the same question ${count + 1} times.`,
        });
    }

    const errors = trace.filter((e) => e.outcome === 'error');
    if (errors.length > 0) {
        out.push({
            text: 'Something the agent tried did not work. Check the steps marked as failed.',
            evidence: `${errors.length} step${errors.length === 1 ? '' : 's'} failed.`,
        });
    }

    return out;
}

/**
 * Does the prompt already say which project it means?
 *
 * A plain case-insensitive substring test, and deliberately no more: the fix
 * being suggested is literally "put this name in the prompt", so the check for
 * whether it was taken is whether the name is in the prompt. Anything cleverer
 * would be inference, and would suppress real advice when it guessed wrong.
 */
function namesTheProject(prompt?: string, projectName?: string): boolean {
    if (!prompt || !projectName) return false;
    return prompt.toLowerCase().includes(projectName.toLowerCase());
}

/**
 * How many times each tool was asked a question it had already asked.
 *
 * The FIRST ask is not waste, so a tool asked twice counts once. Errors are
 * skipped: retrying after a failure is reasonable and counting it would report
 * recovery as waste.
 */
function countRepeats(trace: TraceEntry[]): Map<string, number> {
    const seen = new Set<string>();
    const repeats = new Map<string, number>();
    for (const e of trace) {
        if (e.outcome === 'error') continue;
        const key = `${e.tool}:${e.argumentFingerprint}`;
        if (seen.has(key)) repeats.set(e.tool, (repeats.get(e.tool) ?? 0) + 1);
        else seen.add(key);
    }
    return repeats;
}
