/**
 * StoreStructureSelector
 *
 * Picker dropdown for selecting a Commerce store entity (website, store group,
 * or store view) after Auto-Detect populates the store hierarchy.
 *
 * Designed for small lists (3-4 items typical). Renders nothing if no items.
 *
 * @module features/components/ui/components/StoreStructureSelector
 */

import { Picker, Item } from '@adobe/react-spectrum';
import React from 'react';

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
    /** Label shown on the picker */
    label: string;
    /** Items to display */
    items: StoreItem[];
    /** Currently selected code */
    selectedCode: string;
    /** Called when user selects an item */
    onSelect: (code: string) => void;
    /** Whether the field is required */
    isRequired?: boolean;
    /**
     * Whether the picker is disabled (e.g. while store discovery is running).
     * When disabled, the picker still renders even with no items yet so it
     * occupies its footprint and the layout does not shift once data lands.
     */
    isDisabled?: boolean;
}

// ==========================================================
// Component
// ==========================================================

export function StoreStructureSelector({
    label,
    items,
    selectedCode,
    onSelect,
    isRequired,
    isDisabled,
}: StoreStructureSelectorProps) {
    // While disabled (detecting), keep the footprint even before items arrive so
    // populating the picker in place does not shift content below it.
    if (items.length === 0 && !isDisabled) {
        return null;
    }

    return (
        <Picker
            label={label}
            selectedKey={selectedCode || null}
            onSelectionChange={(key) => onSelect(String(key))}
            isRequired={isRequired}
            isDisabled={isDisabled}
            flex={1}
            menuWidth="size-3000"
        >
            {items.map(item => (
                <Item key={item.code}>{item.name}</Item>
            ))}
        </Picker>
    );
}
