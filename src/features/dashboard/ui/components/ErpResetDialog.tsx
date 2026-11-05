/**
 * The confirm in front of "Reset ERPs" (plan step 05, decision 8), hosted by
 * `ErpConfirmDialogs`. Offered on the integration's card, since a reset always covers every
 * ERP it serves.
 *
 * Through {@link ConfirmActionDialog}: solid red, Cancel does nothing. The words are the
 * decision: Commerce is the master, the ERP is transitory, and the reset is the one act that
 * reaches back into Commerce (the ledgered company writes and the ERP order numbers are undone).
 *
 * @module features/dashboard/ui/components/ErpResetDialog
 */

import React from 'react';
import { ConfirmActionDialog } from '@/core/ui/components/ui/ConfirmActionDialog';
import { andList } from '@/core/utils/andList';

export interface ErpResetDialogProps {
    isOpen: boolean;
    /** Every ERP the reset covers, by the names the SC gave them. */
    erpNames: string[];
    onConfirm: () => void;
    onClose: () => void;
}

/** The question: the ERP by name when there is one, else how many. */
function resetTitle(erpNames: string[]): string {
    if (erpNames.length === 1) return `Reset ${erpNames[0]}?`;
    return erpNames.length > 1 ? `Reset ${erpNames.length} ERPs?` : 'Reset Every ERP?';
}

/**
 * Host the ERP reset confirm; present it when open.
 *
 * @param props - open state, the ERP's name, and the two callbacks
 * @returns the dialog container
 */
export function ErpResetDialog({ isOpen, erpNames, onConfirm, onClose }: ErpResetDialogProps): React.ReactElement {
    const which = erpNames.length > 0 ? andList(erpNames) : 'every ERP this integration serves';
    const them = erpNames.length === 1 ? 'it' : 'them';
    return (
        <ConfirmActionDialog
            isOpen={isOpen}
            title={resetTitle(erpNames)}
            actionLabel="Reset"
            actionVariant="negative"
            onConfirm={onConfirm}
            onClose={onClose}
        >
            {[
                `Clears ${which} and reloads ${them} from Commerce.`,
                'Permanently cancels open orders in the ERPs; orders already invoiced or shipped get a note instead.',
                'Removes the credit limits and company blocks the ERPs set in Commerce.',
                'Nothing else in Commerce changes.',
            ]}
        </ConfirmActionDialog>
    );
}
