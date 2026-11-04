/**
 * "Create datapack" in the catalog header, with the service's engine: a guided flow in one window
 * (`DatapackFlowDialog`) that exports from this project's Commerce instance into the shared
 * catalog. With Demo Builder's engine a pack is made from the demo's own card instead (Save As,
 * `ProjectPackSection`), so the header does not offer this then.
 *
 * | Pack type | Engine        | Where the pack goes |
 * |-----------|---------------|---------------------|
 * | Commerce  | the service's | the shared catalog  |
 * | ACO       | either        | the SC's library    |
 *
 * The header mounts this only while open, so reopening starts at the first screen.
 *
 * @module features/data-installer/ui/components/CreateDatapackModal
 */

import React from 'react';
import { DatapackFlowDialog } from './create-flow/DatapackFlowDialog';
import type { DatapackEngine } from './create-flow/datapackFlowStages';

export interface CreateDatapackModalProps {
    /** The engine chosen; the service's when absent, as the export was before Demo Builder's had one. */
    engine?: DatapackEngine;
    onClose: () => void;
}

/** The export's own screens end in its result; there is no save to hand on. */
const NO_SAVE = (): void => undefined;

export function CreateDatapackModal({ engine, onClose }: CreateDatapackModalProps): React.JSX.Element {
    return <DatapackFlowDialog title="Create Datapack" engine={engine} onClose={onClose} onSave={NO_SAVE} />;
}
