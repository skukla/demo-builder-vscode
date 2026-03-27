/**
 * StoreStructureSelector
 *
 * Filterable listbox for selecting a Commerce store entity (website, store group,
 * or store view) after Auto-Detect populates the store hierarchy. Wraps
 * SearchableList in a fixed-height container with local search state.
 *
 * Matches the wizard's project/workspace selection UX pattern.
 *
 * @module features/components/ui/components/StoreStructureSelector
 */

import { Flex, Text } from '@adobe/react-spectrum';
import React, { useState, useMemo } from 'react';
import { SearchableList } from '@/core/ui/components/navigation/SearchableList';
import { useSearchFilter } from '@/core/ui/hooks/useSearchFilter';

// ==========================================================
// Types
// ==========================================================

interface StoreItem {
    /** Item code (used as selection value) */
    code: string;
    /** Display name */
    name: string;
    /** Numeric ID (for cascading lookups) */
    numericId: number;
}

interface StoreStructureSelectorProps {
    /** Label shown above the list */
    label: string;
    /** Items to display */
    items: StoreItem[];
    /** Currently selected code */
    selectedCode: string;
    /** Called when user selects an item */
    onSelect: (code: string) => void;
    /** Accessibility label */
    ariaLabel: string;
    /** Singular item noun (e.g., "website", "store", "store view") */
    itemNoun: string;
    /** Whether the field is required */
    isRequired?: boolean;
}

// ==========================================================
// Helpers
// ==========================================================

/** Convert StoreItems to SearchableListItem format */
function toListItems(items: StoreItem[]) {
    return items.map(item => ({
        id: item.code,
        name: item.name,
        description: item.code,
    }));
}

// ==========================================================
// Component
// ==========================================================

/** Fixed height for the list container — matches prerequisites UI */
const LIST_HEIGHT = '200px';

export function StoreStructureSelector({
    label,
    items,
    selectedCode,
    onSelect,
    ariaLabel,
    itemNoun,
    isRequired,
}: StoreStructureSelectorProps) {
    // Convert to list items
    const listItems = useMemo(() => toListItems(items), [items]);

    // Local search state
    const { query, setQuery, filteredItems } = useSearchFilter(listItems, {
        searchFields: ['name', 'description'],
    });

    // Selection handler — extract code from Set<Key>
    const handleSelectionChange = (keys: Set<React.Key>) => {
        const selectedId = Array.from(keys)[0];
        if (selectedId) {
            onSelect(String(selectedId));
        }
    };

    if (items.length === 0) {
        return null;
    }

    return (
        <Flex direction="column" marginBottom="size-200">
            <Text UNSAFE_className="spectrum-FieldLabel">
                {label}{isRequired && ' *'}
            </Text>
            <div style={{ height: LIST_HEIGHT, display: 'flex', flexDirection: 'column' }}>
                <SearchableList
                    items={listItems}
                    filteredItems={filteredItems}
                    selectedKeys={selectedCode ? [selectedCode] : []}
                    onSelectionChange={handleSelectionChange}
                    searchQuery={query}
                    onSearchQueryChange={setQuery}
                    isLoading={false}
                    hasLoadedOnce={true}
                    searchThreshold={5}
                    ariaLabel={ariaLabel}
                    itemNoun={itemNoun}
                    searchPlaceholder={`Filter ${itemNoun}s...`}
                />
            </div>
        </Flex>
    );
}
