/**
 * "Save Changes to My Luma" (step-04 S2; decisions Phase 7b, J3-1, owner 2026-11-12: "3-1 is
 * good"): the check's wait, then what My Luma will hold, read-only, one row per type, "2,046, 4
 * changed" where the SC changed some, and no line above the table. Cancel and Save; Save hands on to
 * the run (`useSaveStoreChanges`), which this does not draw. No Review Records (walk F216, owner
 * 2026-11-17): it listed the datapack's old names under this title; a list of what Commerce holds
 * now, with what each changed record was, is filed for after the release.
 *
 * The summary is the install's own window (`JobSummaryWindow`), held at the small wait window until both
 * reads have answered, so it opens at the table's height and never grows.
 *
 * @module features/data-installer/ui/components/save/SaveChangesWindow
 */

import { DialogContainer } from '@adobe/react-spectrum';
import React from 'react';
import { UPDATE } from '../../../datapackWords';
import { JobSummaryWindow } from '../job/JobSummaryWindow';
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
    const title = `${UPDATE} ${pack.displayName}`;
    return (
        <DialogContainer onDismiss={onClose}>
            <JobSummaryWindow
                title={title}
                rows={summary.rows}
                {...(summary.problem ? { problem: summary.problem } : {})}
                ready={summary.ready}
                waiting={summary.ready ? false : WAIT_STAGES.comparingWithCommerce}
                actionButtons={[{ label: 'Save', variant: 'accent', onPress: onSave }]}
                onClose={onClose}
            />
        </DialogContainer>
    );
}
