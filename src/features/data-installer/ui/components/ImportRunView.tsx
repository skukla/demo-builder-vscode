/**
 * The import window while an import runs, and once it ends with a problem, on the same steps (owner,
 * 2026-11-09, `.rptc/research/replace-flow-steps/`): one row per step, named for what it does, in
 * the order it runs (`importSteps`), each a house `WorkRow` with a bold title over a small muted
 * line, and the data types under Install, small, with small icons (`StepRows`, which draws them
 * with `WorkRowColumns` dense; walk F132). The working data type says what it is doing on a second
 * line, "Installing 1,200 of 2,046" (F133). Two columns for more than six data types, one for six
 * or fewer (`runColumns`, F135).
 * While it runs the clock goes under the steps; an ending with a problem keeps each step's final
 * state, the problem on its step, under the outcome and its lines (`ResultBody`, walk F222). A clean
 * finish leaves the steps out (owner, 2026-11-10, F134; `dialog-design.md`).
 *
 * The window keeps one height from the first frame to the end (walk F116, F133): the clock's line
 * is there before the clock has anything to say, each line stays on one line, and room for the
 * working data type's second line is held the whole time.
 *
 * @module features/data-installer/ui/components/ImportRunView
 */

import React from 'react';
import type { ImportStep } from '../../importSteps';
import { RunFoot } from '@/core/ui/components/feedback/RunFoot';
import { StepRows } from '@/core/ui/components/feedback/StepRows';

export interface ImportRunViewProps {
    steps: ImportStep[];
    /** The data types' columns under Install (`runColumns`). */
    columns: 1 | 2;
    /** While it runs: when it started. */
    running?: { startedAt: number };
}

export function ImportRunView({ steps, columns, running }: ImportRunViewProps): React.ReactElement {
    return (
        <div data-testid="import-run">
            <StepRows steps={steps} columns={columns} />
            {/* The clock's line is there from the first frame (F116). */}
            {running ? <RunFoot running={running} className="import-run-foot" /> : null}
        </div>
    );
}
