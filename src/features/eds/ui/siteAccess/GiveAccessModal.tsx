/**
 * Give access: an email, and what they may do. Only what this identity can
 * change is offered (`GrantChoices`); reading the content is ticked to start,
 * since sharing is the common reason to be here.
 *
 * The Form layout hosts its own `DialogContainer` (the modal-hosting SOP). The
 * fields go back to their starting values each time it opens.
 *
 * @module features/eds/ui/siteAccess/GiveAccessModal
 */

import { Checkbox, TextField } from '@adobe/react-spectrum';
import React, { useEffect, useState } from 'react';
import type { GrantChoices } from './accessRows';
import { FormDialog } from '@/core/ui/components/ui/FormDialog';

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

export function GiveAccessModal({ isOpen, choices, onGive, onClose }: GiveAccessModalProps): React.ReactElement {
    const [email, setEmail] = useState('');
    const [read, setRead] = useState(choices.read);
    const [admin, setAdmin] = useState(!choices.read && choices.admin);
    useEffect(() => {
        if (!isOpen) return;
        setEmail('');
        setRead(choices.read);
        setAdmin(!choices.read && choices.admin);
    }, [isOpen, choices.read, choices.admin]);
    const trimmed = email.trim();
    const canGive = trimmed !== '' && (read || admin);
    return (
        <FormDialog
            isOpen={isOpen}
            title="Give Access"
            submitLabel="Give Access"
            onSubmit={() => onGive({ email: trimmed, admin, read })}
            submitDisabled={!canGive}
            onClose={onClose}
        >
            <TextField label="Email" type="email" value={email} onChange={setEmail} width="100%" autoFocus />
            {choices.read && (
                <Checkbox isSelected={read} onChange={setRead}>
                    Read the Content in DA.live
                </Checkbox>
            )}
            {choices.admin && (
                <Checkbox isSelected={admin} onChange={setAdmin}>
                    Change the Storefront&apos;s Settings (Configuration Admin)
                </Checkbox>
            )}
        </FormDialog>
    );
}
