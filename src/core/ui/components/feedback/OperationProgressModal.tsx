/**
 * OperationProgressModal — what a long operation is doing, while it does it (PL-59).
 *
 * THE progress modal for any operation an SC starts with a button on a screen (rule R1
 * of `.rptc/plans/operation-progress/extension-wide.md`); a screen hosts this rather
 * than building its own. Titled "-ing verb + object". It shows the stage, the step
 * under it and how long the stage usually takes (the Storefront setup step's
 * `LoadingDisplay`, row for row), in one fixed height. While the operation runs it
 * ALWAYS offers "Run in background" (R8), which hands it to a VS Code progress
 * notification that keeps narrating it. A success closes it by itself. A failure
 * stays: the reason, Retry, and the Debug Logs where the full detail went.
 *
 * Not `layout/CenteredFeedbackContainer`: that RESERVES a minimum height and lets
 * taller content grow, and this modal must never change size (owner, 2026-09-19) —
 * so its body is one fixed height that scrolls instead (`.modal-progress-body`).
 *
 * It also carries a QUESTION the work is paused on — an expired sign-in, a missing
 * prerequisite, a merge needing a decision — because a notification asking that
 * beside a modal waiting on it asks twice (owner, 2026-09-20). While it waits, the
 * dismiss affordance says Cancel: backgrounding a question would leave the work with
 * nothing left to answer it.
 *
 * Its host must register `getOperationProgress`, `backgroundOperation`,
 * `answerOperationPrompt` and `openDebugLogs` in the screen's handler map; the first
 * two are shared from `core/vscode/operationProgress`, the third from
 * `core/vscode/operationPrompt`.
 *
 * @module core/ui/components/feedback/OperationProgressModal
 */

import { DialogContainer } from '@adobe/react-spectrum';
import React, { useCallback, useEffect } from 'react';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { StatusDisplay } from '@/core/ui/components/feedback/StatusDisplay';
import { Modal, type ActionButton } from '@/core/ui/components/ui/Modal';
import { useElapsedClock } from '@/core/ui/hooks/useElapsedClock';
import { useOperationProgress } from '@/core/ui/hooks/useOperationProgress';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { stageLine } from '@/core/utils/stageLine';
import type { OperationPrompt, OperationProgressPayload } from '@/types/webviewPayloads';

/** The operation a progress modal shows: which one, and what it is called. */
export interface ProgressModalOperation {
    /** What the operation's progress is keyed by. */
    id: string;
    /** "-ing verb + object": the modal's title, and the notification's on handover. */
    title: string;
    /** The failure view's title: "Couldn't redeploy ERP integration". */
    failureTitle: string;
    /** Which run this is; a new run starts the modal clean. */
    run: number;
    /** Reopened mid-run: ask where it is now, since earlier pushes were missed. */
    resume: boolean;
}

export interface OperationProgressModalProps {
    /** The operation being run, or `null` when the modal is closed. */
    operation: ProgressModalOperation | null;
    /** Run the same operation again. */
    onRetry: () => void;
    /** Close the modal; a running operation carries on. */
    onClose: () => void;
}

/**
 * Row 3: what to expect, and how long this stage has actually been running.
 * Never empty — the row holds its height whether or not either is known, so the
 * modal does not resize as stages come and go.
 */
function helperLine(expectation?: string, elapsed?: string): string {
    const parts = [expectation, elapsed].filter(Boolean);
    return parts.length > 0 ? parts.join(' · ') : '\u00A0';
}

/**
 * The dismiss label. A question cannot be put in the background — nothing would be
 * left to answer it — so dismissing it IS the answer, and it says Cancel.
 */
function closeLabelFor(failed: boolean, asking: boolean): string {
    if (asking) return 'Cancel';
    return failed ? 'Close' : 'Run in background';
}

/** The answers, as the guard gave them: the one that continues the work is first. */
function answerButtons(actions: string[], answer: (chosen: string) => void): ActionButton[] {
    return actions.map((label, index) => ({
        label,
        variant: index === 0 ? 'accent' : 'secondary',
        onPress: () => answer(label),
    }));
}

