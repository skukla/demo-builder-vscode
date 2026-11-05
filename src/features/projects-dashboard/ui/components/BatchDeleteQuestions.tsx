/**
 * BatchDeleteQuestions — Delete Selected's one question (owner, 2026-11-04): what to take with
 * each project, as a table. A row per project, a column per online resource (its repository, its
 * DA.live site, its datapack); a cell has a box only where that project has the resource, and a
 * column no project has is not drawn. Each column's header is its Select All, over the rows that
 * have it: ticked, the dash when some are, empty.
 *
 * One sentence, for what goes whatever is ticked: the files on this machine, which no box shows
 * (owner, 2026-11-05). Each box names what it deletes (`skukla/bodea`, the pack's name), as the
 * single delete's boxes do, so the project's name stands alone under a Project header. The labels
 * never wrap; a window too narrow for the columns stacks each project's boxes under its name
 * instead (`projects-batch.css`), each box then carrying its own label.
 *
 * @module features/projects-dashboard/ui/components/BatchDeleteQuestions
 */

import { Checkbox } from '@adobe/react-spectrum';
import React from 'react';
import { columnState, DELETE_OPTION_KEYS, type DeleteOptionKey } from '../batchChoices';
import type { BatchChoices } from '../hooks/useBatchChoices';
import { CheckboxRow } from '@/core/ui/components/selection/CheckboxRow';
import { LeadText } from '@/core/ui/components/ui/LeadText';
import type { BatchDeleteRow } from '@/types/projectsBatch';

/** A column's name, in its header and, stacked, beside each box. */
export function optionLabel(key: DeleteOptionKey): string {
    if (key === 'repo') return 'Delete Repository';
    if (key === 'site') return 'Delete DA.live Site';
    return 'Delete Datapack';
}

interface Props {
    rows: BatchDeleteRow[];
    choices: BatchChoices;
}

function OptionCell({ row, optionKey, choices }: { row: BatchDeleteRow; optionKey: DeleteOptionKey; choices: BatchChoices }) {
    const option = row[optionKey];
    if (!option) return <td />;
    return (
        <td>
            <Checkbox
                aria-label={`${optionLabel(optionKey)}, ${row.name}`}
                isSelected={choices.ticks[row.path]?.[optionKey] === true}
                onChange={() => choices.toggleTick(row.path, optionKey)}
            >
                <span className="batch-delete-option-label">{optionLabel(optionKey)}</span>
                <span className="batch-option-what">{option.name}</span>
            </Checkbox>
        </td>
    );
}

/** The table; the columns no project has are left out. */
export function BatchDeleteQuestions({ rows, choices }: Props): React.ReactElement {
    const columns = DELETE_OPTION_KEYS.map((key) => ({ key, state: columnState(rows, choices.ticks, key) })).filter(
        (column) => column.state.offered,
    );
    return (
        <div className="batch-confirm">
            <LeadText>Project files are removed from this machine.</LeadText>
            <div className="batch-delete scroll-fade scroll-fade--capped">
                <table className="batch-delete-table batch-delete-spread">
                    <thead>
                        <tr>
                            <td className="batch-changes-head batch-project-head">Project</td>
                            {columns.map(({ key, state }) => (
                                <th key={key} scope="col">
                                    <CheckboxRow
                                        label={optionLabel(key)}
                                        isSelected={state.all}
                                        isIndeterminate={state.some && !state.all}
                                        onChange={() => choices.toggleColumn(rows, key)}
                                    />
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => (
                            <tr key={row.path}>
                                <th scope="row">
                                    <span className="checkbox-row-label">{row.name}</span>
                                </th>
                                {columns.map(({ key }) => (
                                    <OptionCell key={key} row={row} optionKey={key} choices={choices} />
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
