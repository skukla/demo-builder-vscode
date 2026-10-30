/**
 * The catalog's export screen, for whichever engine is chosen (datapack-engine step 14):
 *
 * - **The Data Installer service's** (`ServiceExportModal`): name a pack in its shared catalog,
 *   pick data types, and the service exports them.
 * - **Demo Builder's** (`SaveFromStoreModal`, the default): pick items from the project's store,
 *   saved as a new version of this demo's own library pack, with the pack Demo Builder installed
 *   here when there is one. Nothing reaches the shared catalog.
 *
 * **Or an ACO pack** (datapack-engine step 14 item 19, `AcoExportChoices`): made by Demo
 * Builder into the SC's library, so offered with any engine on `ServiceExportModal`'s screen;
 * the Commerce pack there only with the service's (`commerceExport`). The result view is
 * `ExportDatapackResult`.
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
    /** The service's Commerce export can run (its engine is chosen); without it, ACO only. */
    commerceExport?: boolean;
}

export function ExportDatapackModal({
    onClose,
    engine = 'service',
    onSave,
    pack,
    commerceExport,
}: ExportDatapackModalProps): React.JSX.Element {
    if (engine === 'demo-builder' && onSave) return <SaveFromStoreModal onClose={onClose} onSave={onSave} pack={pack} />;
    return <ServiceExportModal onClose={onClose} commerceExport={commerceExport} />;
}
