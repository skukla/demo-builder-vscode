/**
 * The summary a datapack job decides on (prototype-conventions rule 8: "the summary is a type
 * table, the same one everywhere"): one row per data type, its plain name and what happens to it,
 * counted ("56", "53 added, 3 updated"). No grey detail and no names (rules 1, 3); the names are
 * plain text, so Review Records is the one way into the records (rule 9). Ported from the walked
 * prototype (`mockups/flow/TypeSummary.tsx`, step 03, S4); install is its first user, Clear and
 * Switch follow.
 *
 * @module features/data-installer/ui/components/typeSummary/TypeTable
 */

import React from 'react';
import type { TypeRow } from '../job/installRows';

export interface TypeTableProps {
    rows: readonly TypeRow[];
    label?: string;
}

export function TypeTable({
    rows,
    label = 'What happens to each type of data',
}: TypeTableProps): React.ReactElement {
    return (
        <div className="type-table" role="table" aria-label={label}>
            {rows.map((row) => (
                <div className="type-row" role="row" key={row.type}>
                    <div className="type-name" role="rowheader">
                        {row.label}
                    </div>
                    <div className="type-cell" role="cell">
                        {row.happens}
                    </div>
                </div>
            ))}
        </div>
    );
}
