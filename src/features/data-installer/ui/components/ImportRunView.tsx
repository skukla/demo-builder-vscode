/**
 * The import window while an import runs and once it ends, on the same rows (owner, 2026-11-07):
 * a row per data type in the order the engine installs, drawn as the Updates and batch windows
 * draw theirs (`WorkRow`), down each column in turn, between a Preparing Import row and a Finishing
 * Import row. While it runs, the clock goes under the list; once it ends, the rows keep their final
 * state, a problem sits on its row, and the one sentence and "Took …" go under the list ("A run
 * ends where it ran", `docs/development/sop/dialog-design.md`). It was a medium spinner and one
 * line in the form's large box, silent for minutes, then a paragraph in a second view.
 *
 * @module features/data-installer/ui/components/ImportRunView
 */

import React from 'react';
import type { RunRow } from './importRunRows';
import { WorkRow } from '@/core/ui/components/feedback/WorkRow';
import { LeadText } from '@/core/ui/components/ui/LeadText';
import { useRunClock } from '@/core/ui/hooks/useRunClock';

/** What goes under the list once the import has ended. */
export interface RunEnd {
    /** "Luma is in Justrite Test Store." and how long search takes; absent when it stopped. */
    lead?: string;
    /** What changed in the store and what is left to do (`JobStanding.scLines`). */
    lines: string[];
    took?: string;
}

export interface ImportRunViewProps {
    rows: RunRow[];
    /** How many columns the rows take: the form's, for the box the form had. */
    columns: number;
    /** While it runs: when it started. */
    running?: { startedAt: number };
    end?: RunEnd;
}

/** The rows split into columns, each read top to bottom, the run going down one and then the next. */
function inColumns(rows: RunRow[], columns: number): RunRow[][] {
    if (rows.length === 0) return [];
    const perColumn = Math.ceil(rows.length / Math.max(1, columns));
    return Array.from({ length: Math.ceil(rows.length / perColumn) }, (_, i) =>
        rows.slice(i * perColumn, (i + 1) * perColumn),
    );
}

function Row({ row }: { row: RunRow }): React.ReactElement {
    return (
        <WorkRow
            status={row.status}
            label={row.label}
            detail={row.line}
            state={row.status === 'success' ? 'done' : row.status}
        >
            {row.problem ? <p className={row.problem.failed ? 'dialog-problem text-negative' : 'dialog-problem text-notice'}>{row.problem.text}</p> : null}
        </WorkRow>
    );
}

/** The clock, under the list while it runs. */
function RunningFoot({ startedAt }: { startedAt: number }): React.ReactElement {
    const clock = useRunClock(startedAt);
    return <div className="import-run-foot">{clock ? <p className="dialog-note">{clock}</p> : null}</div>;
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

export function ImportRunView({
    rows,
    columns,
    running,
    end,
}: ImportRunViewProps): React.ReactElement {
    return (
        <div data-testid="import-run">
            <div className="import-run-columns">
                {inColumns(rows, columns).map((column) => (
                    <div key={column[0]?.kind}>
                        {column.map((row) => (
                            <Row key={row.kind} row={row} />
                        ))}
                    </div>
                ))}
            </div>
            {running ? <RunningFoot startedAt={running.startedAt} /> : null}
            {end ? <EndFoot end={end} /> : null}
        </div>
    );
}
