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
}: StoreStructureSelectorProps) {
    if (items.length === 0) {
        return null;
    }

    return (
        <Picker
            label={label}
            selectedKey={selectedCode || null}
            onSelectionChange={(key) => onSelect(String(key))}
            isRequired={isRequired}
            flex={1}
            menuWidth="size-3000"
        >
            {items.map(item => (
                <Item key={item.code}>{item.name}</Item>
            ))}
        </Picker>
    );
}
