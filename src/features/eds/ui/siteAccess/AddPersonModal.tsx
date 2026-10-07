/**
 * The dialog the dashed add row opens: one email field, Add and Cancel.
 *
 * Hosts its own `DialogContainer` (the modal-hosting SOP). The form is a child
 * that mounts only while open, so each opening starts with an empty field.
 *
 * @module features/eds/ui/siteAccess/AddPersonModal
 */

import { DialogContainer, TextField } from '@adobe/react-spectrum';
import React, { useState } from 'react';
import { Modal } from '@/core/ui/components/ui/Modal';

export interface AddPersonModalProps {
    isOpen: boolean;
    /** "Add a site admin". */
    title: string;
    onAdd: (email: string) => void;
    onClose: () => void;
}

function AddPersonForm({ title, onAdd, onClose }: Omit<AddPersonModalProps, 'isOpen'>): React.ReactElement {
    const [email, setEmail] = useState('');
    const trimmed = email.trim();
    return (
        <Modal
            title={title}
            size="S"
            fitContent
            onClose={onClose}
            closeLabel="Cancel"
            actionButtons={[
                { label: 'Add', variant: 'accent', isDisabled: trimmed === '', onPress: () => onAdd(trimmed) },
            ]}
        >
            <TextField label="Email" type="email" value={email} onChange={setEmail} width="100%" autoFocus />
        </Modal>
    );
}

export function AddPersonModal({ isOpen, ...form }: AddPersonModalProps): React.ReactElement {
    return (
        <DialogContainer type="modal" onDismiss={form.onClose}>
            {isOpen && <AddPersonForm {...form} />}
        </DialogContainer>
    );
}
