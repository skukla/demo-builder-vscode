/**
 * What a run on one project is doing now, as the centred lines say it (owner, 2026-11-16: one
 * project is the wizard's centred view; several projects are the rows). Line 1 is the job of the
 * step under way ("Uninstalling from Commerce"), line 2 the part of it under way and how far
 * ("Products, 12 of 25"), and line 3 the time (owner, same day: "one main message, and each data
 * type a second line").
 *
 * Pure: no React. Shared: the datapack run window and the progress window, for every run on one
 * project that sends its parts as rows (a datapack save, Clear Demo Data, a project's reset).
 *
 * @module core/utils/runStage
 */

import type { OperationRow } from '@/types/webviewPayloads';

/** The centred lines: the job, and the part under way when there is one. */
export interface RunStageLines {
    label: string;
    detail?: string;
}

/** Line 1 for a step: the host's words for its job ("Installing in Commerce"); none, the step's label. */
export type StepJob = (step: OperationRow) => string | undefined;

/**
 * The words a data type's working line can start with that name only the verb: on line 2 the type's
 * name stands for them ("Installing 1,200 of 2,046" on Products is "Products, 1,200 of 2,046").
 */
const BARE_VERBS: ReadonlySet<string> = new Set(['Installing', 'Updating', 'Exporting']);

/** A line and the count it ends with: "Uninstalling Products, 40 of 2,046" is those words and "40 of 2,046". */
function counted(line: string): { words: string; count?: string } {
    const match = line.match(/^(.*?),?\s*([\d,]+ of [\d,]+)$/u);
    return match ? { words: match[1], count: match[2] } : { words: line };
}

/** Words, then the count after a comma when there is one. */
function withCount(words: string, count: string | undefined): string {
    if (!count) return words;
    return words ? `${words}, ${count}` : count;
}

/** A data type's line 2: its name and count ("Products, 1,200 of 2,046"); a phrase of its own after the name. */
function typeLine(type: OperationRow): string {
    const { words, count } = counted(type.line ?? '');
    if (!words || BARE_VERBS.has(words)) return withCount(type.label, count);
    return withCount(`${type.label}: ${words.charAt(0).toLowerCase()}${words.slice(1)}`, count);
}

/**
 * A step's line 2: its line, less the verb line 1 already says ("Uninstalling Products, 12 of 25"
 * under "Uninstalling from Commerce" is "Products, 12 of 25"); none when that leaves nothing.
 */
function stepLine(step: OperationRow, label: string): string | undefined {
    if (!step.line) return undefined;
    const verb = label.split(' ')[0];
    const after = step.line.startsWith(`${verb} `) ? step.line.slice(verb.length + 1) : '';
    // Only before a name ("Uninstalling Products, …"): "Saving to the library" keeps its verb.
    const rest = /^\p{Lu}/u.test(after) ? after : step.line;
    const { words, count } = counted(rest);
    const said = withCount(words, count);
    return said && said !== label ? said : undefined;
}

/**
 * The run's lines now: the job of the step under way, and in it the data type under way or the
 * step's own line; "Starting" before any step is.
 *
 * @param job - line 1 for a step; the step's label when it names none
 */
export function runStage(steps: readonly OperationRow[], job?: StepJob): RunStageLines {
    const working = steps.find((s) => s.status === 'checking');
    if (!working) return { label: 'Starting' };
    const label = job?.(working) ?? working.label;
    const type = working.types?.find((t) => t.status === 'checking');
    const detail = type ? typeLine(type) : stepLine(working, label);
    return detail ? { label, detail } : { label };
}
