/**
 * What a single-project datapack run is doing now, as the centred lines say it (owner, 2026-11-16:
 * one project is the wizard's centred view, the large spinner with what it is doing and how far,
 * moving from step to step; several projects are the rows). Drawn from the same steps the rows
 * were, so the words are the steps' own: the step under way, and in Install the data type under way.
 *
 * Pure: no React.
 *
 * @module features/data-installer/runStage
 */

import type { ImportStep } from './importSteps';

/** The centred lines: what it is doing, and how far when it knows. */
export interface RunStageLines {
    label: string;
    detail?: string;
}

/** The words a data type's working line starts with that name only the verb: they take the type's name. */
const BARE_VERBS: ReadonlySet<string> = new Set(['Installing', 'Updating']);

/** A line and the count at its end: "Uninstalling Products, 40 of 2,046" is the phrase and "40 of 2,046". */
function split(line: string): RunStageLines {
    const counted = line.match(/^(.*?),?\s*([\d,]+ of [\d,]+)$/u);
    if (counted?.[1]) return { label: counted[1], detail: counted[2] };
    return { label: line };
}

/**
 * The run's stage now: the step under way, and in a step with data types the type under way
 * ("Installing Products", "1,200 of 2,046"); "Starting" before any is.
 */
export function runStage(steps: readonly ImportStep[]): RunStageLines {
    const working = steps.find((s) => s.status === 'checking');
    if (!working) return { label: 'Starting' };
    const type = working.types?.find((t) => t.status === 'checking');
    if (type?.line) {
        const { label: words, detail } = split(type.line);
        const label = BARE_VERBS.has(words) ? `${words} ${type.label}` : words;
        return detail ? { label, detail } : { label };
    }
    return working.line ? split(working.line) : { label: working.label };
}
