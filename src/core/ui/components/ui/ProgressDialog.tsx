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
 * A run whose rows can each be asked a question (step-07 Win1: the projects batch run, the Updates
 * run) says so with `asksUnderRows`, and the layout opens it large; the question sits under its
 * row, and while one waits whose answers are every way on, Close is hidden (`hideClose`). `wide` is
 * the content-derived exception for names that cannot be broken. `ProgressWindow` is the window
 * alone, for a host that keeps its own dialog container.
 *
 * @module core/ui/components/ui/ProgressDialog
 */

import { DialogContainer } from '@adobe/react-spectrum';
import React from 'react';
import { WorkRow, type WorkRowProps } from '@/core/ui/components/feedback/WorkRow';
import { Modal, type ActionButton, type ModalStatus, type ModalWait } from '@/core/ui/components/ui/Modal';
import { resultActionButtons, type ResultAction } from '@/core/ui/components/ui/ResultDialog';
import { useFixedHeight } from '@/core/ui/components/ui/useFixedHeight';
import { useCloseWhenClean } from '@/core/ui/hooks/useCloseWhenClean';

/** One step of the run as a row; a question about that step is asked under it. */
type ProgressRow = WorkRowProps & {
    /** The question the run is paused on about this row, under its name (its answers are `actions`). */
    question?: React.ReactNode;
};

export interface ProgressDialogProps {
    isOpen: boolean;
    /** "Installing My Luma" while it runs; what happened once it ends. */
    title: string;
    /** What the run is doing (`WAIT_STAGES`), while it runs and shows no rows. */
    waiting?: ModalWait | false;
    /** The run's steps, one row each. Given from start to finish, so the size never changes. */
    rows?: ProgressRow[];
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
    actions?: ActionButton[];
    /**
     * What dismissing says: Close by default; Run in Background while a streamed run works (it
     * carries on in a notification, and the window holds its size while it does); Cancel while
     * it asks (dismissing is the answer).
     */
    closeLabel?: 'Close' | 'Run in Background' | 'Cancel';
    /**
     * Leave Close out while a row's question waits whose answers are every way on: dismissing
     * would only repeat one of them (the projects batch run and the Updates run, step-07 Win1).
     */
    hideClose?: boolean;
    /**
     * Each row can be asked a question under it, with the rest still in view (the projects batch
     * run, the Updates run): the window is large from the start, so the question has room.
     */
    asksUnderRows?: boolean;
    /** A list of names that cannot be broken (Delete's projects): wider than large. */
    wide?: boolean;
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

/** The size the layout chooses: small for a wait or a result, a list's size for rows. */
function sizeOf(listed: boolean, asksUnderRows: boolean): 'S' | 'M' | 'L' {
    if (!listed) return 'S';
    return asksUnderRows ? 'L' : 'M';
}

/** The rows, each with its question under it, then what is left to read once it ends. */
function RunBody({ rows, lines }: { rows?: ProgressRow[]; lines: React.ReactNode[] }): React.ReactElement {
    return (
        <div className="dialog-stack">
            {rows && (
                <ul className="work-row-list">
                    {rows.map(({ question, ...row }) => (
                        <li key={row.label}>
                            <WorkRow {...row}>
                                {row.children}
                                {question}
                            </WorkRow>
                        </li>
                    ))}
                </ul>
            )}
            {lines.length > 0 && (
                <div className="dialog-rows">
                    {lines.map((line, index) => (
                        <p key={index} className="dialog-line">{line}</p>
                    ))}
                </div>
            )}
        </div>
    );
}

/**
 * The run's window alone, for a host that already holds the dialog container and shows one window
 * at a time in it (the projects batch window, the Updates window: their questions and results are
 * windows of their own in the same container; `tests/sop/modal-hosting.test.ts`).
 *
 * @param props - the title, the wait or the rows or the run's own view, how it ended, its lines,
 *   the buttons and the way out
 * @returns the window
 */
export function ProgressWindow({
    title,
    waiting = false,
    rows,
    status,
    children,
    action,
    stream,
    actions = [],
    closeLabel = 'Close',
    hideClose = false,
    asksUnderRows = false,
    wide = false,
    holds = false,
    onClose,
}: Omit<ProgressDialogProps, 'isOpen'>): React.ReactElement {
    const lines = React.Children.toArray(children);
    const streamed = stream !== undefined;
    const ended = Boolean(status) && !waiting;
    const titleAlone = lines.length === 0 && !action && actions.length === 0 && !holds;
    useCloseWhenClean(ended && titleAlone && status === 'success', onClose);
    const listed = Boolean(rows) || streamed;
    let footer: ActionButton[] | undefined;
    if (streamed) footer = actions;
    else if (ended) footer = resultActionButtons(action);
    return (
        <ProgressFrame
            title={title}
            status={ended ? status : undefined}
            size={sizeOf(listed, asksUnderRows)}
            wide={listed && wide}
            streamed={streamed}
            holdSize={streamed ? closeLabel === 'Run in Background' : listed && !ended}
            waiting={listed ? false : waiting}
            onClose={onClose}
            closeLabel={closeLabel}
            hideClose={hideClose}
            actionButtons={footer}
        >
            {streamed ? stream : <RunBody rows={rows} lines={ended ? lines : []} />}
        </ProgressFrame>
    );
}

/**
 * Host a run; present it when open.
 *
 * @param props - open state, the title, the wait or the rows, how it ended, its lines, the
 *   extra action and Close
 * @returns the dialog container
 */
export function ProgressDialog({ isOpen, onClose, ...rest }: ProgressDialogProps): React.ReactElement {
    return (
        <DialogContainer onDismiss={onClose}>
            {isOpen && <ProgressWindow onClose={onClose} {...rest} />}
        </DialogContainer>
    );
}

interface ProgressFrameProps {
    title: string;
    status?: ModalStatus;
    size: 'S' | 'M' | 'L';
    wide: boolean;
    streamed: boolean;
    holdSize: boolean;
    waiting: ModalWait | false;
    onClose: () => void;
    closeLabel: string;
    hideClose: boolean;
    actionButtons?: ActionButton[];
    children: React.ReactNode;
}

/**
 * The window. A streamed run keeps the height it opens at to the end (owner, 2026-11-11): the
 * result that replaces the run is read in the same box, scrolling if it is longer, and the buttons
 * stay where they were. It was fitted to each state until then, so the box shrank as the run ended.
 */
function ProgressFrame({ streamed, holdSize, children, ...modal }: ProgressFrameProps): React.ReactElement {
    const { ref, locked } = useFixedHeight(streamed);
    return (
        <Modal {...modal} fitContent lockHeight={locked} measuring={streamed && !locked} holdSize={holdSize && !locked}>
            {streamed ? <div ref={ref}>{children}</div> : children}
        </Modal>
    );
}
