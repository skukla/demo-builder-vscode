/**
 * Select all, or Clear all once everything is ticked, over a datapack form's list of boxes: the
 * import and export forms' data types, and Create datapack's store items.
 *
 * A text button in the accent colour beside the list's label (`inline-action-link`). It was a
 * grey quiet button, which an SC reported as hard to see (owner, 2026-10-31), then the same
 * with a "select box" icon, which is drawn as a ticked checkbox and so read as "everything is
 * selected" above boxes that were not. One component because the same button was written out in
 * three forms.
 *
 * @module features/data-installer/ui/components/SelectAllToggle
 */

import React from 'react';

export interface SelectAllToggleProps {
    /** Every box is ticked: the button offers Clear all. */
    allSelected: boolean;
    onToggle: () => void;
}

export function SelectAllToggle({ allSelected, onToggle }: SelectAllToggleProps): React.JSX.Element {
    return (
        <button type="button" className="inline-action-link" onClick={onToggle}>
            {allSelected ? 'Clear all' : 'Select all'}
        </button>
    );
}
