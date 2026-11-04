/**
 * BatchResetQuestions — Reset Selected's questions (owner, 2026-11-04): one Remove Datapack for
 * every project, shown only when one of them has a datapack, then a line per project. While Remove
 * Datapack is ticked, a pack with changes that are not the SC's own asks for a name to save them as,
 * empty to start, or Remove Without Saving; one whose changes go into the SC's own pack says so.
 *
 * No sentence: labels, fields and values only (owner).
 *
 * @module features/projects-dashboard/ui/components/BatchResetQuestions
 */

import { Checkbox, TextField } from '@adobe/react-spectrum';
import React from 'react';
import { anyDatapack, fieldOf } from '../batchChoices';
import type { BatchChoices } from '../hooks/useBatchChoices';
import { CheckboxRow } from '@/core/ui/components/selection/CheckboxRow';
import { LeadText } from '@/core/ui/components/ui/LeadText';
import type { BatchResetRow } from '@/types/projectsBatch';

interface Props {
    rows: BatchResetRow[];
    choices: BatchChoices;
}

/** What a pack's changes need, under its project, while Remove Datapack is ticked. */
function ChangesField({ row, choices }: { row: BatchResetRow; choices: BatchChoices }) {
    const field = fieldOf(choices.fields, row.path);
    if (row.datapack?.changes === 'saves') {
        return <span className="checkbox-row-detail">Saving to your library</span>;
    }
    if (row.datapack?.changes !== 'asks') return null;
    return (
        <div className="batch-reset-changes">
            <TextField
                label="Save Changes As"
                isRequired
                isDisabled={field.drop}
                value={field.saveAs}
                onChange={(name) => choices.setSaveAs(row.path, name)}
                width="size-3600"
            />
            <Checkbox isSelected={field.drop} onChange={(drop) => choices.setDrop(row.path, drop)}>
                Remove Without Saving
            </Checkbox>
        </div>
    );
}

function ResetRow({ row, choices }: { row: BatchResetRow; choices: BatchChoices }) {
    const removing = choices.removeDatapack && row.datapack !== undefined;
    return (
        <div className="batch-reset-row">
            {/* The name and what it is under it, as the run draws each row (owner, 2026-11-04). */}
            <div className="work-row-text">
                <span className="checkbox-row-label">{row.name}</span>
                {(row.repository ?? row.summary) && <div className="work-row-detail">{row.repository ?? row.summary}</div>}
                {row.datapack && <div className="work-row-detail">Datapack: {row.datapack.name}</div>}
            </div>
            {removing && <ChangesField row={row} choices={choices} />}
        </div>
    );
}

/** Remove Datapack, then each project. */
export function BatchResetQuestions({ rows, choices }: Props): React.ReactElement {
    return (
        <div className="batch-reset">
            {/* What a reset does, as the single reset says it (owner, 2026-11-04: it said nothing). */}
            <LeadText>Each project goes back to how it was first set up, and any changes to its code are lost.</LeadText>
            {anyDatapack(rows) && (
                <div className="select-all-row">
                    <CheckboxRow
                        label="Remove Datapack"
                        isSelected={choices.removeDatapack}
                        onChange={() => choices.setRemoveDatapack(!choices.removeDatapack)}
                    />
                </div>
            )}
            {rows.map((row) => (
                <ResetRow key={row.path} row={row} choices={choices} />
            ))}
        </div>
    );
}
