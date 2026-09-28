/**
 * The name prompt in front of "Add another ERP" (AB-16): the ERP integration is added once,
 * and each further ERP is added from its card under a name the SC types. The name must be
 * new to the project, compared without case; the extension checks it again before anything
 * runs (`erpNameProblem`), so this check is for the SC's benefit, not the gate.
 *
 * The core Modal in a DialogContainer, the same host as {@link ConfirmActionDialog}, with
 * one accent action instead of a negative one: adding is not destructive.
 *
 * @module features/dashboard/ui/components/AddErpDialog
 */

import { DialogContainer, Flex, Text, TextField } from '@adobe/react-spectrum';
import React, { useState } from 'react';
import { Modal } from '@/core/ui/components/ui/Modal';

/** The longest name, the extension's `MAX_ERP_NAME`. */
const MAX_NAME = 40;

export interface AddErpDialogProps {
    /** The integration the ERP is added to, while the prompt is open. */
    integrationName?: string;
    /** Names already in the project, which a new ERP may not reuse. */
    takenNames: string[];
    onAdd: (name: string) => void;
    onClose: () => void;
}

/** Why the typed name cannot be used, or undefined. */
function nameProblem(name: string, taken: string[]): string | undefined {
    const trimmed = name.trim();
    if (!trimmed) return undefined;
    const lower = trimmed.toLowerCase();
    return taken.some((existing) => existing.trim().toLowerCase() === lower)
        ? 'This project already has an ERP by that name.'
        : undefined;
}

/**
 * Host the name prompt; present it while an integration is named.
 *
 * @param props - the integration, the taken names, and the two callbacks
 * @returns the dialog container
 */
export function AddErpDialog({ integrationName, takenNames, onAdd, onClose }: AddErpDialogProps): React.ReactElement {
    return (
        <DialogContainer onDismiss={onClose}>
            {integrationName !== undefined && (
                <AddErpForm integrationName={integrationName} takenNames={takenNames} onAdd={onAdd} onClose={onClose} />
            )}
        </DialogContainer>
    );
}

/** The open prompt: mounted per opening, so each starts empty. */
function AddErpForm({ integrationName, takenNames, onAdd, onClose }: AddErpDialogProps & { integrationName: string }) {
    const [name, setName] = useState('');
    const problem = nameProblem(name, takenNames);
    const ready = name.trim().length > 0 && !problem;
    const add = (): void => {
        if (ready) onAdd(name.trim());
    };
    return (
        <Modal
            title="Add another ERP"
            size="S"
            fitContent
            onClose={onClose}
            actionButtons={[{ label: 'Add', variant: 'accent', onPress: add, isDisabled: !ready }]}
        >
            <Flex direction="column" gap="size-150">
                <Text>
                    A new ERP of its own, in its own Adobe workspace, that {integrationName} sends
                    orders to. It is filled from Commerce once it is deployed.
                </Text>
                <TextField
                    label="ERP name"
                    value={name}
                    onChange={setName}
                    maxLength={MAX_NAME}
                    autoFocus
                    width="100%"
                    validationState={problem ? 'invalid' : undefined}
                    errorMessage={problem}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') add();
                    }}
                />
                <Text>
                    Products go to it when their erp_owner attribute is its id, which the
                    integration&apos;s Settings page shows in its ERP switcher.
                </Text>
            </Flex>
        </Modal>
    );
}
