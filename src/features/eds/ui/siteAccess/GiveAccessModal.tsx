/**
 * Give access: an email, and what they may do. Only what this identity can
 * change is offered (`GrantChoices`); reading the content is ticked to start,
 * since sharing is the common reason to be here.
 *
 * Hosts its own `DialogContainer` (the modal-hosting SOP). The form is a child
 * that mounts only while open, so each opening starts empty.
 *
 * @module features/eds/ui/siteAccess/GiveAccessModal
 */

import { Checkbox, DialogContainer, Flex, TextField } from '@adobe/react-spectrum';
import React, { useState } from 'react';
import type { GrantChoices } from './accessRows';
import { Modal } from '@/core/ui/components/ui/Modal';

/** What the SC chose to give. */
export interface Grant {
    email: string;
    admin: boolean;
    read: boolean;
}

export interface GiveAccessModalProps {
    isOpen: boolean;
    choices: GrantChoices;
    onGive: (grant: Grant) => void;
    onClose: () => void;
}

function GiveAccessForm({ choices, onGive, onClose }: Omit<GiveAccessModalProps, 'isOpen'>): React.ReactElement {
    const [email, setEmail] = useState('');
    const [read, setRead] = useState(choices.read);
    const [admin, setAdmin] = useState(!choices.read && choices.admin);
    const trimmed = email.trim();
    const canGive = trimmed !== '' && (read || admin);
    return (
        <Modal
            title="Give access"
            size="S"
            fitContent
            onClose={onClose}
            closeLabel="Cancel"
            actionButtons={[
                {
                    label: 'Give access',
                    variant: 'accent',
                    isDisabled: !canGive,
                    onPress: () => onGive({ email: trimmed, admin, read }),
                },
            ]}
        >
            <Flex direction="column" gap="size-150">
                <TextField label="Email" type="email" value={email} onChange={setEmail} width="100%" autoFocus />
                {choices.read && (
                    <Checkbox isSelected={read} onChange={setRead}>
                        Read the content in DA.live
                    </Checkbox>
                )}
                {choices.admin && (
                    <Checkbox isSelected={admin} onChange={setAdmin}>
                        Change the storefront&apos;s settings (configuration admin)
                    </Checkbox>
                )}
            </Flex>
        </Modal>
    );
}

export function GiveAccessModal({ isOpen, ...form }: GiveAccessModalProps): React.ReactElement {
    return (
        <DialogContainer type="modal" onDismiss={form.onClose}>
            {isOpen && <GiveAccessForm {...form} />}
        </DialogContainer>
    );
}
