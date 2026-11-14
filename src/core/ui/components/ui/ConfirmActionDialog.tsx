/**
 * The confirm in front of a consequential action, drawn the one way the dialog design
 * rules draw a confirm (`docs/development/sop/dialog-design.md`): the question as the title with
 * the amber icon before it, what changes as a few short lines, Cancel and the action. A dangerous
 * action is solid red; each caller says which it is, so a new one has to decide.
 *
 * The core Modal in a DialogContainer. The container stays mounted; the Modal renders only while
 * `isOpen`. It does not post: the consumer wires `onConfirm`, so cancelling is a pure no-op. The
 * window alone is `ConfirmActionWindow`, for a host that keeps one DialogContainer and shows one
 * window at a time in it (a datapack job's Restore question).
 *
 * A confirm with a second way on (Change Anyway beside Uninstall First, step-07 D6) passes it as
 * `otherAction`: the losing choice, apart at the footer's start, as "Save Your Changes First?" draws
 * its own (`SaveFirstWindow`). A confirm that asks which of two points (Restore My Luma's Last Saved
 * or Original, step-07 U1 J9-7) passes the house RadioGroup as `choice`, under the lines.
 *
 * Shared by Remove, Remove anyway, Reset ERPs, Fill from Commerce, Reinstall in Commerce, Undo last
 * assignment, adding erp_owner to the attribute sets and taking it out, and a datapack flyout's Share,
 * Stop Sharing and Remove. Moved here from the dashboard feature when the flyout became its second
 * feature (owner, 2026-11-05).
 *
 * @module core/ui/components/ui/ConfirmActionDialog
 */

import { DialogContainer } from '@adobe/react-spectrum';
import React from 'react';
import { Modal } from '@/core/ui/components/ui/Modal';

export interface ConfirmActionDialogProps {
    isOpen: boolean;
    /** The question being asked. */
    title: string;
    /** The action button's label: the verb being confirmed. */
    actionLabel: string;
    /** `negative` (solid red) for a dangerous action, `accent` for one that is not. */
    actionVariant: 'negative' | 'accent';
    /**
     * What changes. Each child is a line of its own: pass the consequences as an array, or wrap a
     * line holding `<strong>` in a fragment. A warning is a word in a line, never a line under it.
     */
    children: React.ReactNode;
    onConfirm: () => void;
    onClose: () => void;
    /** A second way on, at the footer's start, drawn outline: the choice that loses something. */
    otherAction?: { label: string; onPress: () => void };
    /** A choice the confirm asks, under the lines: the house RadioGroup. */
    choice?: React.ReactNode;
}

/** The confirm's window alone, for a host that owns the DialogContainer. */
export function ConfirmActionWindow({
    title,
    actionLabel,
    actionVariant,
    children,
    onConfirm,
    onClose,
    otherAction,
    choice,
}: Omit<ConfirmActionDialogProps, 'isOpen'>): React.ReactElement {
    return (
        <Modal
            title={title}
            status="warning"
            size="S"
            fitContent
            onClose={onClose}
            closeLabel="Cancel"
            actionButtons={[{ label: actionLabel, variant: actionVariant, onPress: onConfirm }]}
            {...(otherAction ? { startButtons: [{ ...otherAction, variant: 'secondary' as const }] } : {})}
        >
            {/* No bullets and no box, 8 between rows (dialog design rules, owner 2026-11-02:
                a block of ten lines read worse than the sentences it held). */}
            <div className="dialog-rows">
                {React.Children.toArray(children).map((line, index) => (
                    <p key={index} className="dialog-line">{line}</p>
                ))}
                {choice}
            </div>
        </Modal>
    );
}

/**
 * Host a confirm; present it when open.
 *
 * @param props - open state, the question, the verb and how it is drawn, the lines, and the two
 *   callbacks
 * @returns the dialog container
 */
export function ConfirmActionDialog({
    isOpen,
    onClose,
    ...rest
}: ConfirmActionDialogProps): React.ReactElement {
    return (
        <DialogContainer onDismiss={onClose}>
            {isOpen && <ConfirmActionWindow {...rest} onClose={onClose} />}
        </DialogContainer>
    );
}
