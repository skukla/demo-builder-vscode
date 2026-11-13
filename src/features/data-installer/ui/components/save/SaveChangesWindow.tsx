/**
 * "Save Changes to My Luma" (step-04 S2; decisions Phase 7b, J3-1, owner 2026-11-12: "3-1 is
 * good"): the check's wait, then what My Luma will hold, read-only, one row per type, "2,046, 4
 * changed" where the SC changed some, and no line above the table. Review Records opens the same spot
 * check as an install's (`RecordsWindow`), Back only. Cancel and Save; Save hands on to the run
 * (`useSaveStoreChanges`), which this does not draw.
 *
 * The summary is the install's own window (`JobSummaryWindow`), held unseen until both reads have
 * answered, so it opens at the table's height and never grows.
 *
 * @module features/data-installer/ui/components/save/SaveChangesWindow
 */

import { DialogContainer } from '@adobe/react-spectrum';
import React from 'react';
import { JobSummaryWindow } from '../job/JobSummaryWindow';
import { RecordsWindow } from '../job/RecordsWindow';
import type { PackBeingSaved } from './packBeingSaved';
import { useSaveSummary } from './useSaveSummary';
import { WAIT_STAGES } from '@/core/utils/waitStages';

export interface SaveChangesWindowProps {
    /** The datapack the project holds, the SC's own. Must be stable. */
    pack: PackBeingSaved;
    /** Save: start the run. */
    onSave: () => void;
    onClose: () => void;
}

export function SaveChangesWindow({
    pack,
    onSave,
    onClose,
}: SaveChangesWindowProps): React.ReactElement {
    const summary = useSaveSummary(pack);
    const title = `Save Changes to ${pack.displayName}`;
    return (
        <DialogContainer onDismiss={onClose}>
            {summary.reviewing ? (
                <RecordsWindow
                    key="records"
                    title={title}
                    rows={summary.rows}
                    records={summary.records}
                    reading={summary.recordsReading}
                    onBack={summary.back}
                    onClose={onClose}
                />
            ) : (
                <JobSummaryWindow
                    key="summary"
                    title={title}
                    rows={summary.rows}
                    {...(summary.problem ? { problem: summary.problem } : {})}
                    ready={summary.ready}
                    waiting={summary.ready ? false : WAIT_STAGES.checkingForChanges}
                    onReview={summary.review}
                    actionButtons={[{ label: 'Save', variant: 'accent', onPress: onSave }]}
                    onClose={onClose}
                />
            )}
        </DialogContainer>
    );
}
