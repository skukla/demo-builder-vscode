/**
 * Select all, or Clear all once everything is ticked, over a datapack form's list of boxes: the
 * import and export forms' data types, and Create datapack's store items.
 *
 * A quiet button with an icon, like the catalog header's Create datapack and Load from file
 * (`CatalogHeaderActions`). It was the bare words, which an SC reported as hard to see beside
 * the list's heading (owner, 2026-10-31). One component because the same button was written out
 * in three forms.
 *
 * @module features/data-installer/ui/components/SelectAllToggle
 */

import { ActionButton, Text } from '@adobe/react-spectrum';
import React from 'react';
import { renderMenuIcon } from '@/core/ui/components/ui/menuIcons';

export interface SelectAllToggleProps {
    /** Every box is ticked: the button offers Clear all. */
    allSelected: boolean;
    onToggle: () => void;
}

export function SelectAllToggle({ allSelected, onToggle }: SelectAllToggleProps): React.JSX.Element {
    return (
        <ActionButton isQuiet onPress={onToggle}>
            {renderMenuIcon(allSelected ? 'clearAll' : 'selectAll')}
            <Text>{allSelected ? 'Clear all' : 'Select all'}</Text>
        </ActionButton>
    );
}
