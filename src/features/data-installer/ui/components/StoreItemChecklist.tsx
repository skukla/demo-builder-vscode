/**
 * One kind of the store's items, ticked or not, for a save from the store (datapack-engine step
 * 14): the house search band over the house checkbox rows.
 *
 * `SearchHeader` is the search box and count every list here uses; `CheckboxRow` is the row the
 * API picker, the Updates modal and "Clear demo data" use (its sheet is in this bundle's entry).
 * `SearchableList` was not used: it picks ONE item, where this picks many. A row is the item's name
 * alone, no grey detail under it (prototype-conventions rule 1, step-04 S3); the filter still
 * matches the detail (a SKU, an email), which the SC knows the item by.
 *
 * Categories are a `TreeList` (decisions Phase 6, J1-3a): each under its parent by its own name,
 * built from the path `storeItems.ts` names it by ("Gear / Bags"). A filter keeps a match's parents,
 * muted; Select All and the count take the matches alone. A parent that is not listed (already in
 * the pack being saved) is drawn by name with no tick.
 *
 * @module features/data-installer/ui/components/StoreItemChecklist
 */

import React, { useMemo, useState } from 'react';
import type { StoreItem } from '../../pickableKinds';
import { SearchHeader } from '@/core/ui/components/navigation/SearchHeader';
import { CheckboxRow } from '@/core/ui/components/selection/CheckboxRow';
import { SelectAllRow } from '@/core/ui/components/selection/SelectAllRow';
import { TreeList, treeRows, type TreeListNode, type TreeListRow } from '@/core/ui/components/ui/TreeList';

/** How `storeItems.ts` joins a category's place under the root into its name. */
const PATH_SEPARATOR = ' / ';

/** Fields a query is matched against. */
const matches = (item: StoreItem, query: string): boolean => {
    const q = query.trim().toLowerCase();
    return q === '' || item.displayName.toLowerCase().includes(q) || (item.detail ?? '').toLowerCase().includes(q);
};

/** The items as a tree, by the path each is named by; a parent not listed is a node with no id. */
function treeOf(items: readonly StoreItem[]): TreeListNode[] {
    const roots: TreeListNode[] = [];
    const byPath = new Map<string, TreeListNode>();
    const nodeAt = (parts: readonly string[]): TreeListNode => {
        const path = parts.join(PATH_SEPARATOR);
        const found = byPath.get(path);
        if (found) return found;
        const node: TreeListNode = { name: parts[parts.length - 1] };
        byPath.set(path, node);
        if (parts.length === 1) roots.push(node);
        else (nodeAt(parts.slice(0, -1)).children ??= []).push(node);
        return node;
    };
    items.forEach((item) => {
        nodeAt(item.displayName.split(PATH_SEPARATOR)).id = item.id;
    });
    return roots;
}

/** The ids the query shows, in the order drawn: a flat list's matches, or a tree's matched rows. */
function shownIds(items: readonly StoreItem[], tree: TreeListNode[] | undefined, query: string): string[] {
    if (!tree) return items.filter((item) => matches(item, query)).map((item) => item.id);
    return treeRows(tree, query).flatMap((row) => (row.matched && row.id !== undefined ? [row.id] : []));
}

export interface StoreItemChecklistProps {
    items: StoreItem[];
    /** What one of them is called, and more than one, for the count: "category", "categories". */
    nouns: readonly [string, string];
    picked: readonly string[];
    onChange: (picked: string[]) => void;
    /** Draw the items as a tree by their paths (categories). */
    tree?: boolean;
}

/** The items, searchable, each a checkbox; Select all stays above them and ticks what the search shows. */
export function StoreItemChecklist({ items, nouns, picked, onChange, tree = false }: StoreItemChecklistProps): React.ReactElement {
    const [query, setQuery] = useState('');
    const nodes = useMemo(() => (tree ? treeOf(items) : undefined), [items, tree]);
    const shown = useMemo(() => shownIds(items, nodes, query), [items, nodes, query]);
    const ticked = new Set(picked);
    const allShown = shown.length > 0 && shown.every((id) => ticked.has(id));
    const toggle = (id: string): void => onChange(ticked.has(id) ? picked.filter((p) => p !== id) : [...picked, id]);
    const toggleShown = (): void => {
        const ids = new Set(shown);
        onChange(allShown ? picked.filter((p) => !ids.has(p)) : [...new Set([...picked, ...ids])]);
    };
    const tickRow = (id: string, label: string): React.ReactElement => (
        <CheckboxRow key={id} label={label} isSelected={ticked.has(id)} onChange={() => toggle(id)} />
    );
    const treeRow = (row: TreeListRow): React.ReactNode => (row.id === undefined ? row.name : tickRow(row.id, row.name));
    const shownSet = new Set(shown);
    return (
        <div className="datapack-pick-list">
            <SearchHeader
                searchQuery={query}
                onSearchQueryChange={setQuery}
                searchPlaceholder={`Filter ${nouns[1]}`}
                totalCount={items.length}
                filteredCount={shown.length}
                itemNoun={nouns[0]}
                itemNounPlural={nouns[1]}
                hasLoadedOnce
                alwaysShowCount
            />
            {shown.length > 0 ? <SelectAllRow all={allShown} some={shown.some((id) => ticked.has(id))} onToggle={toggleShown} /> : null}
            <div className="datapack-pick-rows">
                {nodes ? (
                    <TreeList nodes={nodes} query={query} renderRow={treeRow} />
                ) : (
                    items.filter((item) => shownSet.has(item.id)).map((item) => tickRow(item.id, item.displayName))
                )}
            </div>
        </div>
    );
}
