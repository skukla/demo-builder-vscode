/**
 * The Form layout: what the SC fills in before a run, drawn the one way the dialog design rules
 * draw a form (`docs/development/sop/dialog-design.md`). The title names the thing ("Install My
 * Luma"), a lead says what it is for, the fields follow, all spaced by `dialog-stack`. Cancel
 * beside the button that commits; a button that loses the SC's changes is outline, at the start
 * of the row; a dangerous commit is red.
 *
 * While it loads what it shows, only the title, the wait and Cancel appear. The caller passes
 * words, fields and actions, never a size or a class (`tests/sop/modal-layouts.test.ts`).
 *
 * @module core/ui/components/ui/FormDialog
 */

import { DialogContainer } from '@adobe/react-spectrum';
import React from 'react';
import { LeadText } from '@/core/ui/components/ui/LeadText';
import { Modal, type ActionButton, type ModalWait } from '@/core/ui/components/ui/Modal';

/** A button that throws the SC's changes away ("Discard Changes"): outline, at the start. */
export interface FormDiscard {
    label: string;
    onPress: () => void;
}

export interface FormDialogProps {
    isOpen: boolean;
    /** The thing being made or changed: "Install My Luma". */
    title: string;
    /** What the form is for, in a sentence. */
    lead?: React.ReactNode;
    /** The fields. */
    children: React.ReactNode;
    /** The verb that commits: "Install". */
    submitLabel: string;
    /** `negative` (solid red) when committing is dangerous; `accent` otherwise. */
    submitVariant?: 'accent' | 'negative';
    onSubmit: () => void;
    submitDisabled?: boolean;
    /** The commit is doing its own work: the button shows it, the form stays. */
    submitPending?: boolean;
    discard?: FormDiscard;
    /** The form is waiting for what it will show (`WAIT_STAGES`). */
    waiting?: ModalWait | false;
    onClose: () => void;
}

/**
 * Host a form; present it when open.
 *
 * @param props - open state, the title, the lead and fields, the commit and its state, the
 *   discard button, the wait and Cancel
 * @returns the dialog container
 */
export function FormDialog({
    isOpen,
    title,
    lead,
    children,
    submitLabel,
    submitVariant = 'accent',
    onSubmit,
    submitDisabled = false,
    submitPending = false,
    discard,
    waiting = false,
    onClose,
}: FormDialogProps): React.ReactElement {
    const submit: ActionButton = {
        label: submitLabel,
        variant: submitVariant,
        onPress: onSubmit,
        isDisabled: submitDisabled,
        isPending: submitPending,
    };
    const start: ActionButton[] = discard
        ? [{ label: discard.label, variant: 'secondary', onPress: discard.onPress }]
        : [];

    return (
        <DialogContainer onDismiss={onClose}>
            {isOpen && (
                <Modal
                    title={title}
                    size="M"
                    fitContent
                    waiting={waiting}
                    onClose={onClose}
                    closeLabel="Cancel"
                    startButtons={start}
                    actionButtons={[submit]}
                >
                    <div className="dialog-stack">
                        {lead && <LeadText>{lead}</LeadText>}
                        {children}
                    </div>
                </Modal>
            )}
        </DialogContainer>
    );
}
