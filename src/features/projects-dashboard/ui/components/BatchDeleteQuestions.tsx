/**
 * BatchDeleteQuestions — Delete Selected's question (owner, 2026-11-04): what to take with each
 * project, as a table. A row per project, a column per thing it may take (its repository, its
 * DA.live site, its datapack's data in Commerce, walk F96); a cell has a box only where that project
 * has the thing, and a column no project has is not drawn. A pack whose changes could not be read
 * has a note instead of a box, as Reset Selected's has. Each column's header is its Select All, over the rows that
 * have it: ticked, the dash when some are, empty.
 *
 * One sentence, for what goes whatever is ticked: the files on this machine, which no box shows
 * (owner, 2026-11-05), and, when a project has datapack data, that it stays unless removed. Each box names what it deletes (`skukla/bodea`, the pack's name), so the
 * project's name stands alone under a Project header. One project draws no table: the title names
 * it, the sentence names what it has online once, and its boxes say where (walk F213). The labels
 * never wrap; a window too narrow for the columns stacks each project's boxes under its name
 * instead (`projects-batch.css`), each box then carrying its own label.
 *
 * @module features/projects-dashboard/ui/components/BatchDeleteQuestions
 */

import { Checkbox } from '@adobe/react-spectrum';
import React from 'react';
import { columnState, DELETE_OPTION_KEYS, offers, type DeleteOptionKey } from '../batchChoices';
import type { BatchChoices } from '../hooks/useBatchChoices';
import { UNCHECKED_NOTE } from './BatchResetQuestions';
import { CheckboxRow } from '@/core/ui/components/selection/CheckboxRow';
import { LeadText } from '@/core/ui/components/ui/LeadText';
import { UNINSTALL_DATAPACK } from '@/features/data-installer/datapackWords';
import { deleteSentence } from '@/features/projects-dashboard/deleteWords';
import type { BatchDeleteRow } from '@/types/projectsBatch';

/** A column's name, in its header and, stacked, beside each box. */
export function optionLabel(key: DeleteOptionKey): string {
    if (key === 'repo') return 'Delete GitHub Repository';
    if (key === 'site') return 'Delete DA.live Site';
    return UNINSTALL_DATAPACK;
}

interface Props {
    rows: BatchDeleteRow[];
    choices: BatchChoices;
}

function OptionCell({ row, optionKey, choices }: { row: BatchDeleteRow; optionKey: DeleteOptionKey; choices: BatchChoices }) {
    const option = row[optionKey];
    if (!option) return <td />;
    if (!offers(row, optionKey)) return <td><span className="dialog-problem text-notice">{UNCHECKED_NOTE}</span></td>;
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

/**
 * One option for one project: a box saying where the thing lives, its name beside it only where that
 * differs from the name the sentence gives (a datapack; a site named apart from its repository), or
 * the kept note in place of a box.
 */
function OneOption({ row, optionKey, onlineName, choices }: { row: BatchDeleteRow; optionKey: DeleteOptionKey; onlineName?: string; choices: BatchChoices }) {
    const option = row[optionKey];
    if (!option) return null;
    if (!offers(row, optionKey)) return <p className="dialog-problem text-notice">{UNCHECKED_NOTE}</p>;
    return (
        <CheckboxRow
            label={optionLabel(optionKey)}
            {...(option.name !== onlineName ? { detail: option.name } : {})}
            isSelected={choices.ticks[row.path]?.[optionKey] === true}
            onChange={() => choices.toggleTick(row.path, optionKey)}
        />
    );
}

/**
 * One project (walk F213): the title names it, so no table of one row repeats it. The name its
 * repository and site go by online is said once, in the sentence, and the boxes say where.
 */
function OneDeleteQuestion({ row, choices }: { row: BatchDeleteRow; choices: BatchChoices }): React.ReactElement {
    const onlineName = row.repo?.name ?? row.site?.name;
    return (
        <div className="batch-confirm">
            <LeadText>{deleteSentence(row.datapack !== undefined, onlineName)}</LeadText>
            <div>
                {DELETE_OPTION_KEYS.map((key) => (
                    <OneOption key={key} row={row} optionKey={key} onlineName={onlineName} choices={choices} />
                ))}
            </div>
        </div>
    );
}

/** The table; the columns no project has are left out. A column whose every box is a note stays, its header box off. */
export function BatchDeleteQuestions({ rows, choices }: Props): React.ReactElement {
    if (rows.length === 1) return <OneDeleteQuestion row={rows[0]} choices={choices} />;
    const columns = DELETE_OPTION_KEYS.filter((key) => rows.some((row) => row[key] !== undefined)).map((key) => ({
        key,
        state: columnState(rows, choices.ticks, key),
    }));
    return (
        <div className="batch-confirm">
            <LeadText>{deleteSentence(rows.some((row) => row.datapack !== undefined))}</LeadText>
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
                                        isDisabled={!state.offered}
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
