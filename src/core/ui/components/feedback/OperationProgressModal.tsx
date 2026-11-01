/**
 * OperationProgressModal — what a long operation is doing, while it does it (PL-59).
 *
 * THE progress modal for any operation an SC starts with a button on a screen (rule R1
 * of `.rptc/plans/operation-progress/extension-wide.md`); a screen hosts this rather
 * than building its own. Titled "-ing verb + object". It shows the stage, the step
 * under it and how long the stage usually takes (the Storefront setup step's
 * `LoadingDisplay`, row for row), in one fixed height. While the operation runs it
 * ALWAYS offers "Run in background" (R8), which hands it to a VS Code progress
 * notification that keeps narrating it. A success closes it by itself, unless it carries a
 * warning (the SC must act), a note (the SC need only know; shown as a plain success) or a
 * next step, which wait to be read. A failure
 * stays: the reason, Retry, and the Debug Logs where the full detail went.
 *
 * Its body fits each state and eases between them (`layout/SteadyHeight`), and its title is
 * the outcome or the question once there is one (`progressFrame`), by the dialog design
 * rules (owner, 2026-10-31). It was one fixed height so it never changed size (owner,
 * 2026-09-19); a fitted height that eases, under a dialog pinned near the top, keeps it
 * from jumping without the dead space.
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
import React, { useCallback, useEffect, useRef } from 'react';
import { OperationProgressBody, progressFrame } from '@/core/ui/components/feedback/OperationProgressBody';
import { SteadyHeight } from '@/core/ui/components/layout/SteadyHeight';
import { Modal, type ActionButton } from '@/core/ui/components/ui/Modal';
import { useOperationProgress } from '@/core/ui/hooks/useOperationProgress';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { OperationOffer, OperationProgressPayload } from '@/types/webviewPayloads';

/** A success that says something beyond its title (a warning, a note, what it changed) waits to be read. */
function holdsResult(progress: OperationProgressPayload | null | undefined): boolean {
    return Boolean(progress?.warning || progress?.note || progress?.details?.length || progress?.changes?.length);
}

/** The operation a progress modal shows: which one, and what it is called. */
export interface ProgressModalOperation {
    /** What the operation's progress is keyed by. */
    id: string;
    /** "-ing verb + object": the modal's title, and the notification's on handover. */
    title: string;
    /**
     * What it acts on, as its own line under a short title rather than inside a long
     * one that wraps (release test, 2026-10-28). The notification joins the two.
     */
    subject?: string;
    /** The failure view's title: "Couldn't redeploy ERP integration". */
    failureTitle: string;
    /** The success view's title: "ERP integration redeployed". */
    successTitle: string;
    /** Which run this is; a new run starts the modal clean. */
    run: number;
    /** Reopened mid-run: ask where it is now, since earlier pushes were missed. */
    resume: boolean;
}

/** What to do next once the operation succeeds, offered on its success view. */
export interface ProgressModalNextStep {
    /**
     * One sentence under the success title, when the button alone does not say enough:
     * "Test ERP owns no products yet." None when the button says it all.
     */
    message?: string;
    /** The button that does it: "Open demo setup". */
    action: string;
    /** Runs after the modal closes. */
    onPress: () => void;
}

export interface OperationProgressModalProps {
    /** The operation being run, or `null` when the modal is closed. */
    operation: ProgressModalOperation | null;
    /** Run the same operation again. */
    onRetry: () => void;
    /** Close the modal; a running operation carries on. */
    onClose: () => void;
    /**
     * A next step to offer when the operation succeeds. With one, the success view says
     * what is left and waits for the SC instead of closing by itself.
     */
    next?: ProgressModalNextStep;
    /**
     * Turns a next step the RUN offered (`OperationProgressPayload.offer`, AB-74) into a
     * button. `next` wins when both are there: it is the screen's own.
     */
    offerStep?: (offer: OperationOffer) => ProgressModalNextStep | undefined;
}

const CANCEL = 'Cancel';

/**
 * The dismiss label. A question cannot be put in the background — nothing would be
 * left to answer it — so dismissing it IS the answer, and it says Cancel. An
 * operation that has ENDED, either way, has nothing left to narrate.
 */
function closeLabelFor(ended: boolean, asking: boolean): string {
    if (asking) return CANCEL;
    return ended ? 'Close' : 'Run in background';
}

/**
 * The answers, as the guard gave them: the one that continues the work is first. A
 * "Cancel" among them is left out: the dismiss button already says Cancel and answers
 * the same way, as nothing chosen (two Cancels side by side, 2026-10-23).
 */
function answerButtons(actions: string[], answer: (chosen: string) => void): ActionButton[] {
    return actions.filter((label) => label !== CANCEL).map((label, index) => ({
        label,
        variant: index === 0 ? 'accent' : 'secondary',
        onPress: () => answer(label),
    }));
}

/** A success's next step, as its one button: the modal closes, then the step starts. */
function nextStepButtons(next: ProgressModalNextStep | undefined, onClose: () => void): ActionButton[] {
    if (!next) return [];
    return [{ label: next.action, variant: 'accent', onPress: () => { onClose(); next.onPress(); } }];
}

