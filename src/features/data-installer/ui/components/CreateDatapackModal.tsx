/**
 * "Create datapack" (owner, 2026-10-30): the header's one way to make a pack from this project's
 * Commerce instance. A guided flow in one window (`DatapackFlowDialog`): which kind of pack, then
 * the screens that pack needs.
 *
 * | Pack type | Engine         | Where the pack goes                                                     |
 * |-----------|----------------|-------------------------------------------------------------------------|
 * | Commerce  | Demo Builder's | this demo's own library pack, by the catalog's save (`onSaveFromStore`, with its progress window) |
 * | Commerce  | the service's  | the shared catalog                                                      |
 * | ACO       | either         | the SC's library                                                        |
 *
 * The header mounts this only while open, so reopening starts at the first screen.
 *
 * @module features/data-installer/ui/components/CreateDatapackModal
 */

import React, { useCallback } from 'react';
import type { StorePicks } from '../../pickableKinds';
import { DatapackFlowDialog } from './create-flow/DatapackFlowDialog';
import type { DatapackEngine } from './create-flow/datapackFlowStages';

export interface CreateDatapackModalProps {
    /** The engine chosen; the service's when absent, as the export was before Demo Builder's had one. */
    engine?: DatapackEngine;
    onClose: () => void;
    /** Demo Builder's engine, Commerce: save the picks into this demo's own pack. */
    onSaveFromStore: (picks: StorePicks) => void;
}

export function CreateDatapackModal({ engine, onClose, onSaveFromStore }: CreateDatapackModalProps): React.JSX.Element {
    const save = useCallback(
        (picks: StorePicks): void => {
            onClose();
            onSaveFromStore(picks);
        },
        [onClose, onSaveFromStore],
    );
    return <DatapackFlowDialog title="Create datapack" engine={engine} onClose={onClose} onSave={save} />;
}
