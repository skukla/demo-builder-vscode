/**
 * Save and Save As (`.rptc/plans/datapack-save-as/`): the same screens as a Commerce pack in the
 * create flow (`DatapackFlowDialog`), starting at the selection; Save As asks the new pack's name
 * first. The title names what it does. Each kind's
 * items are listed less what the pack holds already, so the SC can add what they made by hand in the
 * Admin. Save hands the picks to `onSave`, which starts the save in the screen's progress window
 * (`useSaveStoreChanges`), so this closes rather than showing a result.
 *
 * @module features/data-installer/ui/components/SaveFromStoreModal
 */

import React from 'react';
import type { StorePicks } from '../../pickableKinds';
import { DatapackFlowDialog } from './create-flow/DatapackFlowDialog';
import type { PackBeingSaved } from './create-flow/datapackFlowStages';

export interface SaveFromStoreModalProps {
    onClose: () => void;
    /** Start the save with these picks, and Save As's name. Must be stable. */
    onSave: (picks: StorePicks, saveAsName?: string) => void;
    pack?: PackBeingSaved;
    /** Save As: the name the new pack starts with. Absent: Save into `pack`. */
    saveAsName?: string;
}

export function SaveFromStoreModal({ onClose, onSave, pack, saveAsName }: SaveFromStoreModalProps): React.JSX.Element {
    const title = titleOf(pack, saveAsName);
    return (
        <DatapackFlowDialog
            title={title}
            startsAtPicks
            pack={pack}
            saveAsName={saveAsName}
            // Save into the SC's own pack may branch off instead.
            canSaveAsNew={pack !== undefined && saveAsName === undefined}
            onClose={onClose}
            onSave={onSave}
        />
    );
}

/**
 * The button's own words (owner, 2026-11-09, F83): Save Changes into the SC's own pack, Save As New
 * Datapack from another's, Create Datapack from nothing.
 */
function titleOf(pack: PackBeingSaved | undefined, saveAsName: string | undefined): string {
    if (!pack) return 'Create Datapack';
    return saveAsName === undefined ? 'Save Changes' : 'Save As New Datapack';
}