/** The success view's next step: the screen's own, else the one the run offered (AB-74). */
function nextStepOf(
    progress: OperationProgressPayload | null | undefined,
    next: ProgressModalNextStep | undefined,
    offerStep: OperationProgressModalProps['offerStep'],
): ProgressModalNextStep | undefined {
    if (next) return next;
    return progress?.offer && offerStep ? offerStep(progress.offer) : undefined;
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

/** The progress modal for one operation. */
export function OperationProgressModal({
    operation,
    onRetry,
    onClose,
    next,
    offerStep,
}: OperationProgressModalProps): React.ReactElement {
    const progress = useOperationProgress(
        operation?.id ?? null,
        operation?.run ?? 0,
        operation?.resume ?? false,
    );
    const failed = progress?.state === 'failed';
    const succeeded = progress?.state === 'succeeded';
    // A question the work is paused on — a sign-in that expired, a prerequisite that
    // is missing, a merge that needs a decision. It takes the modal over, because the
    // modal is where the SC is looking, and a notification beside it asks twice
    // (owner, 2026-09-20: republishing Bodea showed both at once).
    const prompt = failed || succeeded ? undefined : progress?.prompt;

    // What the SC has typed into the question's fields, if it has any. A ref, not
    // state: every keystroke would otherwise re-render the modal around the field
    // being typed into, and nothing here renders from it — the buttons just send it.
    const typed = useRef<Record<string, string>>({});
    const onTyped = useCallback((values: Record<string, string>): void => {
        typed.current = values;
    }, []);

    /** Hand an answer back to the work waiting on it, with anything typed. */
    const answer = useCallback(
        (chosen?: string): void => {
            if (operation) {
                webviewClient.postMessage('answerOperationPrompt', {
                    id: operation.id,
                    answer: chosen,
                    values: typed.current,
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
    // Show the result, then get out of the way (owner, 2026-09-20). Only a success:
    // a failure has a reason to read and a Retry to press, so it waits to be closed.
    //
    // Not the timed toast this repo removed three of on the same day — that was a
    // message that dismissed itself before anyone had read it, and was the ONLY
    // confirmation there was. This modal has been on screen for the whole run, and
    // the checkmark is its last beat.
    // A next step waits for the SC: closing by itself would take the offer away unread.
    // So does a warning (AB-26z): a fill whose prices were not published ended on a
    // green tick, and the reason reached only the Debug Logs. So does a note, which is
    // a sentence to read, not a warning to act on: the tick stays green.
    const offering = succeeded ? nextStepOf(progress, next, offerStep) : undefined;
    const warning = succeeded ? progress?.warning : undefined;
    const note = succeeded ? progress?.note : undefined;
    // So does a list of what the run changed (2026-10-22): it is the result, to be read.
    const held = holdsResult(progress);
    useEffect(() => {
        if (!succeeded || offering || held) return undefined;
        const timer = setTimeout(onClose, TIMEOUTS.UI.RESULT_GLANCE);
        return () => clearTimeout(timer);
    }, [succeeded, offering, held, onClose]);

    const close = useCallback((): void => {
        if (prompt) {
            answer(undefined);
        } else if (operation && !failed && !succeeded) {
            webviewClient.postMessage('backgroundOperation', {
                id: operation.id,
                title: operation.subject ? `${operation.title}: ${operation.subject}` : operation.title,
            });
        }
        onClose();
    }, [operation, failed, succeeded, prompt, answer, onClose]);

    // Nothing mounted while closed, not an empty DialogContainer: a screen hosts
    // this beside its own dialogs, and a container with no child still occupies
    // the dialog slot (two dismiss targets on the dashboard, 2026-09-19).
    if (!operation) return <></>;
    const frame = progressFrame({
        title: operation.title,
        successTitle: operation.successTitle,
        failureTitle: operation.failureTitle,
        prompt,
        failed,
        succeeded,
        warned: Boolean(warning),
    });

    return (
        <DialogContainer onDismiss={close}>
            <Modal
                fitContent
                title={frame.title}
                status={frame.status}
                size="M"
                onClose={close}
                closeLabel={closeLabelFor(failed || succeeded, Boolean(prompt))}
                actionButtons={
                    prompt
                        ? answerButtons(prompt.actions, answer)
                        : [...failureButtons(failed, onRetry), ...nextStepButtons(offering, onClose)]
                }
            >
                {operation.subject && <div className="modal-progress-subject">{operation.subject}</div>}
                {/* Fits each state and eases between them (dialog design rules, 2026-10-31). It was
                    one fixed height for every state, which left a one-line result in a box sized
                    for a three-line failure. */}
                <SteadyHeight>
                    <OperationProgressBody
                        prompt={prompt}
                        failed={failed}
                        succeeded={succeeded}
                        successMessage={
                            [warning, note, offering?.message].filter(Boolean).join(' ') || undefined
                        }
                        progress={progress}
                        onTyped={onTyped}
                    />
                </SteadyHeight>
            </Modal>
        </DialogContainer>
    );
}
