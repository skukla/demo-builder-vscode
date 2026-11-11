/**
 * The Progress layout: a run, then how it ended, in one window that never changes size
 * (`docs/development/sop/dialog-design.md`). Small from start to finish; the size of a list
 * when it shows its steps as rows. While it runs it shows the wait, or the rows, and Close;
 * once it ends the title says how, with the status icon, and the lines under it are what the
 * SC still has to read.
 *
 * A clean end that is its title alone closes itself after a glance (`useCloseWhenClean`). The
 * caller passes words, rows and actions, never a size or a class
 * (`tests/sop/modal-layouts.test.ts`).
 *
 * @module core/ui/components/ui/ProgressDialog
 */

import { DialogContainer } from '@adobe/react-spectrum';
import React from 'react';
import { WorkRow, type WorkRowProps } from '@/core/ui/components/feedback/WorkRow';
import { Modal, type ModalStatus, type ModalWait } from '@/core/ui/components/ui/Modal';
import { resultActionButtons, type ResultAction } from '@/core/ui/components/ui/ResultDialog';
import { useCloseWhenClean } from '@/core/ui/hooks/useCloseWhenClean';

export interface ProgressDialogProps {
    isOpen: boolean;
    /** "Installing My Luma" while it runs; what happened once it ends. */
    title: string;
    /** What the run is doing (`WAIT_STAGES`), while it runs and shows no rows. */
    waiting?: ModalWait | false;
    /** The run's steps, one row each. Given from start to finish, so the size never changes. */
    rows?: WorkRowProps[];
    /** How it ended; absent while it runs. */
    status?: ModalStatus;
    /** What the SC still has to read once it ends, one line per child. */
    children?: React.ReactNode;
    /** Retry, Fix with AI: the one thing an ended run can offer beside Close. */
    action?: ResultAction;
    /**
     * A streamed run's own view: its stages, the question it is paused on, how it ended
     * (`OperationProgressBody`). It stands in for the wait, the rows and the lines, and can show
     * rows at any point, so the window takes a list's size from the start.
     */
    stream?: React.ReactNode;
    /** The buttons a streamed run offers beside dismissing it (answers, Retry), main last. */
    actions?: ProgressAction[];
    /**
     * What dismissing says: Close by default; Run in Background while a streamed run works (it
     * carries on in a notification, and the window holds its size while it does); Cancel while
     * it asks (dismissing is the answer).
     */
    closeLabel?: 'Close' | 'Run in Background' | 'Cancel';
    /** A clean end that still has something to read (a warning, a note, what it changed). */
    holds?: boolean;
    onClose: () => void;
}

/** A button a streamed run offers: an answer, Retry, Open Debug Logs. */
export interface ProgressAction {
    label: string;
    onPress: () => void;
    variant: 'accent' | 'negative' | 'secondary';
}

/**
 * Host a run; present it when open.
 *
 * @param props - open state, the title, the wait or the rows, how it ended, its lines, the
 *   extra action and Close
 * @returns the dialog container
 */
export function ProgressDialog({
    isOpen,
    title,
    waiting = false,
    rows,
    status,
    children,
    action,
    stream,
    actions = [],
    closeLabel = 'Close',
    holds = false,
    onClose,
}: ProgressDialogProps): React.ReactElement {
    const lines = React.Children.toArray(children);
    const streamed = stream !== undefined;
    const ended = Boolean(status) && !waiting;
    const titleAlone = lines.length === 0 && !action && actions.length === 0 && !holds;
    useCloseWhenClean(isOpen && ended && titleAlone && status === 'success', onClose);
    const listed = Boolean(rows) || streamed;
    let footer: ProgressAction[] | undefined;
    if (streamed) footer = actions;
    else if (ended) footer = resultActionButtons(action);
    return (
        <DialogContainer onDismiss={onClose}>
            {isOpen && (
                <Modal
                    title={title}
                    status={ended ? status : undefined}
                    size={listed ? 'M' : 'S'}
                    fitContent
                    holdSize={streamed ? closeLabel === 'Run in Background' : listed && !ended}
                    waiting={listed ? false : waiting}
                    onClose={onClose}
                    closeLabel={closeLabel}
                    actionButtons={footer}
                >
                    {streamed ? stream : (
                    <div className="dialog-stack">
                        {rows && (
                            <ul className="work-row-list">
                                {rows.map((row) => (
                                    <li key={row.label}><WorkRow {...row} /></li>
                                ))}
                            </ul>
                        )}
                        {ended && lines.length > 0 && (
                            <div className="dialog-rows">
                                {lines.map((line, index) => (
                                    <p key={index} className="dialog-line">{line}</p>
                                ))}
                            </div>
                        )}
                    </div>
                    )}
                </Modal>
            )}
        </DialogContainer>
    );
}
