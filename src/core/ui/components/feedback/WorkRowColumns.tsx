/**
 * A run's parts as rows (`WorkRow`), down each column in turn, the run going down one and then the
 * next: the import's window (`ImportRunView`, owner, 2026-11-07, walk F62) and any run the progress
 * modal shows as rows, a datapack save's first (walk F91). Moved out of `ImportRunView` so both draw
 * one layout; styled by `work-row.css` (`.work-row-columns`).
 *
 * @module core/ui/components/feedback/WorkRowColumns
 */

import React from 'react';
import { WorkRow } from '@/core/ui/components/feedback/WorkRow';
import type { OperationRow } from '@/types/webviewPayloads';

/** The rows split into columns, each read top to bottom. */
function inColumns(rows: readonly OperationRow[], columns: number): OperationRow[][] {
    if (rows.length === 0) return [];
    const perColumn = Math.ceil(rows.length / Math.max(1, columns));
    return Array.from({ length: Math.ceil(rows.length / perColumn) }, (_, i) =>
        rows.slice(i * perColumn, (i + 1) * perColumn),
    );
}

function Row({ row, dense }: { row: OperationRow; dense: boolean }): React.ReactElement {
    // A dense row's only line under its name is the working row's: the icon says the rest.
    const detail = dense && row.status !== 'checking' ? undefined : row.line;
    return (
        <WorkRow
            status={row.status}
            label={row.label}
            {...(detail ? { detail } : {})}
            state={row.status === 'success' ? 'done' : row.status}
            dense={dense}
        >
            {row.problem ? (
                <p
                    className={
                        row.problem.failed
                            ? 'dialog-problem text-negative'
                            : 'dialog-problem text-notice'
                    }
                >
                    {row.problem.text}
                </p>
            ) : null}
        </WorkRow>
    );
}

/**
 * Whether the working row is in this column. A dense column holds room for one second line under
 * its rows, which the working row fills when it is there (owner, 2026-11-10, walk F133): the list
 * keeps one height whichever row is working, and whether any is. Styled for dense columns only.
 */
function hasWorkingRow(column: readonly OperationRow[]): boolean {
    return column.some((row) => row.status === 'checking' && Boolean(row.line));
}

export function WorkRowColumns({
    rows,
    columns,
    dense = false,
}: {
    rows: readonly OperationRow[];
    columns: number;
    /**
     * Small rows nested under a step, as the import's data types (`WorkRow` dense): the working
     * row's second line, and room held for it in every column.
     */
    dense?: boolean;
}): React.ReactElement {
    return (
        <div className={dense ? 'work-row-columns work-row-columns--dense' : 'work-row-columns'}>
            {inColumns(rows, columns).map((column) => (
                <div
                    key={column[0]?.kind}
                    className={hasWorkingRow(column) ? 'work-row-column work-row-column--working' : 'work-row-column'}
                >
                    {column.map((row) => (
                        <Row key={row.kind} row={row} dense={dense} />
                    ))}
                </div>
            ))}
        </div>
    );
}
