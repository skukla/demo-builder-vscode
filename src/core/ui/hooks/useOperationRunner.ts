/**
 * useOperationRunner — the operation a screen's progress modal is showing (PL-59).
 *
 * One screen, one modal, any number of operations over a session: this holds which
 * one is on screen, starts the next, reopens the running one, and runs it again on
 * Retry. Every screen that hosts `OperationProgressModal` uses it — the
 * integrations screen, the dashboard and the projects list — which is why it lives
 * in `core/ui` rather than in the feature where it started.
 *
 * What it deliberately does NOT know: what any particular operation is called or
 * which message starts it. An integration's verbs live with the integrations
 * screen (`features/dashboard/ui/hooks/useComponentOperation`); a reset names
 * itself at the call site. Keeping those out is what lets the projects list use
 * this without importing the dashboard feature — a cross-feature import that also
 * dragged the dashboard's status channel into a bundle that answers none of it
 * (caught by the panel-coverage scan, 2026-09-19).
 *
 * @module core/ui/hooks/useOperationRunner
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { webviewClient } from '@/core/ui/utils/WebviewClient';

/** One operation, as the modal and the runner know it. */
export interface ScreenOperation {
    /** What its progress is keyed by, on both sides (`core/utils/operationIds`). */
    id: string;
    /** What the operation acts on, for a caller that needs it back. */
    name: string;
    /** The message that starts it, re-sent on Retry. */
    message: string;
    /**
     * What else that message carries — the projects list names WHICH project it
     * is resetting. Held here because Retry re-sends the same message.
     */
    payload?: Record<string, unknown>;
    /** The modal's title, and the notification's when it runs in the background. */
    title: string;
    /** The failure view's title: "Couldn't redeploy ERP integration". */
    failureTitle: string;
    /**
     * Which run this is. A new run of the same operation must start the modal
     * clean, not on the previous run's failure.
     */
    run: number;
    /** Reopened mid-run: ask where it is, since the pushes so far were missed. */
    resume: boolean;
}

/** An operation as a caller starts one: the runner counts the runs. */
export type StartableOperation = Omit<ScreenOperation, 'run' | 'resume'>;

export interface OperationRunnerControls {
    /** The operation the modal shows, or `null` when it is closed. */
    open: ScreenOperation | null;
    /** Send the message and show the modal straight away. */
    start: (operation: StartableOperation) => void;
    /**
     * Send the message, and show the modal only once the run reports. For an
     * operation whose first seconds belong to VS Code's own dialogs — a reset
     * confirms, then may ask about sample data — where opening on the click would
     * put a spinner behind a question. `onSettled` fires when the message
     * answers, which is also how a run that never started (the SC said no) stops
     * being waited for.
     */
    startWhenItBegins: (operation: StartableOperation, onSettled?: () => void) => void;
    /** Show the modal for an operation something else has already started. */
    show: (operation: StartableOperation) => void;
    /** Reopen the modal for the operation last started here. `false` for any other id. */
    reopen: (id: string) => boolean;
    /** Run the last operation again. */
    retry: () => void;
    /** Close the modal; the operation carries on. */
    close: () => void;
}

/** The screen's one set of operation controls. */
export function useOperationRunner(): OperationRunnerControls {
    const [last, setLast] = useState<ScreenOperation | null>(null);
    const [isOpen, setIsOpen] = useState(false);
    /** Sent, and waiting for the run to report before the modal opens. */
    const [pending, setPending] = useState<StartableOperation | null>(null);

    const openModal = useCallback((operation: StartableOperation, resume: boolean): void => {
        setLast((previous) => ({ ...operation, run: (previous?.run ?? 0) + 1, resume }));
        setIsOpen(true);
    }, []);

    const send = useCallback((operation: StartableOperation): void => {
        webviewClient.postMessage(operation.message, {
            ...operation.payload,
            id: operation.id,
            progress: 'modal',
        });
    }, []);

    const start = useCallback(
        (operation: StartableOperation): void => {
            send(operation);
            openModal(operation, false);
        },
        [send, openModal],
    );

    const show = useCallback(
        (operation: StartableOperation): void => openModal(operation, false),
        [openModal],
    );

    const startWhenItBegins = useCallback(
        (operation: StartableOperation, onSettled?: () => void): void => {
            setPending(operation);
            // A request, not a push: its answer is how we learn that a run which
            // never reported is over, and when a caller may refresh what changed.
            void webviewClient
                .request(operation.message, {
                    ...operation.payload,
                    id: operation.id,
                    progress: 'modal',
                })
                .catch(() => undefined)
                .then(() => {
                    setPending(null);
                    onSettled?.();
                });
        },
        [],
    );

    // `resume: true`, because the push that opens the modal has already gone by:
    // the modal asks where the run is rather than showing "Starting" until the
    // next stage.
    useEffect(() => {
        if (!pending) return undefined;
        return webviewClient.onMessage('operationProgress', (data: unknown) => {
            const payload = data as { id?: string } | undefined;
            if (payload?.id !== pending.id) return;
            openModal(pending, true);
            setPending(null);
        });
    }, [pending, openModal]);

    const reopen = useCallback(
        (id: string): boolean => {
            if (last?.id !== id) return false;
            setLast({ ...last, resume: true });
            setIsOpen(true);
            return true;
        },
        [last],
    );

    const retry = useCallback((): void => {
        if (last) start(last);
    }, [last, start]);

    const close = useCallback((): void => setIsOpen(false), []);

    return useMemo(
        () => ({
            open: isOpen ? last : null,
            start,
            startWhenItBegins,
            show,
            reopen,
            retry,
            close,
        }),
        [isOpen, last, start, startWhenItBegins, show, reopen, retry, close],
    );
}
