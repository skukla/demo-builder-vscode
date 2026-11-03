/**
 * The two ERP data verbs that ask first: Reset ERPs and Fill from Commerce. Each holds what
 * it is waiting on, shows its confirm, and starts the operation through the screen's runner
 * on Confirm, so it reports in the same progress modal as every other card action.
 *
 * The fill asks because it is not harmless: it adds and updates and removes nothing, but a
 * value changed by hand in an ERP is set back to Commerce's (audit, 2026-10-18). The agent's
 * `load_erp_demo_data` already asked for consent; the button did not.
 *
 * Moved out of `IntegrationsGrid` with the reset when the fill joined it, as
 * `ErpAssignDialogs` and `PrepareStoreDialogs` hold their own verbs.
 *
 * @module features/dashboard/ui/components/integrations/ErpConfirmDialogs
 */

import React, { useCallback, useMemo, useState } from 'react';
import type { ComponentOperationControls } from '../../hooks/useComponentOperation';
import { ConfirmActionDialog } from '../ConfirmActionDialog';
import { ErpResetDialog } from '../ErpResetDialog';

/** A reset waiting on its confirm: the INTEGRATION's id (it runs through it), every ERP's name. */
export interface PendingReset {
    id: string;
    erpNames: string[];
}

/** A fill waiting on its confirm: the integration's id and the name for the copy. */
export interface PendingFill {
    id: string;
    erpName: string;
}

export interface ErpConfirmDialogsProps {
    reset: PendingReset | null;
    fill: PendingFill | null;
    confirmReset: () => void;
    confirmFill: () => void;
    closeReset: () => void;
    closeFill: () => void;
}

export interface ErpConfirms {
    askReset: (pending: PendingReset) => void;
    askFill: (id: string, erpName: string) => void;
    dialogs: ErpConfirmDialogsProps;
}

/**
 * The reset's and the fill's pending state, and what Confirm starts.
 *
 * @param operations - the screen's operation runner
 * @returns the two asks for the card routers, and the dialogs' props
 */
export function useErpConfirms(operations: ComponentOperationControls): ErpConfirms {
    const [reset, setReset] = useState<PendingReset | null>(null);
    const [fill, setFill] = useState<PendingFill | null>(null);
    const askFill = useCallback((id: string, erpName: string): void => setFill({ id, erpName }), []);
    const closeReset = useCallback((): void => setReset(null), []);
    const closeFill = useCallback((): void => setFill(null), []);
    const confirmReset = useCallback((): void => {
        if (reset) operations.resetErp(reset.id);
        setReset(null);
    }, [operations, reset]);
    const confirmFill = useCallback((): void => {
        if (fill) operations.loadErpData(fill.id, fill.erpName);
        setFill(null);
    }, [operations, fill]);
    return useMemo(
        () => ({
            askReset: setReset,
            askFill,
            dialogs: { reset, fill, confirmReset, confirmFill, closeReset, closeFill },
        }),
        [askFill, reset, fill, confirmReset, confirmFill, closeReset, closeFill],
    );
}

/**
 * Both confirms, each shown while its verb waits.
 *
 * @param props - what each waits on, and the confirm and close callbacks
 * @returns the two dialogs
 */
export function ErpConfirmDialogs(props: ErpConfirmDialogsProps): React.ReactElement {
    const { reset, fill, confirmReset, confirmFill, closeReset, closeFill } = props;
    return (
        <>
            <ErpResetDialog
                isOpen={reset !== null}
                erpNames={reset?.erpNames ?? []}
                onConfirm={confirmReset}
                onClose={closeReset}
            />
            <ConfirmActionDialog
                isOpen={fill !== null}
                title={`Fill ${fill?.erpName} from Commerce?`}
                actionLabel="Fill"
                actionVariant="accent"
                onConfirm={confirmFill}
                onClose={closeFill}
            >
                {[
                    `Copies Commerce's products, companies and websites into ${fill?.erpName} as they stand now.`,
                    'Adds or updates records and removes nothing.',
                    'Manual changes in the ERP are replaced with Commerce values.',
                ]}
            </ConfirmActionDialog>
        </>
    );
}
