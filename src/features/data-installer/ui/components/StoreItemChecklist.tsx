/**
 * One kind of the store's items, ticked or not, for a save from the store (datapack-engine step
 * 14): the house search band over the house checkbox rows.
 *
 * `SearchHeader` is the search box and count every list here uses; `CheckboxRow` is the row the
 * API picker, the Updates modal and "Clear demo data" use (its sheet is in this bundle's entry).
 * `SearchableList` was not used: it picks ONE item, where this picks many.
 *
 * @module features/data-installer/ui/components/StoreItemChecklist
 */

import React, { useMemo, useState } from 'react';
import type { StoreItem } from '../../pickableKinds';
import { SelectAllToggle } from './SelectAllToggle';
import { SearchHeader } from '@/core/ui/components/navigation/SearchHeader';
import { CheckboxRow } from '@/core/ui/components/selection/CheckboxRow';

/** Fields a query is matched against. */
const matches = (item: StoreItem, query: string): boolean => {
    const q = query.trim().toLowerCase();
    return q === '' || item.displayName.toLowerCase().includes(q) || (item.detail ?? '').toLowerCase().includes(q);
};

export interface StoreItemChecklistProps {
    items: StoreItem[];
    /** What one of them is called, and more than one, for the count: "category", "categories". */
    nouns: readonly [string, string];
    picked: readonly string[];
    onChange: (picked: string[]) => void;
}

/** The items, searchable, each a checkbox; Select all ticks what the search shows. */
export function StoreItemChecklist({ items, nouns, picked, onChange }: StoreItemChecklistProps): React.ReactElement {
    const [query, setQuery] = useState('');
    const shown = useMemo(() => items.filter((item) => matches(item, query)), [items, query]);
    const ticked = new Set(picked);
    const allShown = shown.length > 0 && shown.every((item) => ticked.has(item.id));
    const toggle = (id: string): void => onChange(ticked.has(id) ? picked.filter((p) => p !== id) : [...picked, id]);
    const toggleShown = (): void => {
        const ids = new Set(shown.map((item) => item.id));
        onChange(allShown ? picked.filter((p) => !ids.has(p)) : [...new Set([...picked, ...ids])]);
    };
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
                countTrailing={
                    shown.length > 0 ? (
                        <SelectAllToggle allSelected={allShown} onToggle={toggleShown} />
                    ) : null
                }
            />
            <div className="datapack-pick-rows">
                {shown.map((item) => (
                    <CheckboxRow key={item.id} label={item.displayName} detail={item.detail} isSelected={ticked.has(item.id)} onChange={() => toggle(item.id)} />
                ))}
            </div>
        </div>
    );
}
