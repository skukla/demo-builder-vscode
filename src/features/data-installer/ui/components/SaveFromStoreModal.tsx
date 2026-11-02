/**
 * "Save store changes to this pack": the same screens as a Commerce pack in "Create datapack"
 * (`DatapackFlowDialog`), starting at the selection, under this dialog's own title. Each kind's
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
    /** Start the save with these picks. Must be stable. */
    onSave: (picks: StorePicks) => void;
    pack?: PackBeingSaved;
}

export function SaveFromStoreModal({ onClose, onSave, pack }: SaveFromStoreModalProps): React.JSX.Element {
    return <DatapackFlowDialog title="Save store changes" engine="demo-builder" startsAtPicks pack={pack} onClose={onClose} onSave={onSave} />;
}
