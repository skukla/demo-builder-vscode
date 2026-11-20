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

/** What a run says before anything names its first step: the word installers use, never "Starting". */
export const PREPARING = 'Preparing';

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

/** The job of the first step still to come, or "Starting" when there is none to name. */
function firstJob(steps: readonly OperationRow[], job: StepJob | undefined): string {
    const next = steps.find((s) => s.status === 'pending');
    return (next && job?.(next)) ?? PREPARING;
}

/**
 * The run's lines now: the job of the step under way, and in it the data type under way or the
 * step's own line; "Starting" before any step is.
 *
 * @param job - line 1 for a step; the step's label when it names none
 */
export function runStage(steps: readonly OperationRow[], job?: StepJob): RunStageLines {
    const working = steps.find((s) => s.status === 'checking');
    // Before any step is under way, the job of the first one to come: "Installing in Commerce" from the
    // first frame, not "Starting" (owner walk, 2026-11-16).
    if (!working) return { label: withStep(steps, steps.find((s) => s.status === 'pending'), firstJob(steps, job)) };
    const job1 = job?.(working) ?? working.label;
    const type = working.types?.find((t) => t.status === 'checking');
    const detail = type ? typeLine(type) : stepLine(working, job1);
    const label = withStep(steps, working, job1);
    return detail ? { label, detail } : { label };
}

/**
 * Line 1 with where the run has got to, as Prerequisites and the Updates run say it: "Step 1/2:
 * Installing in Commerce" (owner, 2026-11-20). A run of one step names no count.
 */
function withStep(steps: readonly OperationRow[], step: OperationRow | undefined, label: string): string {
    const at = step ? steps.indexOf(step) : -1;
    if (steps.length < 2 || at < 0 || label === PREPARING) return label;
    return `Step ${at + 1}/${steps.length}: ${label}`;
}

/** A step's verb as its job: "Export from Commerce" is done as "Exporting from Commerce". */
const GERUNDS: Readonly<Record<string, string>> = {
    Export: 'Exporting',
    Save: 'Saving',
    Install: 'Installing',
    Uninstall: 'Uninstalling',
    Update: 'Updating',
    Verify: 'Verifying',
    Restore: 'Restoring',
    Clear: 'Clearing',
    Remove: 'Removing',
    Delete: 'Deleting',
};

const DOING = new Set(Object.values(GERUNDS));

/** A line that starts with a job's verb ("Saving to My Datapacks"). */
const saysAJob = (line: string | undefined): boolean => line !== undefined && DOING.has(line.split(' ')[0]);

/** A step's label as its job, when it starts with a verb the table knows; else none. */
export function gerundJob(label: string): string | undefined {
    const [verb, ...rest] = label.split(' ');
    const doing = GERUNDS[verb];
    if (!doing) return undefined;
    return [doing, ...rest].join(' ');
}

/**
 * A run's lines from the rows it sends, for the shared progress window (owner, 2026-11-16): line 1
 * the step's job, line 2 the part under way. A step whose line already says its job ("Saving to My
 * Datapacks" on "Save Release Save Test") puts that line first and the thing it acts on under it;
 * a step with no verb the table knows takes the run's stage.
 *
 * @param stage - the run's stage, for a step that names no job, and for no step under way
 */
export function rowsLines(rows: readonly OperationRow[], stage: string | undefined): RunStageLines {
    const working = rows.find((row) => row.status === 'checking');
    if (!working) return { label: stage ?? PREPARING };
    const typeWorking = working.types?.some((t) => t.status === 'checking');
    // A step's own line that already names a job leads, whichever verb its label has: an Update's
    // save step ("Update Release Save Test 2") says "Saving to My Datapacks" (walk F196), where line 1
    // read the window's own title.
    if (gerundJob(working.label) && !typeWorking && saysAJob(working.line)) {
        const acted = working.label.slice(working.label.indexOf(' ') + 1);
        return { label: withStep(rows, working, working.line as string), detail: acted };
    }
    return runStage(rows, (row) => gerundJob(row.label) ?? stage);
}
