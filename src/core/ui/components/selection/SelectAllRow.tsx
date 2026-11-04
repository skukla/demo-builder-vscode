/**
 * The "Select All" row over a list of checkboxes, in every list that has one: the datapack import
 * form's data types, Create Datapack's data types and store items, and the progress window's
 * questions (deleting a project's online resources). The house `CheckboxRow`, whose dash shows that
 * some are ticked.
 *
 * Set apart by a thin rule under it (owner, 2026-11-03: "it gets lost"), so it reads as a control
 * over the list rather than one more item in it, the way a table's header checkbox does. Moved to
 * core the same day from the data installer, when the progress window's own copy was folded in.
 * Not the Updates dialog's group headers: each of those selects one named group, not the list.
 *
 * It replaced a text link that read "Select all" or "Clear all" (owner, 2026-11-02). A checkbox shows
 * the list's state, where before it a grey button was hard to see and an icon of a ticked box said
 * everything was selected above boxes that were not (owner, 2026-10-31).
 *
 * `everything` is the same row one level up, over a list of lists: Create Datapack's kinds, where it
 * ticks every item of every kind (owner, 2026-11-03, chosen over a footer button because it shows the
 * partial state and sits on what it changes).
 *
 * Styled by `core/ui/styles/checkbox-row.css` (`.select-all-row`), which every host bundle imports.
 *
 * @module core/ui/components/selection/SelectAllRow
 */

import React from 'react';
import { CheckboxRow } from './CheckboxRow';

export interface SelectAllRowProps {
    /** Every box in the list is ticked. */
    all: boolean;
    /** At least one box is ticked. */
    some: boolean;
    onToggle: () => void;
    /** Over a list of lists: every item of every one ("Select Everything"). */
    everything?: boolean;
    /** Still reading what it would tick. */
    isDisabled?: boolean;
}

export function SelectAllRow({ all, some, onToggle, everything = false, isDisabled }: SelectAllRowProps): React.JSX.Element {
    return (
        <div className="select-all-row">
            <CheckboxRow
                label={everything ? 'Select Everything' : 'Select All'}
                isSelected={all}
                isIndeterminate={some && !all}
                isDisabled={isDisabled}
                onChange={onToggle}
            />
        </div>
    );
}
