/**
 * ComponentOperationModal — what an integration operation is doing, while it does it
 * (PL-59).
 *
 * Opened by the grid for an operation the SC started there. It shows the tile's own
 * live status line at the top, so covering the grid never hides it; then the stage,
 * the step under it and how long the stage usually takes (the Storefront setup step's
 * `LoadingDisplay`, row for row). "Run in background" closes it and the work carries
 * on. A success closes it by itself. A failure stays: the reason, Retry, and the
 * Debug Logs where the full detail went.
 *
 * @module features/dashboard/ui/components/integrations/ComponentOperationModal
 */

import { DialogContainer, Text } from '@adobe/react-spectrum';
import React, { useEffect } from 'react';
import type { ComponentOperation } from '../../hooks/useComponentOperation';
import { useComponentOperationProgress } from '../../hooks/useComponentOperationProgress';
import type { IntegrationCardModel } from './integrationCardModel';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { IntegrationStatusLabel } from '@/core/ui/components/integrations/IntegrationStatusLabel';
import { Modal } from '@/core/ui/components/ui/Modal';
import { webviewClient } from '@/core/ui/utils/WebviewClient';

export interface ComponentOperationModalProps {
    /** The integration being worked on, or `null` when the modal is closed. */
    operation: Pick<ComponentOperation, 'id' | 'name' | 'run' | 'resume'> | null;
    /** The tile's live status, shown at the top of the modal. */
    status?: Pick<IntegrationCardModel, 'dotVariant' | 'status' | 'statusLabel'>;
    /** Run the same operation again. */
    onRetry: () => void;
    /** Close the modal; a running operation carries on. */
    onClose: () => void;
}

/** The progress modal for one integration operation. */
export function ComponentOperationModal({
    operation,
    status,
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

    return (
        <DialogContainer onDismiss={onClose}>
            {operation && (
                <Modal
                    fitContent
                    title={operation.name}
                    size="M"
                    onClose={onClose}
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
                    <div>
                        {status && (
                            <div className="integration-statusline">
                                <IntegrationStatusLabel model={status} />
                            </div>
                        )}
                        {failed ? (
                            <Text>{progress?.error}</Text>
                        ) : (
                            <LoadingDisplay
                                size="M"
                                message={progress?.stage ?? 'Starting'}
                                subMessage={progress?.step}
                                helperText={progress?.expectation}
                            />
                        )}
                    </div>
                </Modal>
            )}
        </DialogContainer>
    );
}
