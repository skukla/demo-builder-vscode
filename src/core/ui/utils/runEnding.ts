/**
 * The one rule for whether a run ends on the small result: the outcome as the title and only what
 * is left to know, with the run's rows gone (owner, 2026-11-10, walk F134; plan step-03 S1).
 *
 * Four windows decided this on their own until 2026-11-12 (the import, the Updates run, the projects
 * batch run and the progress window) and disagreed: the progress window looked only at the run's
 * warning, so a save with a problem on one row and no warning ended small and hid the problem; the
 * Updates run looked only at its rows, so a warning with every row clean ended small.
 * Each window now hands this its rows. `tests/core/ui/utils/runEnding.test.tsx` drives all
 * four with the same cases.
 *
 * @module core/ui/utils/runEnding
 */

/** One part of a run, as far as its ending is concerned. */
export interface EndingRow {
    /** What went wrong on it: a failure, a skip, a part that did not finish. Present and not false. */
    problem?: boolean | { text: string };
    /** Something left to read under it. */
    note?: string;
}

/** A run as it ended. */
export interface RunEnding {
    succeeded: boolean;
    /** What the run as a whole could not do, or any sign of it (a check that differs). */
    warning?: string | boolean;
    rows: readonly EndingRow[];
}

/**
 * Whether the run ends small: it succeeded, has no warning, and no row has a problem or a note.
 *
 * @param run - how the run ended, with its rows
 * @returns true when the window should leave the rows for the small result
 */
export function endsSmall(run: RunEnding): boolean {
    return run.succeeded && !run.warning && run.rows.every((row) => !row.problem && !row.note);
}
