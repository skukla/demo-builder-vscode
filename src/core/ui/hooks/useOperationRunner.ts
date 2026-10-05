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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
     * The success view's title: "ERP integration redeployed".
     *
     * The modal used to close itself the moment an operation succeeded, so a run the
     * SC had watched for two minutes ended by vanishing — and the Data Installer's
     * import modal, which shows a green check, disagreed with every other one
     * (owner, 2026-09-20). It ends on this now, and they close it.
     */
    successTitle: string;
    /**
     * Which run this is. A new run of the same operation must start the modal
     * clean, not on the previous run's failure.
     */
    run: number;
    /** Reopened mid-run: ask where it is, since the pushes so far were missed. */
    resume: boolean;
}

/**
 * Whether a progress push shows the run has BEGUN — a step, or a question it
 * needs answered. Not a bare `running`: the handler wrapper sends one the moment
 * the request arrives, before any VS Code dialog, so opening on it put the modal
 * behind the very question the SC had not answered yet (2026-10-05, delete).
 */
function hasBegun(push: { stage?: string; prompt?: unknown }): boolean {
    return Boolean(push.stage || push.prompt);
}

/** A run that ended in a real failure, not one the SC declined. */
function endedInFailure(response: unknown): boolean {
    const answer = response as { success?: boolean; cancelled?: boolean } | undefined;
    return answer?.success === false && answer.cancelled !== true;
}

/** An operation as a caller starts one: the runner counts the runs. */
export type StartableOperation = Omit<ScreenOperation, 'run' | 'resume'>;

export interface OperationRunnerControls {
    /** The operation the modal shows, or `null` when it is closed. */
    open: ScreenOperation | null;
    /** Send the message and show the modal straight away. */
    start: (operation: StartableOperation) => void;
    /**
     * Send the message, and show the modal only once the run begins — its first
     * step or question, or a failure before either. For an
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
    /** Sent, and waiting for the run to begin before the modal opens. */
    const pending = useRef<StartableOperation | null>(null);

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
            pending.current = operation;
            // A request, not a push: its answer is how we learn that a run which
            // never began is over, and when a caller may refresh what changed.
            void webviewClient
                .request(operation.message, {
                    ...operation.payload,
                    id: operation.id,
                    progress: 'modal',
                })
                .then(
                    (response) => {
                        if (pending.current === operation) {
                            pending.current = null;
                            // Failed before its first step: still say why.
                            if (endedInFailure(response)) openModal(operation, true);
                        }
                        onSettled?.();
                    },
                    // A timeout is not an end: the SC may take longer than the
                    // request waits to answer VS Code's question, and the run
                    // still begins after it. Keep waiting for its first step.
                    () => onSettled?.(),
                );
        },
        [openModal],
    );

    // `resume: true`, because the push that opens the modal has already gone by:
    // the modal asks where the run is rather than showing "Starting" until the
    // next stage.
    useEffect(
        () =>
            webviewClient.onMessage('operationProgress', (data: unknown) => {
                const waiting = pending.current;
                const push = data as { id?: string; stage?: string; prompt?: unknown } | undefined;
                if (!waiting || push?.id !== waiting.id || !hasBegun(push)) return;
                pending.current = null;
                openModal(waiting, true);
            }),
        [openModal],
    );

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
