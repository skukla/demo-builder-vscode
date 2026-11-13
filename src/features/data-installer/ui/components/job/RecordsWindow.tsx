/**
 * Review Records, its own wide window (step 03, S4; the prototype's `RecordsStep`): the data types
 * on the left, the chosen type's records on the right. It only looks: its one button is Back, on
 * the right, returning to the summary, the only place an action is taken (prototype-conventions
 * rule 19). The window stays unseen until the records are read, so it never grows. Clear's
 * window (step 06, C2b) hands in its kept records, trees and unread types, for the Removed and Kept
 * tabs.
 *
 * @module features/data-installer/ui/components/job/RecordsWindow
 */

import React from 'react';
import { type ClearRecordsShown, TypeRail } from '../typeSummary/TypeRail';
import type { TypeRow } from './installRows';
import { StepsWindow } from '@/core/ui/components/ui/StepsDialog';

export interface RecordsWindowProps extends ClearRecordsShown {
    title: string;
    rows: readonly TypeRow[];
    records: Record<string, string[]> | null;
    reading: boolean;
    onBack: () => void;
    onClose: () => void;
}

export function RecordsWindow({
    title,
    rows,
    records,
    reading,
    onBack,
    onClose,
    ...clear
}: RecordsWindowProps): React.ReactElement {
    return (
        <StepsWindow
            title={title}
            wide
            ready={!reading}
            hideClose
            actionButtons={[{ label: 'Back', variant: 'secondary', onPress: onBack }]}
            onClose={onClose}
        >
            <TypeRail rows={rows} records={records} {...clear} />
        </StepsWindow>
    );
}
