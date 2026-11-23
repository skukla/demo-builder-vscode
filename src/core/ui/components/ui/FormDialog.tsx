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
 * It never changes height once on screen (owner, 2026-11-11): it is held at the height it opens
 * at, the fields scroll inside it and the buttons stay at the bottom. A form that can fail
 * (`failure`, null until it does) keeps room for its failure line from the start, so the failure line
 * arriving above the fields moves nothing, and what the SC typed stays in them. A commit that
 * carries on after the window closes (`background`) turns Cancel into Run in Background while it
 * is pending.
 *
 * @module core/ui/components/ui/FormDialog
 */

import { DialogContainer } from '@adobe/react-spectrum';
import React from 'react';
import { LeadText } from '@/core/ui/components/ui/LeadText';
import { Modal, type ActionButton, type ModalWait } from '@/core/ui/components/ui/Modal';
import { useFixedHeight } from '@/core/ui/components/ui/useFixedHeight';

/** A button that throws the SC's changes away ("Discard Changes"): outline, at the start. */
export interface FormDiscard {
    label: string;
    onPress: () => void;
}

export interface FormDialogProps {
    isOpen: boolean;
    /** The thing being made or changed: "Install My Luma", or "Couldn't Save …" once it failed. */
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
    /**
     * The commit carries on once the window closes (a redeploy, with its progress on the card):
     * while it is pending, Cancel reads Run in Background.
     */
    background?: boolean;
    /**
     * Why the last commit did not go through: a plain line above the fields; the title carries the red (dialog design rules).
     * Pass null while it has not failed, so the line's room is kept from the start; leave it out
     * for a form that cannot fail.
     */
    failure?: React.ReactNode | null;
    discard?: FormDiscard;
    /** The form is waiting for what it will show (`WAIT_STAGES`). */
    waiting?: ModalWait | false;
    onClose: () => void;
}

/** The failure line's room, kept until the height is held: two lines of the size it is drawn at. */
const FAILURE_ROOM = 'The reason a save did not go through, as the extension words it, over two lines of the form.';

function FormWindow({
    title,
    lead,
    children,
    submitLabel,
    submitVariant = 'accent',
    onSubmit,
    submitDisabled = false,
    submitPending = false,
    background = false,
    failure,
    discard,
    waiting = false,
    onClose,
}: Omit<FormDialogProps, 'isOpen'>): React.ReactElement {
    const { ref, locked } = useFixedHeight(!waiting);
    const canFail = failure !== undefined;
    const failed = canFail && failure !== null && failure !== false;
    // The failure line's room is held until the height is: then it shows in that room.
    const reserveFailure = canFail && !failed && !locked;
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
        <Modal
            title={title}
            status={failed ? 'error' : undefined}
            size="M"
            fitContent
            lockHeight={locked}
            waiting={waiting}
            onClose={onClose}
            closeLabel={background && submitPending ? 'Run in Background' : 'Cancel'}
            startButtons={start}
            actionButtons={[submit]}
        >
            <div className="dialog-stack" ref={ref}>
                {failed && <p className="dialog-line" role="alert">{failure}</p>}
                {lead && <LeadText>{lead}</LeadText>}
                {children}
                {reserveFailure && (
                    <p className="dialog-line modal-steps-ghost" aria-hidden="true">{FAILURE_ROOM}</p>
                )}
            </div>
        </Modal>
    );
}

/**
 * Host a form; present it when open.
 *
 * @param props - open state, the title, the lead and fields, the commit and its state, the
 *   failure, the discard button, the wait and Cancel
 * @returns the dialog container
 */
export function FormDialog({ isOpen, onClose, ...rest }: FormDialogProps): React.ReactElement {
    return (
        <DialogContainer onDismiss={onClose}>
            {isOpen && <FormWindow onClose={onClose} {...rest} />}
        </DialogContainer>
    );
}