/** What a failure offers: the detail it wrote to the logs, and another go. */
function failureButtons(failed: boolean, onRetry: () => void): ActionButton[] {
    if (!failed) return [];
    return [
        {
            label: 'Open Debug Logs',
            variant: 'secondary',
            onPress: () => webviewClient.postMessage('openDebugLogs', {}),
        },
        { label: 'Retry', variant: 'accent', onPress: onRetry },
    ];
}

interface ProgressBodyProps {
    prompt?: OperationPrompt;
    failed: boolean;
    failureTitle: string;
    progress?: OperationProgressPayload | null;
    elapsed?: string;
}

/** The one row that changes: a question, a failure, or where the work has got to. */
function ProgressBody({
    prompt,
    failed,
    failureTitle,
    progress,
    elapsed,
}: ProgressBodyProps): React.ReactElement {
    if (prompt) {
        return <StatusDisplay variant="warning" title="Waiting for you" message={prompt.message} />;
    }
    if (failed) {
        return <StatusDisplay variant="error" title={failureTitle} message={progress?.error} />;
    }
    // Size L, as every other progress display here: M left-aligns and shrinks
    // the text (ImportDatapackModal).
    return (
        <LoadingDisplay
            size="L"
            message={progress?.stage ? stageLine(progress.stage, progress.position) : 'Starting'}
            subMessage={progress?.step}
            helperText={helperLine(progress?.expectation, elapsed)}
        />
    );
}

/** The progress modal for one operation. */
export function OperationProgressModal({
    operation,
    onRetry,
    onClose,
}: OperationProgressModalProps): React.ReactElement {
    const progress = useOperationProgress(
        operation?.id ?? null,
        operation?.run ?? 0,
        operation?.resume ?? false,
    );
    const failed = progress?.state === 'failed';
    // A question the work is paused on — a sign-in that expired, a prerequisite that
    // is missing, a merge that needs a decision. It takes the modal over, because the
    // modal is where the SC is looking, and a notification beside it asks twice
    // (owner, 2026-09-20: republishing Bodea showed both at once).
    const prompt = failed ? undefined : progress?.prompt;
    // Restarts on every new stage, so the clock times the stage in progress and
    // not the whole run. It is the only thing that moves while a step waits on
    // Adobe (owner, 2026-09-19: "I wasn't happy with the frequency of updates").
    const elapsed = useElapsedClock(failed ? null : progress?.stage);

    useEffect(() => {
        if (progress?.state === 'succeeded') onClose();
    }, [progress?.state, onClose]);

    /** Hand an answer back to the work waiting on it. */
    const answer = useCallback(
        (chosen?: string): void => {
            if (operation) {
                webviewClient.postMessage('answerOperationPrompt', {
                    id: operation.id,
                    answer: chosen,
                });
            }
        },
        [operation],
    );

    // Closing a RUNNING operation hands it to a progress notification, so the SC keeps
    // seeing where it is (owner, 2026-09-19: the modal just vanished). A failed one
    // has nothing left to narrate. A question is the third case: backgrounding it
    // would leave the work waiting on an answer with nothing left to answer it, so
    // dismissing IS the answer, and the guard reads it as cancelled.
    const close = useCallback((): void => {
        if (prompt) {
            answer(undefined);
        } else if (operation && !failed) {
            webviewClient.postMessage('backgroundOperation', {
                id: operation.id,
                title: operation.title,
            });
        }
        onClose();
    }, [operation, failed, prompt, answer, onClose]);

    // Nothing mounted while closed, not an empty DialogContainer: a screen hosts
    // this beside its own dialogs, and a container with no child still occupies
    // the dialog slot (two dismiss targets on the dashboard, 2026-09-19).
    if (!operation) return <></>;

    return (
        <DialogContainer onDismiss={close}>
            <Modal
                fitContent
                title={operation.title}
                size="M"
                onClose={close}
                closeLabel={closeLabelFor(failed, Boolean(prompt))}
                actionButtons={
                    prompt
                        ? answerButtons(prompt.actions, answer)
                        : failureButtons(failed, onRetry)
                }
            >
                {/* One fixed height for every state, so the modal never resizes as
                        stages come and go or it turns into a failure. */}
                <div className="modal-progress-body">
                    <ProgressBody
                        prompt={prompt}
                        failed={failed}
                        failureTitle={operation.failureTitle}
                        progress={progress}
                        elapsed={elapsed}
                    />
                </div>
            </Modal>
        </DialogContainer>
    );
}
