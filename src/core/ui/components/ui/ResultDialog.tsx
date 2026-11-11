/**
 * The Result layout: what happened, drawn the one way the dialog design rules draw a result
 * (`docs/development/sop/dialog-design.md`). The title says it, with the status icon before it;
 * any lines under it are what the SC still has to read. Small, Close, and at most one more
 * action (Retry, Fix with AI, Open).
 *
 * A clean result that is its title alone closes itself after a glance (`useCloseWhenClean`);
 * anything to read stays. The caller passes words and actions, never a size or a class: the
 * layout owns those (`tests/sop/modal-layouts.test.ts`).
 *
 * @module core/ui/components/ui/ResultDialog
 */

import { DialogContainer } from '@adobe/react-spectrum';
import React from 'react';
import { Modal, type ModalStatus } from '@/core/ui/components/ui/Modal';
import { useCloseWhenClean } from '@/core/ui/hooks/useCloseWhenClean';

/** The one extra thing a result can offer beside Close. */
export interface ResultAction {
    label: string;
    onPress: () => void;
    /** `accent` by default; `negative` when the action is dangerous. */
    variant?: 'accent' | 'negative';
}

/**
 * The modal's footer for a result's one extra action: none, or the action beside Close.
 *
 * @param action - the extra action, when there is one
 * @returns the modal's action buttons
 */
export function resultActionButtons(
    action: ResultAction | undefined,
): { label: string; variant: 'accent' | 'negative'; onPress: () => void }[] | undefined {
    if (!action) return undefined;
    const variant = action.variant ?? 'accent';
    return [{ label: action.label, variant, onPress: action.onPress }];
}

export interface ResultDialogProps {
    isOpen: boolean;
    /** What happened: "My Luma Installed", "Couldn't Install My Luma". */
    title: string;
    status: ModalStatus;
    /** What the SC still has to read, one line per child. None: the title says it all. */
    children?: React.ReactNode;
    action?: ResultAction;
    onClose: () => void;
}

/**
 * Host a result; present it when open.
 *
 * @param props - open state, the title and its status, the lines, the extra action and Close
 * @returns the dialog container
 */
export function ResultDialog({
    isOpen,
    title,
    status,
    children,
    action,
    onClose,
}: ResultDialogProps): React.ReactElement {
    const lines = React.Children.toArray(children);
    const titleAlone = lines.length === 0 && !action;
    useCloseWhenClean(isOpen && titleAlone && status === 'success', onClose);

    return (
        <DialogContainer onDismiss={onClose}>
            {isOpen && (
                <Modal
                    title={title}
                    status={status}
                    size="S"
                    fitContent
                    onClose={onClose}
                    actionButtons={resultActionButtons(action)}
                >
                    {lines.length > 0 && (
                        <div className="dialog-rows">
                            {lines.map((line, index) => (
                                <p key={index} className="dialog-line">{line}</p>
                            ))}
                        </div>
                    )}
                </Modal>
            )}
        </DialogContainer>
    );
}
