/**
 * WorkRow — one item in a list of work: its status icon, its name, a quieter detail beside
 * it, and anything to read under it (a note, or why it failed).
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
    /** Beside the name, quieter: what it is, or what it is doing now. */
    detail?: string;
    /** Under the name: a line to read. Red only when `why` says it failed. */
    note?: string;
    why?: boolean;
    /** The item's own state, for a test or a style to tell rows apart. */
    state?: string;
    /** More under the name: a list of changes, a question. */
    children?: React.ReactNode;
}

/** One row: icon, name and detail, then what to read under them. */
export function WorkRow({ status, label, detail, note, why, state, children }: WorkRowProps): React.ReactElement {
    return (
        <div className="work-row" data-state={state}>
            <span className="work-row-icon">
                <StepStatusIcon status={status} />
            </span>
            <div className="work-row-text">
                <span className="checkbox-row-label">{label}</span>
                {detail && <span className="checkbox-row-detail">{detail}</span>}
                {note && <div className={why ? 'work-row-why' : 'work-row-note'}>{note}</div>}
                {children}
            </div>
        </div>
    );
}
