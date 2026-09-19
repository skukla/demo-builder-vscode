/**
 * ComponentOperationModal — what an integration operation is doing, while it does it
 * (PL-59).
 *
 * Opened for an operation the SC started on the integrations screen, titled with the
 * action and the integration. It shows the stage, the step under it and how long the
 * stage usually takes (the Storefront setup step's `LoadingDisplay`, row for row), in
 * one fixed height. "Run in background" hands the operation to a VS Code progress
 * notification that keeps narrating it. A success closes it by itself. A failure
 * stays: the reason, Retry, and the Debug Logs where the full detail went.
 *
 * @module features/dashboard/ui/components/integrations/ComponentOperationModal
 */

import { DialogContainer } from '@adobe/react-spectrum';
import React, { useCallback, useEffect } from 'react';
import type { ComponentOperation } from '../../hooks/useComponentOperation';
import { useComponentOperationProgress } from '../../hooks/useComponentOperationProgress';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { StatusDisplay } from '@/core/ui/components/feedback/StatusDisplay';
import { Modal } from '@/core/ui/components/ui/Modal';
import { webviewClient } from '@/core/ui/utils/WebviewClient';

export interface ComponentOperationModalProps {
    /** The operation being run, or `null` when the modal is closed. */
    operation: Pick<ComponentOperation, 'id' | 'title' | 'failureTitle' | 'run' | 'resume'> | null;
    /** Run the same operation again. */
    onRetry: () => void;
    /** Close the modal; a running operation carries on. */
    onClose: () => void;
}

/** The progress modal for one integration operation. */
export function ComponentOperationModal({
    operation,
    onRetry,
    onClose,
}: ComponentOperationModalProps): React.ReactElement {
    const progress = useComponentOperationProgress(
        operation?.id ?? null,
        operation?.run ?? 0,
        operation?.resume ?? false,
    );
    const failed = progress?.state === 'failed';

    useEffect(() => {
        if (progress?.state === 'succeeded') onClose();
    }, [progress?.state, onClose]);

    // Closing a RUNNING operation hands it to a progress notification, so the SC keeps
    // seeing where it is (owner, 2026-09-19: the modal just vanished). A failed one
    // has nothing left to narrate.
    const close = useCallback((): void => {
        if (operation && !failed) {
            webviewClient.postMessage('backgroundComponentOperation', {
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
                    <div className="integrations-operation-body">
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
                                message={progress?.stage ?? 'Starting'}
                                subMessage={progress?.step}
                                helperText={progress?.expectation ?? '\u00A0'}
                            />
                        )}
                    </div>
                </Modal>
            )}
        </DialogContainer>
    );
}
