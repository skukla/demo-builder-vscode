/**
 * BatchSaveTable — the body for "Save Your Changes First?" when several datapacks go at once, drawn
 * inside the shared frame, `SaveFirstWindow` (step-05, "One save window, two bodies"; decisions
 * J7-2). The projects screens' Reset and Delete ask it, and Clear Commerce Instance on the Datapacks
 * screen (step 06 C4, P6-Q4): in core because two features draw it. The rows, names and refusals come
 * from `saveAsName.ts`'s rules; this draws them. A row per datapack whose data goes with changes, its project under it:
 * Datapack, then Save As, a filled-in name field on every row. The SC's own pack starts with its own
 * name and saves into it; another name, or someone else's pack, saves a new datapack. A refused name
 * shows the house problem line under its field, and the caller holds the save.
 *
 * Considered: the Datapacks screen's body, `SaveChangesBody`, which counts one datapack's changes by
 * type and names only someone else's; many datapacks can only be listed by name. The table is
 * Delete Selected's (`batch-delete-table batch-changes-table`), its headings the batch table's
 * (`batch-changes-head`), so every batch table draws a column one way. Each row keeps its problem
 * line from the start, one line high (the table's cells do not wrap), so the window never grows
 * (rule 14). The field's label is for screen readers only: in a table the column's header says it.
 *
 * Styled by `projects-batch.css` (projects-dashboard's sheet): a host bundle imports it in its entry,
 * as the dashboard's and the Data Installer's do (ADR-017 §6).
 *
 * @module core/ui/components/feedback/BatchSaveTable
 */

import { TextField } from '@adobe/react-spectrum';
import React from 'react';

/** One datapack's row: the project, and its pack's name. */
export interface SaveTableRow {
    path: string;
    name: string;
    datapack?: { name: string };
}

/** The question as drawn: its rows, each row's name, and why a name is refused, by project path. */
export interface SaveTableQuestion {
    rows: readonly SaveTableRow[];
    names: Readonly<Record<string, string>>;
    problems: Readonly<Record<string, string>>;
}

/** Kept in an empty problem line, so it holds its height. */
const NO_PROBLEM = ' ';

interface Props {
    question: SaveTableQuestion;
    onName: (path: string, name: string) => void;
}

function SaveAsCell({
    row,
    question,
    onName,
}: {
    row: SaveTableRow;
    question: SaveTableQuestion;
    onName: Props['onName'];
}) {
    const problem = question.problems[row.path];
    return (
        <td>
            <TextField
                aria-label={`Save As, ${row.name}`}
                value={question.names[row.path] ?? ''}
                onChange={(name) => onName(row.path, name)}
                validationState={problem ? 'invalid' : undefined}
                width="100%"
            />
            <p className="dialog-problem text-negative">{problem ?? NO_PROBLEM}</p>
        </td>
    );
}

/** Where each datapack's changes go: its own pack, or a new one under the name given. */
export function BatchSaveTable({ question, onName }: Props): React.ReactElement {
    return (
        <div className="batch-delete scroll-fade scroll-fade--capped">
            <table className="batch-delete-table batch-changes-table">
                <thead>
                    <tr>
                        <td className="batch-changes-head">Datapack</td>
                        <td className="batch-changes-head">Save As</td>
                    </tr>
                </thead>
                <tbody>
                    {question.rows.map((row) => (
                        <tr key={row.path}>
                            <th scope="row">
                                <span className="checkbox-row-label">{row.datapack?.name}</span>
                                <div className="work-row-detail">{row.name}</div>
                            </th>
                            <SaveAsCell row={row} question={question} onName={onName} />
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
