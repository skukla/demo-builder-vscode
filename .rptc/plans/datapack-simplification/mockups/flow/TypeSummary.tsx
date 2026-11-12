/**
 * The summary and its spot check, shared by every journey (prototype-conventions.md rule 8: "the
 * summary is a type table, the same one everywhere"). Moved out of j1-windows.tsx when J2's install
 * and replace windows needed the same table and records step, so there is one of each.
 */

import React, { useState } from 'react';
import { countOf, doneTab, recordsOf, spreadTypes, type KeptRecord, type TypeOutcome, type TypeSpread } from './scenarioClear';
import { TreeList, treeRows } from './TreeList';
import { ViewSwitcher } from '@/features/data-installer/ui/components/ViewSwitcher';
import { SearchHeader } from '@/core/ui/components/navigation/SearchHeader';
import { StatusDot } from '@/core/ui/components/ui/StatusDot';
import { StepsWindow } from '@/core/ui/components/ui/StepsDialog';

const digits = (n: number): string => n.toLocaleString('en-US');

/**
 * PROPOSED: the summary the SC decides on. One line per type: the type and what happens to it,
 * counted. No grey detail, names or kept sentence (owner, 2026-11-11, J1-2: "far too noisy";
 * J1-3: kept records are tagged in the spot check instead). The names are plain text: Review Records
 * is the one way into the spot check (owner, 2026-11-11, J1-4: linked names did the same job twice).
 * All of it arrives at once, so the window opens at its final height.
 */
