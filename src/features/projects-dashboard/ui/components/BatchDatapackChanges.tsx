/**
 * BatchDatapackChanges — the second step of Reset Selected (owner, 2026-11-04) and of Delete
 * Selected (walk F96), Datapack Changes, shown only when a pack whose data goes is not the SC's and
 * has changes. A row per such pack, its project under
 * it; a new datapack's name, required and empty, or Discard Changes, whose header is its Select All.
 * Two rows may not save under one name. The SC's own packs keep their changes without asking.
 *
 * Delete Selected's table again (`batch-delete-table`). The name field is a Spectrum TextField with
 * its label for screen readers only: in a table its label is the column's header and its hint sits
 * in the empty field, where `forms/FormField` puts both beside the field and has no room per row.
 *
 * @module features/projects-dashboard/ui/components/BatchDatapackChanges
 */

import { Checkbox, TextField } from '@adobe/react-spectrum';
import React from 'react';
import { changeRows, discardColumnState, duplicateNamePaths, fieldOf, type PackRow, type RemoveTicks } from '../batchChoices';
import type { BatchChoices } from '../hooks/useBatchChoices';
import { CheckboxRow } from '@/core/ui/components/selection/CheckboxRow';
import { LeadText } from '@/core/ui/components/ui/LeadText';

const DISCARD = 'Discard Changes';
const DUPLICATE = 'Another datapack in this list has that name';

interface Props {
    rows: readonly PackRow[];
    /** Whose pack's data goes, by project path. */
    removing: RemoveTicks;
    choices: BatchChoices;
}

function NameCell({ row, choices, duplicate }: { row: PackRow; choices: BatchChoices; duplicate: boolean }) {
    const field = fieldOf(choices.fields, row.path);
    if (field.drop) return <td><span className="work-row-detail">Changes discarded</span></td>;
    return (
        <td>
            <TextField
                aria-label={`New datapack name, ${row.name}`}
                isRequired
                value={field.saveAs}
                onChange={(name) => choices.setSaveAs(row.path, name)}
                placeholder="e.g. My Bodea"
                validationState={duplicate ? 'invalid' : undefined}
                errorMessage={duplicate ? DUPLICATE : undefined}
                width="100%"
            />
        </td>
    );
}

/** The packs whose changes need an answer, each saved as a new pack or discarded. */
export function BatchDatapackChanges({ rows, removing, choices }: Props): React.ReactElement {
    const asking = changeRows(rows, removing);
    const duplicates = duplicateNamePaths(rows, removing, choices.fields);
    const column = discardColumnState(asking, choices.fields);
    return (
        <div className="batch-confirm">
            <LeadText>Changed since installed. Save each as a new datapack, or discard its changes.</LeadText>
            <div className="batch-delete scroll-fade scroll-fade--capped">
                <table className="batch-delete-table batch-changes-table">
                    <thead>
                        <tr>
                            <td className="batch-changes-head">Datapack</td>
                            <td className="batch-changes-head">New Datapack Name</td>
                            <th scope="col">
                                <CheckboxRow
                                    label={DISCARD}
                                    isSelected={column.all}
                                    isIndeterminate={column.some && !column.all}
                                    onChange={() => choices.toggleDiscardColumn(asking)}
                                />
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {asking.map((row) => (
                            <tr key={row.path}>
                                <th scope="row">
                                    <span className="checkbox-row-label">{row.datapack?.name}</span>
                                    <div className="work-row-detail">{row.name}</div>
                                </th>
                                <NameCell row={row} choices={choices} duplicate={duplicates.has(row.path)} />
                                <td>
                                    <Checkbox
                                        aria-label={`${DISCARD}, ${row.name}`}
                                        isSelected={fieldOf(choices.fields, row.path).drop}
                                        onChange={(drop) => choices.setDrop(row.path, drop)}
                                    >
                                        <span className="batch-delete-option-label">{DISCARD}</span>
                                    </Checkbox>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
