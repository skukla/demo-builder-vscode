/**
 * The catalog's export screen, for whichever engine is chosen (datapack-engine step 14):
 *
 * - **The Data Installer service's** (`ServiceExportModal`): name a pack in its shared catalog,
 *   pick data types, and the service exports them.
 * - **Demo Builder's** (`SaveFromStoreModal`, the default): pick items from the project's store,
 *   saved as a new version of this demo's own library pack, with the pack Demo Builder installed
 *   here when there is one. Nothing reaches the shared catalog.
 *
 * @module features/data-installer/ui/components/ExportDatapackModal
 */

import React from 'react';
import type { StorePicks } from '../../pickableKinds';
import { type PackBeingSaved, SaveFromStoreModal } from './SaveFromStoreModal';
import { ServiceExportModal } from './ServiceExportModal';

export interface ExportDatapackModalProps {
    onClose: () => void;
    /** The engine chosen; the service's when absent, as before Demo Builder's had an export. */
    engine?: 'service' | 'demo-builder';
    /** Demo Builder's engine: start the save with these picks. */
    onSave?: (picks: StorePicks) => void;
    /** Demo Builder's engine: the pack being saved, from its flyout's "Save store changes to this pack". */
    pack?: PackBeingSaved;
}

export function ExportDatapackModal({ onClose, engine = 'service', onSave, pack }: ExportDatapackModalProps): React.JSX.Element {
    if (engine === 'demo-builder' && onSave) return <SaveFromStoreModal onClose={onClose} onSave={onSave} pack={pack} />;
    return <ServiceExportModal onClose={onClose} />;
}
