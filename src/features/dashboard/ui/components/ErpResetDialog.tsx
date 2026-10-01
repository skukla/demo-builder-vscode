/**
 * The confirm in front of "Reset ERPs" (plan step 05, decision 8). Offered on the
 * integration's card, since a reset always covers every ERP it serves.
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
    return (
        <ConfirmActionDialog
            isOpen={isOpen}
            title="Reset ERPs"
            actionLabel="Reset"
            onConfirm={onConfirm}
            onClose={onClose}
        >
            <Text>
                Resets {which}: wipes their records and fills them from Commerce again, as Commerce
                stands now.
            </Text>
            <Text>
                Every open order the ERPs hold is cancelled; an order already invoiced or shipped keeps
                a note instead. A cancelled order cannot be reopened.
            </Text>
            <Text>
                The credit limits and company blocks the ERPs set in Commerce are undone. Nothing else
                in Commerce changes.
            </Text>
        </ConfirmActionDialog>
    );
}
