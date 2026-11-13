/**
 * BatchResetQuestions — Reset Selected's first step, Reset Projects (owner, 2026-11-04): what a reset
 * does, then Delete Selected's table with one column. A row per project, its repository under it
 * (a reset rewrites it), and a Uninstall Datapack box naming the pack only where it can go; the column
 * header is its Select All, the name column's is Project (owner, 2026-11-05). A pack
 * whose changes could not be read has no box and says it is kept, on its own row: a batch never
 * discards changes nobody could see (option B). The packs' changes are asked after the red button,
 * in "Save Your Changes First?" (`BatchSaveTable`), shared with Delete Selected (step-05 S1).
 *
 * The table is Delete Selected's (`batch-delete-table`), so the two windows draw a project and its
 * boxes one way, and it stacks the same in a narrow window.
 *
 * @module features/projects-dashboard/ui/components/BatchResetQuestions
 */

import { Checkbox } from '@adobe/react-spectrum';
import React from 'react';
import { removable, removeColumnState } from '../batchChoices';
import type { BatchChoices } from '../hooks/useBatchChoices';
import { CheckboxRow } from '@/core/ui/components/selection/CheckboxRow';
import { LeadText } from '@/core/ui/components/ui/LeadText';
import { UNINSTALL_DATAPACK } from '@/features/data-installer/datapackWords';
import type { BatchResetRow } from '@/types/projectsBatch';


/** A pack whose changes could not be read: the status the house writes, not a sentence. */
/** A pack whose changes could not be read: the batch keeps its data (owner, 2026-11-04). */
export const UNCHECKED_NOTE = "Couldn't check for changes. Datapack kept.";

interface Props {
    rows: BatchResetRow[];
    choices: BatchChoices;
}

function ProjectCell({ row }: { row: BatchResetRow }) {
    return (
        <th scope="row">
            <span className="checkbox-row-label">{row.name}</span>
            {(row.repository ?? row.summary) && <div className="work-row-detail">{row.repository ?? row.summary}</div>}
            {row.datapack?.changes === 'unchecked' && <p className="dialog-problem text-notice">{UNCHECKED_NOTE}</p>}
        </th>
    );
}

/** What a reset does, then the projects and whose pack goes. */
export function BatchResetQuestions({ rows, choices }: Props): React.ReactElement {
    const column = removeColumnState(rows, choices.removeTicks);
    return (
        <div className="batch-confirm">
            <LeadText>Each project returns to how it was set up. Code changes are lost.</LeadText>
            <div className="batch-delete scroll-fade scroll-fade--capped">
                <table className="batch-delete-table">
                    {column.offered && (
                        <thead>
                            <tr>
                                <td className="batch-changes-head batch-project-head">Project</td>
                                <th scope="col">
                                    <CheckboxRow
                                        label={UNINSTALL_DATAPACK}
                                        isSelected={column.all}
                                        isIndeterminate={column.some && !column.all}
                                        onChange={() => choices.toggleRemoveColumn(rows)}
                                    />
                                </th>
                            </tr>
                        </thead>
                    )}
                    <tbody>
                        {rows.map((row) => (
                            <tr key={row.path}>
                                <ProjectCell row={row} />
                                {column.offered && (
                                    <td>
                                        {removable(row) && (
                                            <Checkbox
                                                aria-label={`${UNINSTALL_DATAPACK}, ${row.name}`}
                                                isSelected={choices.removeTicks[row.path] === true}
                                                onChange={() => choices.toggleRemove(row.path)}
                                            >
                                                <span className="batch-delete-option-label">{UNINSTALL_DATAPACK}</span>
                                                <span className="batch-option-what">{row.datapack?.name}</span>
                                            </Checkbox>
                                        )}
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
