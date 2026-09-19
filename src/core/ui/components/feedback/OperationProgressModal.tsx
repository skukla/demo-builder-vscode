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
 * Its host must register `getOperationProgress`, `backgroundOperation` and
 * `openDebugLogs` in the screen's handler map; the first two are shared from
 * `core/vscode/operationProgress`.
 *
 * @module core/ui/components/feedback/OperationProgressModal
 */

import { DialogContainer } from '@adobe/react-spectrum';
import React, { useCallback, useEffect } from 'react';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { StatusDisplay } from '@/core/ui/components/feedback/StatusDisplay';
import { Modal } from '@/core/ui/components/ui/Modal';
import { useElapsedClock } from '@/core/ui/hooks/useElapsedClock';
import { useOperationProgress } from '@/core/ui/hooks/useOperationProgress';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { stageLine } from '@/core/utils/stageLine';

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
    // Restarts on every new stage, so the clock times the stage in progress and
    // not the whole run. It is the only thing that moves while a step waits on
    // Adobe (owner, 2026-09-19: "I wasn't happy with the frequency of updates").
    const elapsed = useElapsedClock(failed ? null : progress?.stage);

    useEffect(() => {
        if (progress?.state === 'succeeded') onClose();
    }, [progress?.state, onClose]);

    // Closing a RUNNING operation hands it to a progress notification, so the SC keeps
    // seeing where it is (owner, 2026-09-19: the modal just vanished). A failed one
    // has nothing left to narrate.
    const close = useCallback((): void => {
        if (operation && !failed) {
            webviewClient.postMessage('backgroundOperation', {
                id: operation.id,
                title: operation.title,
            });
        }
        onClose();
    }, [operation, failed, onClose]);

    return (
        <DialogContainer onDismiss={close}>
            {operation && (
                <Modal
                    fitContent
                    title={operation.title}
                    size="M"
                    onClose={close}
                    closeLabel={failed ? 'Close' : 'Run in background'}
                    actionButtons={
                        failed
                            ? [
                                  {
                                      label: 'Open Debug Logs',
                                      variant: 'secondary',
                                      onPress: () => webviewClient.postMessage('openDebugLogs', {}),
                                  },
                                  { label: 'Retry', variant: 'accent', onPress: onRetry },
                              ]
                            : []
                    }
                >
                    {/* One fixed height for every state, so the modal never resizes as
                        stages come and go or it turns into a failure. */}
                    <div className="modal-progress-body">
                        {failed ? (
                            <StatusDisplay
                                variant="error"
                                title={operation.failureTitle}
                                message={progress?.error}
                            />
                        ) : (
                            // Size L, as every other progress display here: M
                            // left-aligns and shrinks the text (ImportDatapackModal).
                            <LoadingDisplay
                                size="L"
                                message={progress?.stage ? stageLine(progress.stage, progress.position) : 'Starting'}
                                subMessage={progress?.step}
                                helperText={helperLine(progress?.expectation, elapsed)}
                            />
                        )}
                    </div>
                </Modal>
            )}
        </DialogContainer>
    );
}
