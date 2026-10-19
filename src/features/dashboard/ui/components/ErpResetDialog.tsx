/**
 * The confirm in front of "Reset ERPs" (plan step 05, decision 8), hosted by
 * `ErpConfirmDialogs`. Offered on the integration's card, since a reset always covers every
 * ERP it serves.
 *
 * Through {@link ConfirmActionDialog}: one negative action, Close does
 * nothing. The words
 * are the decision: Commerce is the master, the ERP is transitory, and the
 * reset is the one act that reaches back into Commerce (the ledgered company
 * writes and the ERP order numbers are undone).
 *
 * @module features/dashboard/ui/components/ErpResetDialog
 */

import { Text } from '@adobe/react-spectrum';
import React from 'react';
import { ConfirmActionDialog } from './ConfirmActionDialog';

export interface ErpResetDialogProps {
    isOpen: boolean;
    /** Every ERP the reset covers, by the names the SC gave them. */
    erpNames: string[];
    onConfirm: () => void;
    onClose: () => void;
}

/**
 * Host the ERP reset confirm; present it when open.
 *
 * @param props - open state, the ERP's name, and the two callbacks
 * @returns the dialog container
 */
export function ErpResetDialog({ isOpen, erpNames, onConfirm, onClose }: ErpResetDialogProps): React.ReactElement {
    const which = erpNames.length > 0 ? erpNames.join(' and ') : 'every ERP this integration serves';
    const them = erpNames.length === 1 ? 'it' : 'them';
    return (
        <ConfirmActionDialog
            isOpen={isOpen}
            title="Reset ERPs"
            actionLabel="Reset"
            onConfirm={onConfirm}
            onClose={onClose}
        >
            <Text>Clears {which} and reloads {them} from Commerce.</Text>
            <Text>
                Open orders in the ERPs are cancelled. Orders already invoiced or shipped get a note
                instead. Cancelled orders can't be reopened.
            </Text>
            <Text>
                Credit limits and company blocks the ERPs set in Commerce are removed. Nothing else in
                Commerce changes.
            </Text>
        </ConfirmActionDialog>
    );
}
