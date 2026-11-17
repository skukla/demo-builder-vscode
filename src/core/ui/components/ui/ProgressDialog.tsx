/**
 * The Progress layout: a run, then how it ended, in one window that never changes size
 * (`docs/development/sop/dialog-design.md`). Small from start to finish; the size of a list
 * when it shows its steps as rows. While it runs it shows the wait, or the rows, and Close;
 * once it ends the title names the thing and the body is the shared `ResultBody`: the large mark
 * where the spinner was, the outcome under it, then the lines left to read and the rows (owner,
 * 2026-11-17, walk F222). A streamed run draws its own ending in its stream (`OperationProgressBody`
 * does it with the same `ResultBody`), so for it `status` is only a question's icon in the title.
 *
 * Every end waits for Close, a clean one included (owner, 2026-11-17, walk F195). The
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
import { ResultBody } from '@/core/ui/components/feedback/ResultBody';
import { WorkRow, type WorkRowProps } from '@/core/ui/components/feedback/WorkRow';
import { Modal, type ActionButton, type ModalStatus, type ModalWait } from '@/core/ui/components/ui/Modal';
import { resultActionButtons, type ResultAction } from '@/core/ui/components/ui/ResultDialog';
import { useFixedHeight } from '@/core/ui/components/ui/useFixedHeight';

/** One step of the run as a row; a question about that step is asked under it. */
type ProgressRow = WorkRowProps & {
    /** The question the run is paused on about this row, under its name (its answers are `actions`). */
    question?: React.ReactNode;
};

export interface ProgressDialogProps {
    isOpen: boolean;
    /** "Installing My Luma" while it runs; the thing it was about once it ends: "My Luma". */
    title: string;
    /** What the run is doing (`WAIT_STAGES`), while it runs and shows no rows. */
    waiting?: ModalWait | false;
    /** The run's steps, one row each. Given from start to finish, so the size never changes. */
    rows?: ProgressRow[];
    /**
     * How it ended, the mark in the body; absent while it runs. For a streamed run, which draws its
     * own ending, a question's icon in the title instead.
     */
    status?: ModalStatus;
    /** What happened, under the mark once it ends: "Installed", "Couldn't Install". */
    outcome?: string;
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
     * carries on in a notification, and the window holds its size while it does); while it asks,
     * the question's dismiss answer, or Cancel (`promptCloseLabel`: dismissing is the answer).
     */
    closeLabel?: string;
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

/** The rows, each with its question under it. */
function RowList({ rows }: { rows: ProgressRow[] }): React.ReactElement {
    return (
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
    );
}

/** How a run that is not streamed ended: the mark, the outcome and the lines to read. */
interface RunEnding {
    status: ModalStatus;
    outcome: string;
    lines: React.ReactNode[];
}

/** While it runs: the rows. Once it ends: the outcome under its mark, the lines, then the rows. */
function RunBody({ rows, ending }: { rows?: ProgressRow[]; ending?: RunEnding }): React.ReactElement {
    if (ending) {
        return (
            <ResultBody status={ending.status} outcome={ending.outcome} lines={ending.lines}>
                {rows ? <RowList rows={rows} /> : null}
            </ResultBody>
        );
    }
    return <div className="dialog-stack">{rows && <RowList rows={rows} />}</div>;
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
    outcome,
    children,
    action,
    stream,
    actions = [],
    closeLabel = 'Close',
    hideClose = false,
    asksUnderRows = false,
    wide = false,
    onClose,
}: Omit<ProgressDialogProps, 'isOpen'>): React.ReactElement {
    const lines = React.Children.toArray(children);
    const streamed = stream !== undefined;
    const ended = !streamed && status !== undefined && !waiting;
    const listed = Boolean(rows) || streamed;
    let footer: ActionButton[] | undefined;
    if (streamed) footer = actions;
    else if (ended) footer = resultActionButtons(action);
    let ending: RunEnding | undefined;
    if (ended) ending = { status, outcome: outcome ?? title, lines };
    return (
        <ProgressFrame
            title={title}
            status={streamed ? status : undefined}
            size={sizeOf(listed, asksUnderRows)}
            wide={listed && wide}
            streamed={streamed}
            // The run's box holds for its result: a window never shrinks from its run to its end.
            holdSize={streamed ? closeLabel === 'Run in Background' : listed}
            waiting={listed ? false : waiting}
            onClose={onClose}
            closeLabel={closeLabel}
            hideClose={hideClose}
            actionButtons={footer}
        >
            {streamed ? stream : <RunBody rows={rows} {...(ending ? { ending } : {})} />}
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
