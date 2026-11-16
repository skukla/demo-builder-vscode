/**
 * What a single-project datapack run is doing now, as the centred lines say it (owner, 2026-11-16:
 * one project is the wizard's centred view, the large spinner with what it is doing and how far,
 * moving from step to step; several projects are the rows). Drawn from the same steps the rows
 * were, so the words are the steps' own: the step under way, and in Install the data type under way.
 *
 * Pure: no React.
 *
 * Shared: the datapack run window and the progress window, for every run on one project that sends
 * its parts as rows (a datapack save, Clear Demo Data, a project's reset, the Updates run).
 *
 * @module core/utils/runStage
 */

import type { OperationRow } from '@/types/webviewPayloads';

/** The centred lines: what it is doing, and how far when it knows. */
export interface RunStageLines {
    label: string;
    detail?: string;
}

/**
 * The words a working line can start with that name only the verb: they take the row's name
 * ("Installing" on Products is "Installing Products"; a save's types say "Exporting").
 */
const BARE_VERBS: ReadonlySet<string> = new Set(['Installing', 'Updating', 'Exporting']);

/** The words to show: the row's name when there are none, joined to it when they are only a verb. */
function phrase(words: string, name: string): string {
    if (!words) return name;
    if (BARE_VERBS.has(words)) return `${words} ${name}`;
    return words;
}

/**
 * One row's lines: its line split at the count it ends with ("Uninstalling Products, 40 of 2,046"
 * is that phrase and "40 of 2,046"); a line that is only a verb, or only a count, or none at all,
 * takes the row's name.
 */
function rowLines(row: OperationRow): RunStageLines {
    if (!row.line) return { label: row.label };
    const counted = row.line.match(/^(.*?),?\s*([\d,]+ of [\d,]+)$/u);
    const words = counted ? counted[1] : row.line;
    const detail = counted?.[2];
    const label = phrase(words, row.label);
    return detail ? { label, detail } : { label };
}

/**
 * The run's stage now: the row under way, and in a row with rows under it (Install and its data
 * types, a save's export and its) the one under way there ("Installing Products", "1,200 of
 * 2,046"); "Starting" before any is.
 */
export function runStage(steps: readonly OperationRow[]): RunStageLines {
    const working = steps.find((s) => s.status === 'checking');
    if (!working) return { label: 'Starting' };
    const type = working.types?.find((t) => t.status === 'checking');
    return rowLines(type ?? working);
}
