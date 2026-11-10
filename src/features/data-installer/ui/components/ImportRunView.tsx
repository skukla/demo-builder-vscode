/**
 * The import window while an import runs, and once it ends with a problem, on the same steps (owner,
 * 2026-11-09, `.rptc/research/replace-flow-steps/`): one row per step, named for what it does, in
 * the order it runs (`importSteps`), each a house `WorkRow` with a bold title over a small muted
 * line, and the data types under Install, small, with small icons (`WorkRowColumns` dense; walk
 * F132). The working data type says what it is doing on a second line, "Installing 1,200 of 2,046"
 * (F133). Two columns for more than six data types, one for six or fewer (`runColumns`, F135).
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
import { WorkRow } from '@/core/ui/components/feedback/WorkRow';
import { WorkRowColumns } from '@/core/ui/components/feedback/WorkRowColumns';
import { LeadText } from '@/core/ui/components/ui/LeadText';
import { useRunClock } from '@/core/ui/hooks/useRunClock';

/** What goes under the steps once the import has ended. */
export interface RunEnd {
    /** "This demo now uses My Luma from Nov 9, 1:56 PM." and how long search takes; absent when it stopped. */
    lead?: string;
    /** What changed in the store and what is left to do (`JobStanding.scLines`). */
    lines: string[];
    took?: string;
}

export interface ImportRunViewProps {
    steps: ImportStep[];
    /** The data types' columns under Install (`runColumns`). */
    columns: 1 | 2;
    /** While it runs: when it started. */
    running?: { startedAt: number };
    end?: RunEnd;
}

/** The clock, under the steps while it runs; its line is there from the first frame (F116). */
function RunningFoot({ startedAt }: { startedAt: number }): React.ReactElement {
    const clock = useRunClock(startedAt);
    return (
        <div className="import-run-foot">
            <p className="dialog-note">{clock || ' '}</p>
        </div>
    );
}

function EndFoot({ end }: { end: RunEnd }): React.ReactElement {
    return (
        <div className="import-run-foot dialog-stack">
            {end.lead ? <LeadText>{end.lead}</LeadText> : null}
            {end.lines.map((line) => (
                <p key={line} className="dialog-line">
                    {line}
                </p>
            ))}
            {end.took ? <p className="dialog-note">Took {end.took}</p> : null}
        </div>
    );
}

/** One step: its row, its problem under it, and Install's data types. */
function Step({ step, columns }: { step: ImportStep; columns: 1 | 2 }): React.ReactElement {
    return (
        <WorkRow
            status={step.status}
            label={step.label}
            {...(step.line ? { detail: step.line } : {})}
            state={step.status === 'success' ? 'done' : step.status}
        >
            {step.problem ? (
                <p className={step.problem.failed ? 'dialog-problem text-negative' : 'dialog-problem text-notice'}>{step.problem.text}</p>
            ) : null}
            {step.types && step.types.length > 0 ? (
                <div className="import-step-types">
                    <WorkRowColumns rows={step.types} columns={columns} dense />
                </div>
            ) : null}
        </WorkRow>
    );
}

export function ImportRunView({ steps, columns, running, end }: ImportRunViewProps): React.ReactElement {
    return (
        <div data-testid="import-run" className="import-steps">
            {steps.map((step) => (
                <Step key={step.kind} step={step} columns={columns} />
            ))}
            {running ? <RunningFoot startedAt={running.startedAt} /> : null}
            {end ? <EndFoot end={end} /> : null}
        </div>
    );
}