export function TypeTable({ rows, label = 'What happens to each type of data' }: { rows: TypeOutcome[]; label?: string }) {
    return (
        <div className="type-table" role="table" aria-label={label}>
            {rows.map((row) => (
                <div className="type-row" role="row" key={row.type}>
                    <div className="type-name" role="rowheader">
                        {row.type}
                    </div>
                    <div className="type-cell" role="cell">
                        <div className="type-line">
                            <span className="type-happens">{row.happens}</span>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

const matches = (name: string, query: string): boolean => name.toLowerCase().includes(query.trim().toLowerCase());

/** Which of a type's records the pane lists: the ones removed, or the ones that stay. */
type RecordView = 'removed' | 'kept';

/** The kept records by name, the same rows as Removed: there is one reason, and the summary says it. */
function KeptRecords({ kept }: { kept: KeptRecord[] }) {
    return (
        <>
            {[...kept].sort((a, b) => a.name.localeCompare(b.name)).map((k) => (
                <div className="type-record" key={k.name}>{k.name}</div>
            ))}
        </>
    );
}

/** The rows the filter leaves in the view shown. */
function rowsShown(row: TypeOutcome, view: RecordView, query: string): number {
    if (view === 'kept') return (row.keptRecords ?? []).filter((k) => matches(k.name, query)).length;
    if (row.tree) return treeRows(row.tree, query).filter((r) => r.matched).length;
    return recordsOf(row).filter((r) => matches(r, query)).length;
}

/** The list for the view shown: a tree for a type that nests, else names; kept ones by reason. */
function RecordList({ row, view, query }: { row: TypeOutcome; view: RecordView; query: string }) {
    if (view === 'kept') return <KeptRecords kept={(row.keptRecords ?? []).filter((k) => matches(k.name, query))} />;
    if (row.tree) return <TreeList nodes={row.tree} query={query} />;
    return (
        <>
            {recordsOf(row).filter((r) => matches(r, query)).map((r) => (
                <div className="type-record" key={r}>{r}</div>
            ))}
        </>
    );
}

/**
 * A type's records, read-only and searchable, in a pane of one height that scrolls when long. The
 * house `ViewSwitcher` above the list switches between Removed and Kept (owner, 2026-11-11, J1-3b:
 * kept records at the bottom of a long list go unnoticed, and at the top a long kept list buries
 * the rest). Every type shows both, Kept greyed out when nothing stays, so every type has one
 * layout: the switch, the filter, the list. Any type can have kept records (`wipePlan.ts`'s table).
 * What happens to the type is the summary's to say, not repeated here.
 */
function RecordPane({ row, tabs }: { row: TypeOutcome; tabs: boolean }) {
    const [query, setQuery] = useState('');
    const [view, setView] = useState<RecordView>('removed');
    const noun = row.type.toLowerCase();
    const kept = row.keptRecords?.length ?? 0;
    // The Kept tab wears the dot its type wears in the left column, so the two read as one.
    const views = [
        { id: 'removed', label: doneTab(row.type) },
        { id: 'kept', label: 'Kept', isDisabled: kept === 0, marker: kept > 0 ? <StatusDot variant="warning" /> : undefined },
    ];
    const total = view === 'kept' ? kept : countOf(row);
    return (
        <div className="datapack-pick-list">
            {tabs ? <ViewSwitcher views={views} activeId={view} onSelect={(id) => setView(id as RecordView)} /> : null}
            <SearchHeader
                searchQuery={query}
                onSearchQueryChange={setQuery}
                searchPlaceholder={`Filter ${noun}`}
                totalCount={total}
                filteredCount={query ? rowsShown(row, view, query) : total}
                itemNoun={noun}
                itemNounPlural={noun}
                hasLoadedOnce
                hideCount
            />
            <div className="type-record-head" role="row">
                <span role="columnheader">Name</span>
            </div>
            <div className="datapack-pick-rows">
                <RecordList row={row} view={view} query={query} />
            </div>
        </div>
    );
}

/**
 * PROPOSED: the spot check. The data types down the left; the chosen type's records on the right.
 * The Save From Store layout (StorePicksStage), read-only. One height whatever is chosen; a long
 * type scrolls inside its pane.
 */
function TypeRail({ rows, first, tabs }: { rows: TypeOutcome[]; first?: string; tabs: boolean }) {
    const [shown, setShown] = useState(first ?? rows[0]?.type);
    const row = rows.find((r) => r.type === shown) ?? rows[0];
    return (
        <div className="datapack-picks type-rail">
            <ul className="datapack-picks-rail">
                {rows.map((r) => (
                    <li key={r.type}>
                        <button
                            type="button"
                            className={`datapack-picks-kind${r.type === row?.type ? ' datapack-picks-kind--shown' : ''}`}
                            aria-current={r.type === row?.type ? 'true' : undefined}
                            onClick={() => setShown(r.type)}
                        >
                            {r.type}
                            <span className="datapack-picks-note">
                                {digits(countOf(r))}
                                {/* A slot on every row, empty when nothing is kept, so the counts and the dots each line up. */}
                                <span className="type-rail-kept" {...(r.keptRecords?.length ? { title: `${digits(r.keptRecords.length)} kept`, 'aria-label': `${digits(r.keptRecords.length)} kept` } : {})}>
                                    {r.keptRecords?.length ? <StatusDot variant="warning" /> : null}
                                </span>
                            </span>
                        </button>
                    </li>
                ))}
            </ul>
            <div className="datapack-picks-pane">{row ? <RecordPane key={row.type} row={row} tabs={tabs} /> : null}</div>
        </div>
    );
}

export interface RecordsStepProps {
    title: string;
    rows: TypeOutcome[];
    first?: string;
    /**
     * Which types the rail lists; the panel's "Data types" select by default (J1). An install lists
     * its datapack's own types.
     */
    spread?: TypeSpread;
    /**
     * The Removed / Kept tabs (J1-3b). An install removes nothing and keeps nothing, so its spot
     * check has none on any type: one layout across the window still (rule 10).
     */
    tabs?: boolean;
    onBack: () => void;
    onClose: () => void;
}

/**
 * The spot check, as its own step of the window: wider, and it only looks. Its one button is Back,
 * on the right; the summary is the only place an action is taken, so a warning or an "I understand"
 * box there can't be skipped (owner, 2026-11-12, J2-3; prototype-conventions.md rule 19). Escape
 * still closes the window.
 */
export function RecordsStep({ title, rows, first, spread, tabs = true, onBack, onClose }: RecordsStepProps) {
    return (
        <StepsWindow
            key="records"
            title={title}
            wide
            onClose={onClose}
            hideClose
            actionButtons={[{ label: 'Back', variant: 'secondary', onPress: onBack }]}
        >
            <TypeRail rows={spreadTypes(rows, spread ?? window.__J1__.spread())} first={first} tabs={tabs} />
        </StepsWindow>
    );
}

/** The review button on a summary: opens the spot check at its first type. */
export const reviewButton = (open: () => void) => ({ label: 'Review Records', variant: 'secondary' as const, onPress: open });
