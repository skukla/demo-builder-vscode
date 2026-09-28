/**
 * The confirm in front of "Reset ERP records" (plan step 05, decision 8).
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
    /** The ERP's display name — what the SC called it. */
    erpName: string;
    onConfirm: () => void;
    onClose: () => void;
}

/**
 * Host the ERP reset confirm; present it when open.
 *
 * @param props - open state, the ERP's name, and the two callbacks
 * @returns the dialog container
 */
export function ErpResetDialog({ isOpen, erpName, onConfirm, onClose }: ErpResetDialogProps): React.ReactElement {
    return (
        <ConfirmActionDialog
            isOpen={isOpen}
            title="Reset ERP records"
            actionLabel="Reset"
            onConfirm={onConfirm}
            onClose={onClose}
        >
            <Text>
                Resets every ERP this integration serves, {erpName} included: wipes their records and
                fills them from Commerce again, as Commerce stands now.
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
