/**
 * The Result layout: what happened, drawn the one way the dialog design rules draw a result
 * (`docs/development/sop/dialog-design.md`). The title says it, with the status icon before it;
 * any lines under it are what the SC still has to read. Small, Close, and at most one more
 * action (Retry, Fix with AI, Open).
 *
 * A result can carry rows of its own, each a `WorkRow` with the button that acts on that line alone
 * (Delete Store Configuration beside the store configuration it loaded): the row owns its button's
 * wait and note, so Close stays the only window button.
 *
 * A clean result that is its title alone closes itself after a glance (`useCloseWhenClean`);
 * anything to read stays. The caller passes words and actions, never a size or a class: the
 * layout owns those (`tests/sop/modal-layouts.test.ts`).
 *
 * @module core/ui/components/ui/ResultDialog
 */

import { DialogContainer } from '@adobe/react-spectrum';
import React from 'react';
import type { StepStatus } from '@/core/ui/components/feedback/StepStatusIcon';
import { WorkRow } from '@/core/ui/components/feedback/WorkRow';
import { Modal, type ActionButton, type ModalStatus } from '@/core/ui/components/ui/Modal';
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

/** One line of a result that carries its own action. */
export interface ResultRow {
    label: string;
    status: StepStatus;
    /** Under the name: where it stands. */
    note?: string;
    /** The button that acts on this line alone, with its own wait and note. */
    action?: React.ReactNode;
}

export interface ResultDialogProps {
    isOpen: boolean;
    /** What happened: "My Luma Installed", "Couldn't Install My Luma". */
    title: string;
    status: ModalStatus;
    /** What the SC still has to read, one line per child. None: the title says it all. */
    children?: React.ReactNode;
    /** Lines that each carry their own action, after the lines to read. */
    rows?: ResultRow[];
    action?: ResultAction;
    onClose: () => void;
}

const NO_ROWS: ResultRow[] = [];

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
    rows = NO_ROWS,
    action,
    onClose,
}: ResultDialogProps): React.ReactElement {
    const lines = React.Children.toArray(children);
    const titleAlone = lines.length === 0 && rows.length === 0 && !action;
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
                    {(lines.length > 0 || rows.length > 0) && (
                    <div className="dialog-stack">
                        {lines.length > 0 && (
                            <div className="dialog-rows">
                                {lines.map((line, index) => (
                                    <p key={index} className="dialog-line">{line}</p>
                                ))}
                            </div>
                        )}
                        {rows.map((row) => (
                            <div key={row.label} className="dialog-row-action">
                                <WorkRow status={row.status} label={row.label} note={row.note} why={row.status === 'error'} />
                                {row.action}
                            </div>
                        ))}
                    </div>
                    )}
                </Modal>
            )}
        </DialogContainer>
    );
}

export interface ResultWindowProps {
    /** What happened: "My Luma Installed", "Dry Run Found a Problem". */
    title: string;
    status?: ModalStatus;
    /** What the SC still has to read, already laid out by its owner. None: the title says it all. */
    children?: React.ReactNode;
    /** Buttons at the start of the row: Back. */
    startButtons?: ActionButton[];
    /** Beside Close, main last: Install, Retry, Fix with AI. */
    actionButtons?: ActionButton[];
    /**
     * The result carries an Admin path (`SetupStepFacts`), which reads as one line at medium rather
     * than as several steps: the one content-derived exception to small.
     */
    holdsAdminPath?: boolean;
    onClose: () => void;
}

/**
 * A result shown in place of a window with steps, in that window's own dialog container
 * (`tests/sop/modal-hosting.test.ts`): a new window, so it takes its own small size (owner,
 * 2026-11-11), and it may lead Back to the steps.
 *
 * @param props - the title and its status, what to read, Back and the actions, and Close
 * @returns the window
 */
export function ResultWindow({
    title,
    status,
    children,
    startButtons,
    actionButtons,
    holdsAdminPath = false,
    onClose,
}: ResultWindowProps): React.ReactElement {
    return (
        <Modal
            title={title}
            status={status}
            size={holdsAdminPath ? 'M' : 'S'}
            fitContent
            onClose={onClose}
            startButtons={startButtons}
            actionButtons={actionButtons}
        >
            {children}
        </Modal>
    );
}
