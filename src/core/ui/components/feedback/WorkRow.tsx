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

export interface WorkRowProps {
    status: StepStatus;
    label: string;
    /** Under the name, quieter: what it is, where it stands, or what it is doing now. */
    detail?: string;
    /** Under the name: a line to read. Red only when `why` says it failed. */
    note?: string;
    why?: boolean;
    /** The item's own state, for a test or a style to tell rows apart. */
    state?: string;
    /** More under the name: a list of changes, a question. */
    children?: React.ReactNode;
    /** How long it has taken, right after the name: nothing follows it there, so its ticking moves nothing. */
    time?: string;
}

/** One row: icon and name, then the detail and what to read under it. */
export function WorkRow({ status, label, detail, note, why, state, children, time }: WorkRowProps): React.ReactElement {
    return (
        <div className="work-row" data-state={state}>
            <span className="work-row-icon">
                <StepStatusIcon status={status} />
            </span>
            <div className="work-row-text">
                <span className="checkbox-row-label">{label}</span>
                {time && <span className="work-row-time">{time}</span>}
                {detail && <div className="work-row-detail">{detail}</div>}
                {note && <div className={why ? 'work-row-why' : 'work-row-note'}>{note}</div>}
                {children}
            </div>
        </div>
    );
}
