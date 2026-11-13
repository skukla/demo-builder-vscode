/**
 * WorkRow — one item in a list of work: its status icon, its name, then where it stands on the
 * line under it (a quieter detail, or a note, or why it failed).
 *
 * Two lines, not a detail beside the name (owner, 2026-11-04): a running row's step beside its
 * name made it the one row of a different shape, and a host that adds the line only while running
 * shifts every row under it. A host gives every row its second line, so a list keeps one height.
 *
 * Moved out of the Updates modal's run view (2026-10-26) when the demo setup's Apply needed
 * the same list: its steps were drawn as bare text, "Done" run into the note after it
 * (owner, release test row 4.19). Styled in `core/ui/styles/work-row.css`, which each
 * host bundle imports.
 *
 * @module core/ui/components/feedback/WorkRow
 */

import React from 'react';
import { StepStatusIcon, type StepStatus } from './StepStatusIcon';
import { cn } from '@/core/ui/utils/classNames';

export interface WorkRowProps {
    status: StepStatus;
    label: string;
    /** Under the name, quieter: what it is, where it stands, or what it is doing now. */
    detail?: string;
    /**
     * Under the name: a line to read. Red when `why` says it failed; orange on a warning row, as the
     * dialog rules ask (decisions Phase 1b, J1-3d); otherwise the quiet grey.
     */
    note?: string;
    why?: boolean;
    /** The item's own state, for a test or a style to tell rows apart. */
    state?: string;
    /** More under the name: a list of changes, a question. */
    children?: React.ReactNode;
    /** How long it has taken, right after the name: nothing follows it there, so its ticking moves nothing. */
    time?: string;
    /**
     * Small and tight, for a list nested under a step, where the icon already says where each stands
     * (the import's data types under Install, owner 2026-11-09). The detail is the working row's
     * second line, small and quiet, "Installing 1,200 of 2,046" (owner, 2026-11-10, walk F133); a
     * row without one is the name alone. Neither line wraps (F135).
     */
    dense?: boolean;
    /**
     * What is wrong with it, a run's row as it ended (`OperationRow.problem`): red when it failed,
     * orange when it went in with a problem. It takes the second line in place of `detail`, so a row
     * that ends with a problem keeps the height its progress line gave it, and on a full-size row it
     * fits one line, its whole text on hover (decisions Phase 1b, J1-3d growth, owner 2026-11-11).
     */
    problem?: { text: string; failed: boolean };
}

/** A row's note: red when it failed, the house's orange warning line on a warning row, else grey. */
function Note({ note, status, why }: { note: string; status: StepStatus; why?: boolean }): React.ReactElement {
    const warned = !why && status === 'warning';
    const plain = !why && !warned;
    return (
        <div className={cn(why && 'work-row-why', warned && 'dialog-problem text-notice', plain && 'work-row-note')}>
            {note}
        </div>
    );
}

/** The second line: the problem when there is one, in the slot the detail held; else the detail. */
function SecondLine({ detail, dense, problem }: Pick<WorkRowProps, 'detail' | 'dense' | 'problem'>): React.ReactElement | null {
    if (problem) {
        return (
            <p
                className={problem.failed ? 'dialog-problem text-negative work-row-problem' : 'dialog-problem text-notice work-row-problem'}
                title={problem.text}
            >
                {problem.text}
            </p>
        );
    }
    if (!detail) return null;
    return <div className={dense ? 'work-row-doing' : 'work-row-detail'}>{detail}</div>;
}

/** One row: icon and name, then the detail and what to read under it. */
export function WorkRow({ status, label, detail, note, why, state, children, time, dense = false, problem }: WorkRowProps): React.ReactElement {
    return (
        <div className={dense ? 'work-row work-row--dense' : 'work-row'} data-state={state}>
            <span className="work-row-icon">
                <StepStatusIcon status={status} />
            </span>
            <div className="work-row-text">
                <span className="checkbox-row-label">{label}</span>
                {time && <span className="work-row-time">{time}</span>}
                <SecondLine detail={detail} dense={dense} problem={problem} />
                {note && <Note note={note} status={status} why={why} />}
                {children}
            </div>
        </div>
    );
}
