/**
 * The mock ERP's demo controls on its card (AB-59): "Appearance" and "Simulate downtime".
 * One element for both, owned once by the integrations grid like its other dialogs. Each
 * control hosts its own DialogContainer and mounts its modal per opening, so each opening
 * reads the ERP afresh and starts from what it holds.
 *
 * @module features/dashboard/ui/components/ErpDemoControlsDialog
 */

import React from 'react';
import { ErpAppearanceDialog } from './ErpAppearanceDialog';
import { ErpDowntimeDialog } from './ErpDowntimeDialog';
import type { ErpDemoControlTarget } from '@/features/dashboard/ui/hooks/useErpDemoControls';

export type { ErpDemoControlTarget };

export interface ErpDemoControlsDialogProps {
    /** The open control, or null when none is. */
    target: ErpDemoControlTarget | null;
    onClose: () => void;
}

/**
 * Host the open demo control.
 *
 * @param props - the open control and the close callback
 * @returns both controls' dialogs, at most one of them open
 */
export function ErpDemoControlsDialog({
    target,
    onClose,
}: ErpDemoControlsDialogProps): React.ReactElement {
    return (
        <>
            <ErpAppearanceDialog target={target} onClose={onClose} />
            <ErpDowntimeDialog target={target} onClose={onClose} />
        </>
    );
}
