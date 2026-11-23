/**
 * The question table the projects-list batch windows share (PL-98): Delete Selected, Reset Selected
 * and Updates each ask one thing per project in a table whose first column is the project.
 *
 * This is the shell only: the wrapper, the lead line, the capped scroll box and the table with its
 * "Project" head cell. The columns and the rows are the caller's, because what differs is
 * load-bearing: Delete has several option columns, Reset one that may be absent, and Updates groups
 * its rows.
 *
 * Considered: `core/ui/components/feedback/BatchSaveTable`, which draws the same table classes. It is
 * a different question (a datapack and its Save As name per row, no project column and no lead line)
 * and is shared by two features; these three windows are all this feature's, so the shell stays here.
 *
 * @module features/projects-dashboard/ui/components/BatchQuestionTable
 */

import React from 'react';
import { LeadText } from '@/core/ui/components/ui/LeadText';
import { cn } from '@/core/ui/utils/classNames';

interface BatchQuestionTableProps {
    /** The sentence above the table; absent, none is drawn. */
    lead?: React.ReactNode;
    /** Classes added after `batch-delete-table`, for a window's own column widths. */
    className?: string;
    /** The head cells after "Project", one `<th scope="col">` each; absent, the table has no head. */
    columns?: React.ReactNode;
    /** The body rows. */
    children: React.ReactNode;
}

export function BatchQuestionTable({
    lead,
    className,
    columns,
    children,
}: BatchQuestionTableProps): React.ReactElement {
    return (
        <div className="batch-confirm">
            {lead !== undefined && <LeadText>{lead}</LeadText>}
            <div className="batch-delete scroll-fade scroll-fade--capped">
                <table className={cn('batch-delete-table', className)}>
                    {columns !== undefined && (
                        <thead>
                            <tr>
                                <td className="batch-changes-head batch-project-head">Project</td>
                                {columns}
                            </tr>
                        </thead>
                    )}
                    <tbody>{children}</tbody>
                </table>
            </div>
        </div>
    );
}
