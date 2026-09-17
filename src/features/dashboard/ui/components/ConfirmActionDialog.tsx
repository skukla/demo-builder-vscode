/**
 * The confirm in front of a consequential integration action: the core Modal
 * in a DialogContainer, one negative action, and Close that does nothing. The
 * container stays mounted; the Modal renders only while `isOpen`. It does not
 * post: the consumer wires `onConfirm`, so cancelling is a pure no-op.
 *
 * Shared by Remove, Reset ERP records and Reinstall in Commerce. Kept in the
 * dashboard feature because nothing else confirms this way.
 *
 * @module features/dashboard/ui/components/ConfirmActionDialog
 */

import { DialogContainer, Flex } from '@adobe/react-spectrum';
import React from 'react';
import { Modal } from '@/core/ui/components/ui/Modal';

export interface ConfirmActionDialogProps {
    isOpen: boolean;
    title: string;
    /** The negative button's label: the verb being confirmed. */
    actionLabel: string;
    /** The consequence, one Text per paragraph. */
    children: React.ReactNode;
    onConfirm: () => void;
    onClose: () => void;
}

/**
 * Host a destructive confirm; present it when open.
 *
 * @param props - open state, title, verb, body, and the two callbacks
 * @returns the dialog container
 */
export function ConfirmActionDialog({
    isOpen,
    title,
    actionLabel,
    children,
    onConfirm,
    onClose,
}: ConfirmActionDialogProps): React.ReactElement {
    return (
        <DialogContainer onDismiss={onClose}>
            {isOpen && (
                <Modal
                    title={title}
                    size="S"
                    onClose={onClose}
                    actionButtons={[{ label: actionLabel, variant: 'negative', onPress: onConfirm }]}
                >
                    <Flex direction="column" gap="size-150">
                        {children}
                    </Flex>
                </Modal>
            )}
        </DialogContainer>
    );
}
