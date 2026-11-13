/**
 * The spot check behind Review Records (prototype-conventions rules 8 and 19): the data types down
 * the left, the chosen type's records on the right, read-only and searchable, in a pane of one
 * height that scrolls when long. The Save From Store layout (`.datapack-picks`, as
 * `StorePicksStage` draws it), with nothing to tick. What happens to a type is the summary's to
 * say, so it is not repeated here (rule 3). Ported from the walked prototype
 * (`mockups/flow/TypeSummary.tsx`, step 03, S4).
 *
 * An install removes and keeps nothing, so its types have no tabs (rule 10). Clear (step 06, C2b;
 * decisions Phase 6, J1-3b) hands in `kept`, and every type then has Removed and Kept tabs: Kept
 * greyed out when nothing stays, the house notice dot after the count of a type with kept records,
 * in a slot every row has so the counts and the dots line up (rule 11), and the same dot on its Kept
 * tab (rule 18). Both tabs have the one column header, and a type that nests (categories) is a
 * `TreeList`. A type that could not be read says so on its row and in its pane.
 *
 * @module features/data-installer/ui/components/typeSummary/TypeRail
 */

import React, { useState } from 'react';
import type { TypeRow } from '../job/installRows';
import { ViewSwitcher } from '../ViewSwitcher';
import { SearchHeader } from '@/core/ui/components/navigation/SearchHeader';
import { StatusDot } from '@/core/ui/components/ui/StatusDot';
import { TreeList, type TreeListNode, treeRows } from '@/core/ui/components/ui/TreeList';

const digits = (n: number): string => n.toLocaleString('en-US');

const NONE: string[] = [];

const UNREAD = "Couldn't be read";

const matches = (name: string, query: string): boolean =>
    name.toLowerCase().includes(query.trim().toLowerCase());

/** Which of a type's records the pane lists: the ones removed, or the ones that stay. */
type RecordView = 'removed' | 'kept';

/** What Clear hands in beside the removed names: the kept ones, the trees, the types not read. */
export interface ClearRecordsShown {
    /** Each type's kept records. Given, every type has Removed and Kept tabs. */
    kept?: Record<string, string[]>;
    /** The removed records of a type that nests, as a tree. */
    trees?: Record<string, TreeListNode[]>;
    /** The types that could not be read. */
    unread?: ReadonlySet<string>;
}

/** The first tab's name: orders and returns are closed, never deleted (decisions Phase 6, J1-5). */
const doneTab = (type: string): string => (type === 'orders' || type === 'returns' ? 'Closed' : 'Removed');

/** The Removed and Kept tabs; the Kept one greyed out when nothing stays, else wearing the row's dot. */
function RecordTabs({ type, kept, view, onSelect }: { type: string; kept: number; view: RecordView; onSelect: (view: RecordView) => void }) {
    const views = [
        { id: 'removed', label: doneTab(type) },
        { id: 'kept', label: 'Kept', isDisabled: kept === 0, marker: kept > 0 ? <StatusDot variant="warning" /> : undefined },
    ];
    return <ViewSwitcher views={views} activeId={view} onSelect={(id) => onSelect(id === 'kept' ? 'kept' : 'removed')} />;
}

/** One type's records, filtered by name: a tree for a type that nests, else names. */
function RecordPane({ row, names, kept, tree }: { row: TypeRow; names: readonly string[]; kept?: readonly string[]; tree?: readonly TreeListNode[] }) {
    const [query, setQuery] = useState('');
    const [view, setView] = useState<RecordView>('removed');
    const noun = row.label.toLowerCase();
    const listed = view === 'kept' ? (kept ?? NONE) : names;
    const asTree = view === 'removed' && tree !== undefined;
    const shown = listed.filter((name) => matches(name, query));
    return (
        <div className="datapack-pick-list">
            {kept ? <RecordTabs type={row.type} kept={kept.length} view={view} onSelect={setView} /> : null}
            <SearchHeader
                searchQuery={query}
                onSearchQueryChange={setQuery}
                searchPlaceholder={`Filter ${noun}`}
                totalCount={listed.length}
                filteredCount={asTree ? treeRows(tree, query).filter((r) => r.matched).length : shown.length}
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
                {asTree ? (
                    <TreeList nodes={tree} query={query} />
                ) : (
                    shown.map((name) => (
                        <div className="type-record" key={name}>
                            {name}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

/** A row's note: its count, or that it could not be read; with Clear's kept slot after the count. */
function RowNote({ row, kept, unread }: { row: TypeRow; kept?: readonly string[]; unread: boolean }) {
    if (unread) return <>{UNREAD}</>;
    const many = kept?.length ?? 0;
    const label = many > 0 ? { 'aria-label': `${digits(many)} kept`, title: `${digits(many)} kept` } : {};
    return (
        <>
            {digits(row.count)}
            {kept ? (
                <span className="type-rail-kept" {...label}>
                    {many > 0 ? <StatusDot variant="warning" /> : null}
                </span>
            ) : null}
        </>
    );
}

/** A type's kept records when Clear handed them in; none listed is an empty list, not absent. */
function keptOf(kept: ClearRecordsShown['kept'], type: string): readonly string[] | undefined {
    if (!kept) return undefined;
    return kept[type] ?? NONE;
}

export interface TypeRailProps extends ClearRecordsShown {
    rows: readonly TypeRow[];
    /** Each type's record names; null when they could not be read. */
    records: Record<string, string[]> | null;
}

export function TypeRail({ rows, records, kept, trees, unread }: TypeRailProps): React.ReactElement {
    const [shown, setShown] = useState(rows[0]?.type);
    const row = rows.find((r) => r.type === shown) ?? rows[0];
    const unreadRow = row !== undefined && unread?.has(row.type) === true;
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
                            <span className="datapack-picks-note">
                                <RowNote row={r} kept={keptOf(kept, r.type)} unread={unread?.has(r.type) === true} />
                            </span>
                        </button>
                    </li>
                ))}
            </ul>
            <div className="datapack-picks-pane">
                {records === null || unreadRow ? (
                    <p className="dialog-problem text-notice">
                        {"The records couldn't be read."}
                    </p>
                ) : null}
                {row && records !== null && !unreadRow ? (
                    <RecordPane
                        key={row.type}
                        row={row}
                        names={records[row.type] ?? NONE}
                        kept={keptOf(kept, row.type)}
                        {...(trees?.[row.type] ? { tree: trees[row.type] } : {})}
                    />
                ) : null}
            </div>
        </div>
    );
}
