/**
 * The spot check behind Review Records (prototype-conventions rules 8 and 19): the data types down
 * the left, the chosen type's records on the right, read-only and searchable, in a pane of one
 * height that scrolls when long. The Save From Store layout (`.datapack-picks`, as
 * `StorePicksStage` draws it), with nothing to tick. What happens to a type is the summary's to
 * say, so it is not repeated here (rule 3). Ported from the walked prototype
 * (`mockups/flow/TypeSummary.tsx`, step 03, S4) without its Removed and Kept tabs: an install
 * removes and keeps nothing, so none of its types has them (rule 10); Clear brings them in Phase 6.
 *
 * @module features/data-installer/ui/components/typeSummary/TypeRail
 */

import React, { useState } from 'react';
import type { TypeRow } from '../job/installRows';
import { SearchHeader } from '@/core/ui/components/navigation/SearchHeader';

const digits = (n: number): string => n.toLocaleString('en-US');

const NONE: string[] = [];

const matches = (name: string, query: string): boolean =>
    name.toLowerCase().includes(query.trim().toLowerCase());

/** One type's records, filtered by name. */
function RecordPane({
    row,
    names,
}: {
    row: TypeRow;
    names: readonly string[];
}): React.ReactElement {
    const [query, setQuery] = useState('');
    const noun = row.label.toLowerCase();
    const shown = names.filter((name) => matches(name, query));
    return (
        <div className="datapack-pick-list">
            <SearchHeader
                searchQuery={query}
                onSearchQueryChange={setQuery}
                searchPlaceholder={`Filter ${noun}`}
                totalCount={names.length}
                filteredCount={shown.length}
                itemNoun={noun}
                itemNounPlural={noun}
                hasLoadedOnce
                alwaysShowSearch
                hideCount
            />
            <div className="type-record-head" role="row">
                <span role="columnheader">Name</span>
            </div>
            <div className="datapack-pick-rows">
                {shown.map((name) => (
                    <div className="type-record" key={name}>
                        {name}
                    </div>
                ))}
            </div>
        </div>
    );
}

export interface TypeRailProps {
    rows: readonly TypeRow[];
    /** Each type's record names; null when they could not be read. */
    records: Record<string, string[]> | null;
}

export function TypeRail({ rows, records }: TypeRailProps): React.ReactElement {
    const [shown, setShown] = useState(rows[0]?.type);
    const row = rows.find((r) => r.type === shown) ?? rows[0];
    return (
        <div className="datapack-picks type-rail">
            <ul className="datapack-picks-rail">
                {rows.map((r) => (
                    <li key={r.type}>
                        <button
                            type="button"
                            className={r.type === row?.type ? 'datapack-picks-kind datapack-picks-kind--shown' : 'datapack-picks-kind'}
                            aria-current={r.type === row?.type ? 'true' : undefined}
                            onClick={() => setShown(r.type)}
                        >
                            {r.label}
                            <span className="datapack-picks-note">{digits(r.count)}</span>
                        </button>
                    </li>
                ))}
            </ul>
            <div className="datapack-picks-pane">
                {records === null ? (
                    <p className="dialog-problem text-notice">
                        {"The records couldn't be read."}
                    </p>
                ) : null}
                {row && records !== null ? (
                    <RecordPane key={row.type} row={row} names={records[row.type] ?? NONE} />
                ) : null}
            </div>
        </div>
    );
}
