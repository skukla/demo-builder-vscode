/**
 * The "Select all" row over a datapack form's list of checkboxes: the import form's data types, and
 * Create datapack's data types and store items. The house `CheckboxRow`, whose dash shows that some
 * are ticked, as the Updates dialog, the progress window's questions and ERP's Assign products do.
 *
 * It replaced a text link that read "Select all" or "Clear all" (owner, 2026-11-02). A checkbox shows
 * the list's state, where before it a grey button was hard to see and an icon of a ticked box said
 * everything was selected above boxes that were not (owner, 2026-10-31).
 *
 * @module features/data-installer/ui/components/SelectAllRow
 */

import React from 'react';
import { CheckboxRow } from '@/core/ui/components/selection/CheckboxRow';

export interface SelectAllRowProps {
    /** Every box in the list is ticked. */
    all: boolean;
    /** At least one box is ticked. */
    some: boolean;
    onToggle: () => void;
}

export function SelectAllRow({ all, some, onToggle }: SelectAllRowProps): React.JSX.Element {
    return <CheckboxRow label="Select All" isSelected={all} isIndeterminate={some && !all} onChange={onToggle} />;
}
