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
    onClose: () => void;
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
    onClose,
}: ProgressDialogProps): React.ReactElement {
    const lines = React.Children.toArray(children);
    const ended = Boolean(status) && !waiting;
    const titleAlone = lines.length === 0 && !action;
    useCloseWhenClean(isOpen && ended && titleAlone && status === 'success', onClose);

    return (
        <DialogContainer onDismiss={onClose}>
            {isOpen && (
                <Modal
                    title={title}
                    status={ended ? status : undefined}
                    size={rows ? 'M' : 'S'}
                    fitContent
                    holdSize={Boolean(rows) && !ended}
                    waiting={rows ? false : waiting}
                    onClose={onClose}
                    actionButtons={ended ? resultActionButtons(action) : undefined}
                >
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
                </Modal>
            )}
        </DialogContainer>
    );
}
