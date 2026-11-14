/**
 * The Datapacks screen's body for "Save Your Changes First?" (step 03, S6; the prototype's
 * `SaveFirstBody`), drawn inside the shared frame, `SaveFirstWindow` in
 * `core/ui/components/feedback` (step-05, "One save window, two bodies"). One datapack's changes
 * counted by type, no names (decisions Phase 3, J2-1, J2-3). No box: saving without asking is the
 * setting only.
 *
 * The field here says where a save goes, on every datapack (P5-Q7, step-07 D4): the SC's own starts
 * with its own name and saves into it, another name makes a new one; someone else's makes a new one.
 * A refused name shows the house problem line, and the caller holds the save (`saveDisabled`). Room
 * for that line is always kept, so the window never grows (rule 14).
 *
 * @module features/data-installer/ui/components/job/SaveChangesBody
 */

import { TextField } from '@adobe/react-spectrum';
import React from 'react';
import type { SaveAsField } from '../../hooks/useSwitchChanges';
import { TypeTable } from '../typeSummary/TypeTable';
import type { TypeRow } from './installRows';

export interface SaveChangesBodyProps {
    /** The changes, counted by type. */
    rows: readonly TypeRow[];
    /** The changes could not be read: nothing is known of them. */
    readFailed: boolean;
    /** Where a save goes: the name field. */
    saveAs: SaveAsField;
}

/** The name a new datapack takes, its problem under it. */
function SaveAsName({ field }: { field: SaveAsField }): React.ReactElement {
    return (
        <div>
            <TextField
                label="Save As"
                value={field.name}
                onChange={field.onName}
                width="100%"
                validationState={field.problem ? 'invalid' : undefined}
            />
            {/* Room kept for the problem line, so the window never grows (rule 14). */}
            <p className="dialog-problem text-negative">{field.problem ?? ' '}</p>
        </div>
    );
}

export function SaveChangesBody({
    rows,
    readFailed,
    saveAs,
}: SaveChangesBodyProps): React.ReactElement {
    return (
        <>
            {readFailed ? (
                <p className="dialog-problem text-notice">{"Your changes couldn't be checked."}</p>
            ) : (
                <TypeTable rows={rows} label="Your changes by type of data" />
            )}
            <SaveAsName field={saveAs} />
        </>
    );
}
