/**
 * The one rule for whether a run ended clean: nothing to read under its outcome but its sentence, so
 * the rows of a run of one thing are left out (owner, 2026-11-10, walk F134; plan step-03 S1). A
 * clean end is also a small window of its own (owner, 2026-11-20, over walk F222's "a result keeps
 * the run's window").
 *
 * Four windows decided this on their own until 2026-11-12 (the import, the Updates run, the projects
 * batch run and the progress window) and disagreed: the progress window looked only at the run's
 * warning, so a save with a problem on one row and no warning ended small and hid the problem; the
 * Updates run looked only at its rows, so a warning with every row clean ended small.
 * Each window now hands this its rows. `tests/core/ui/utils/runEnding.test.tsx` drives all
 * four with the same cases.
 *
 * The same rows decide the colour of the end (`endStatus`; owner walk Q9 and Q6, 2026-11-13): amber
 * on a warning or a row's problem, green with notes alone. `tests/core/ui/utils/runEnding-status.test.ts`
 * drives the four windows that colour an end with the same five cases.
 *
 * @module core/ui/utils/runEnding
 */

/** One part of a run, as far as its ending is concerned. */
export interface EndingRow {
    /**
     * What went wrong on it: a failure, a skip, a part that did not finish, rows Commerce refused, or
     * something a reset should have done and did not. Present and not false. Turns the end amber.
     */
    problem?: boolean | { text: string };
    /**
     * Something left to read under it that is not wrong (edits kept, rows already there, content kept
     * on purpose, "Saved to My Luma."): it keeps the window open, and the end stays green.
     */
    note?: string;
    /** Rows nested under it, small (a step's data types): they count as its own. */
    types?: readonly EndingRow[];
}

/** A run as it ended. */
export interface RunEnding {
    succeeded: boolean;
    /** What the run as a whole could not do, or any sign of it (a check that differs). */
    warning?: string | boolean;
    rows: readonly EndingRow[];
}

/**
 * Whether the run ended clean: it succeeded, has no warning, and no row has a problem or a note.
 *
 * @param run - how the run ended, with its rows
 * @returns true when its rows have nothing to say under the outcome
 */
export function endsClean(run: RunEnding): boolean {
    return run.succeeded && !run.warning && everyRow(run.rows).every((row) => !row.problem && !row.note);
}

/** How a run's end is coloured: the title's status icon. */
export type EndStatus = 'success' | 'warning' | 'error';

/**
 * The one amber rule: red when the run failed; amber when it has a warning or any row, a nested one
 * included, has a problem; green otherwise, notes and all.
 *
 * @param run - how the run ended, with its rows
 * @returns the status the window's title shows
 */
export function endStatus(run: RunEnding): EndStatus {
    if (!run.succeeded) return 'error';
    const problem = everyRow(run.rows).some((row) => Boolean(row.problem));
    return run.warning || problem ? 'warning' : 'success';
}

/** The rows and every row nested under them. */
function everyRow(rows: readonly EndingRow[]): EndingRow[] {
    return rows.flatMap((row) => [row, ...everyRow(row.types ?? [])]);
}
