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

import { Checkbox } from '@adobe/react-spectrum';
import React from 'react';
import type { TypeRow } from '../job/installRows';

/**
 * A tick on each row's type (step-07 U1, J9-2: Update applies only the types ticked; a datapack is
 * built out additively, so applying some of it is allowed). The house Spectrum checkbox in the type's
 * own cell, so the table keeps its one layout (rule 8).
 */
export interface TypePicks {
    /** The ticked types, by code. */
    ticked: ReadonlySet<string>;
    onToggle: (type: string) => void;
}

export interface TypeTableProps {
    rows: readonly TypeRow[];
    label?: string;
    picks?: TypePicks;
}

export function TypeTable({
    rows,
    label = 'What happens to each type of data',
    picks,
}: TypeTableProps): React.ReactElement {
    return (
        <div className={picks ? 'type-table type-table--picks' : 'type-table'} role="table" aria-label={label}>
            {rows.map((row) => (
                <div className="type-row" role="row" key={row.type}>
                    <div className="type-name" role="rowheader">
                        {picks ? (
                            <Checkbox isSelected={picks.ticked.has(row.type)} onChange={() => picks.onToggle(row.type)}>
                                {row.label}
                            </Checkbox>
                        ) : (
                            row.label
                        )}
                    </div>
                    <div className="type-cell" role="cell">
                        {row.happens}
                    </div>
                </div>
            ))}
        </div>
    );
}
