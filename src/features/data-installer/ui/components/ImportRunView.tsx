/**
 * The import window while an import runs, and once it ends with a problem, on the same steps (owner,
 * 2026-11-09, `.rptc/research/replace-flow-steps/`): one row per step, named for what it does, in
 * the order it runs (`importSteps`), each a house `WorkRow` with a bold title over a small muted
 * line, and the data types under Install, small, with small icons (`StepRows`, which draws them
 * with `WorkRowColumns` dense; walk F132). The working data type says what it is doing on a second
 * line, "Installing 1,200 of 2,046" (F133). Two columns for more than six data types, one for six
 * or fewer (`runColumns`, F135).
 * While it runs the clock goes under the steps; an ending with a problem keeps each step's final
 * state, the problem on its step, and the one sentence and "Took …" under them. A clean finish
 * hands off to the small result instead (owner, 2026-11-10, F134; `dialog-design.md`).
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

/** What goes under the steps once the import has ended. */
export interface RunEnd {
    /** "This demo now uses My Luma from Nov 9, 1:56 PM." and how long search takes; absent when it stopped. */
    lead?: string;
    /** What changed in the store and what is left to do (`JobStanding.scLines`). */
    lines: string[];
    /** How long it took, as the job reported it; `RunFoot` says it only for a long run. */
    tookMs?: number;
}

export interface ImportRunViewProps {
    steps: ImportStep[];
    /** The data types' columns under Install (`runColumns`). */
    columns: 1 | 2;
    /** While it runs: when it started. */
    running?: { startedAt: number };
    end?: RunEnd;
}

export function ImportRunView({ steps, columns, running, end }: ImportRunViewProps): React.ReactElement {
    return (
        <div data-testid="import-run" className="import-steps">
            <StepRows steps={steps} columns={columns} />
            {/* The clock's line is there from the first frame (F116). */}
            {running ? <RunFoot running={running} className="import-run-foot" /> : null}
            {end ? <RunFoot lead={end.lead} lines={end.lines} tookMs={end.tookMs} className="import-run-foot" /> : null}
        </div>
    );
}
