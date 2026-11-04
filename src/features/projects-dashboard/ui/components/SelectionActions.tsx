/**
 * SelectionActions — the projects list's count row in selection mode (owner, 2026-11-04), in the
 * two slots `SearchHeader` gives it. At the start, in the count's place, the house `SelectAllRow`
 * over the projects the filter shows and "3 of 12 selected". At the end, Reset Selected and Delete
 * Selected (nothing to do with none ticked) and Done. Outside selection mode the end holds Select.
 *
 * @module features/projects-dashboard/ui/components/SelectionActions
 */

import { ActionButton, Text } from '@adobe/react-spectrum';
import React from 'react';
import type { ProjectSelectionControls } from '../hooks/useProjectSelection';
import { SelectAllRow } from '@/core/ui/components/selection/SelectAllRow';
import type { Project } from '@/types/base';
import type { ProjectsBatchAction } from '@/types/projectsBatch';

/** The batch window as the list needs it: what opens it, and whether it is open. */
export interface ListBatch {
    start: (action: ProjectsBatchAction, projects: Project[]) => void;
    /** Open over the list: Escape is the window's then, not the selection's. */
    isOpen: boolean;
    /** How many runs have started; the list leaves selection mode on each. */
    runs: number;
}

/** Select All and the count, in the count's place. */
export function SelectionCount({ selection }: { selection: ProjectSelectionControls }): React.ReactElement {
    const count = selection.chosen.length;
    return (
        <div className="projects-select-bar">
            <SelectAllRow all={selection.all} some={count > 0} onToggle={selection.toggleAll} />
            <Text UNSAFE_className="text-sm text-gray-600">{`${count} of ${selection.shown} selected`}</Text>
        </div>
    );
}

interface ActionsProps {
    selection: ProjectSelectionControls;
    /** Reset Selected or Delete Selected, on the ticked projects. */
    onBatch: ListBatch['start'];
}

/** Select, or in selection mode what to do with the ticked projects and Done. */
export function SelectionActions({ selection, onBatch }: ActionsProps): React.ReactElement {
    if (!selection.selecting) {
        return (
            <ActionButton isQuiet onPress={selection.enter}>
                Select
            </ActionButton>
        );
    }
    const none = selection.chosen.length === 0;
    return (
        <div className="projects-select-bar">
            <ActionButton isQuiet isDisabled={none} onPress={() => onBatch('reset', selection.chosen)}>
                Reset Selected
            </ActionButton>
            <ActionButton isQuiet isDisabled={none} onPress={() => onBatch('delete', selection.chosen)}>
                Delete Selected
            </ActionButton>
            <ActionButton isQuiet onPress={selection.done}>
                Done
            </ActionButton>
        </div>
    );
}
