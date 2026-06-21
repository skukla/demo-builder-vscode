/**
 * DeployableRow Component (D2 Track B — Step 05)
 *
 * One row of the dashboard integrations list, keyed by a deployable `id`. Reuses
 * the shared 4-state pieces ({@link deployableStates}) but dispatches ID-SCOPED
 * messages so the handler bundle ({@link deployableHandlers}) drives the live D1
 * runner for THIS deployable:
 *   - not-deployed : Deploy   → deployDeployable   {id}
 *   - deploying    : spinner + message
 *   - deployed     : Redeploy → redeployDeployable {id}; Remove → removeDeployable {id};
 *                    Verify (StatusCard.action, on-demand) → verifyDeployable {id}
 *   - error        : Retry    → deployDeployable   {id}
 *
 * @module features/dashboard/ui/components/DeployableRow
 */

import { View, Flex, Button } from '@adobe/react-spectrum';
import React from 'react';
import { DeployingState, DeployedState, ErrorState } from './deployableStates';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { IdentifiedDeployable } from '@/features/app-builder/services/deployableState';

export interface DeployableRowProps {
    /** The deployable to render (id + persisted state). */
    deployable: IdentifiedDeployable;
    /** Live deploy progress (deploying) or failure detail (error). */
    message?: string;
    /**
     * Remove intent handler. The row never tears down on its own — the
     * destructive confirm guard lives in the list, so Remove bubbles up here
     * (the list opens {@link DeployableRemoveDialog}). Required in practice; the
     * list always supplies it.
     */
    onRemove: () => void;
}

/** A persisted `stale` status renders as deployed (still up; just drift-flagged). */
function isDeployedView(status: string): boolean {
    return status === 'deployed' || status === 'stale';
}

/**
 * Per-deployable row. The label is the deployable id (the handler resolves the
 * catalog name; the row stays presentational + id-dispatching). The persisted
 * `status` widens to a string here so the live `deployableStatusUpdate`
 * 'deploying' transition (not part of the persisted union) renders too.
 */
export function DeployableRow({ deployable, message, onRemove }: DeployableRowProps) {
    const { id } = deployable;
    const status: string = deployable.status;

    return (
        <View>
            {status === 'deploying' && <DeployingState message={message} />}
            {isDeployedView(status) && (
                <DeployedState
                    view={{ label: id, url: deployable.url, deployedUrls: deployable.deployedUrls }}
                    onRedeploy={() => webviewClient.postMessage('redeployDeployable', { id })}
                    onRemove={onRemove}
                    verifyAction={{
                        label: 'Verify',
                        onPress: () => webviewClient.postMessage('verifyDeployable', { id }),
                        testId: `deployable-verify-${id}`,
                    }}
                />
            )}
            {status === 'error' && (
                <ErrorState
                    label={id}
                    message={message}
                    onRetry={() => webviewClient.postMessage('deployDeployable', { id })}
                />
            )}
            {status === 'not-deployed' && (
                <Flex>
                    <Button
                        variant="primary"
                        onPress={() => webviewClient.postMessage('deployDeployable', { id })}
                    >
                        Deploy
                    </Button>
                </Flex>
            )}
        </View>
    );
}
