/**
 * A run's steps, numbered "(n of N)" from a list known before the run starts.
 *
 * WHY here (progress vocabulary slice 3, owner 2026-10-16): a project delete numbered
 * its steps this way first, and Republish needs the same rule; one copy means the two
 * cannot drift. vscode-free.
 *
 * @module core/utils/numberedSteps
 */

import type { OperationPosition } from '@/types/webviewPayloads';

/** Where a step shows: its name, the line under it, and its position. */
export type PositionedReport = (stage: string, step?: string, position?: OperationPosition) => void;

/**
 * A reporter that adds each step's position from `steps`.
 *
 * One step alone is not numbered: "1 of 1" says nothing a step alone does not. A step
 * that is skipped leaves its number unused and the count moves on. A position the
 * caller passes is ignored: the position is where the step sits in the run, never a
 * count of its items, which belongs on the line under it.
 *
 * @param steps - every step the run will report, in order
 * @param report - the progress surface's reporter
 * @returns a reporter that numbers each step
 */
export function numberedSteps(
    steps: readonly string[],
    report: PositionedReport,
): (stage: string, step?: string) => void {
    return (stage, step) => {
        const index = steps.indexOf(stage) + 1;
        const numbered = index > 0 && steps.length > 1;
        report(stage, step, numbered ? { index, total: steps.length } : undefined);
    };
}
