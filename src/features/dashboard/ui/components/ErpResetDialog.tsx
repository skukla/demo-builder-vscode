/**
 * The confirm in front of "Reset ERP records" (plan step 05, decision 8).
 *
 * Same shape as {@link AppBuilderComponentRemoveDialog}: a DialogContainer
 * hosting the core Modal, one negative action, Close does nothing. The words
 * are the decision: Commerce is the master, the ERP is transitory, and the
 * reset is the one act that reaches back into Commerce (the ledgered company
 * writes and the ERP order numbers are undone).
 *
 * @module features/dashboard/ui/components/ErpResetDialog
 */

import { DialogContainer, Flex, Text } from '@adobe/react-spectrum';
import React from 'react';
import { Modal } from '@/core/ui/components/ui/Modal';

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
        <DialogContainer onDismiss={onClose}>
            {isOpen && (
                <Modal
                    title="Reset ERP records"
                    size="S"
                    onClose={onClose}
                    actionButtons={[{ label: 'Reset', variant: 'negative', onPress: onConfirm }]}
                >
                    <Flex direction="column" gap="size-150">
                        <Text>
                            Wipes every record in <strong>{erpName}</strong> and mirrors Commerce into it again,
                            as Commerce stands now.
                        </Text>
                        <Text>
                            The credit limits and company blocks {erpName} set in Commerce are undone, and Commerce
                            orders lose their ERP order numbers. Nothing else in Commerce changes.
                        </Text>
                    </Flex>
                </Modal>
            )}
        </DialogContainer>
    );
}
