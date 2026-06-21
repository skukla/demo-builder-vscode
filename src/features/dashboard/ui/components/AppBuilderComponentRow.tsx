/**
 * AppBuilderComponentRow Component (D2 Track B — Step 05)
 *
 * One row of the dashboard integrations list, keyed by an App Builder component `id`. Reuses
 * the shared 4-state pieces ({@link appBuilderComponentStates}) but dispatches ID-SCOPED
 * messages so the handler bundle ({@link appBuilderComponentHandlers}) drives the live D1
 * runner for THIS appBuilderComponent:
 *   - not-deployed : Deploy   → deployAppBuilderComponent   {id}
 *   - deploying    : spinner + message
 *   - deployed     : Redeploy → redeployAppBuilderComponent {id}; Remove → removeAppBuilderComponent {id};
 *                    Verify (StatusCard.action, on-demand) → verifyAppBuilderComponent {id}
 *   - error        : Retry    → deployAppBuilderComponent   {id}
 *
 * @module features/dashboard/ui/components/AppBuilderComponentRow
 */

import { View, Flex, Button } from '@adobe/react-spectrum';
import React from 'react';
import { DeployingState, DeployedState, ErrorState } from './appBuilderComponentStates';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { IdentifiedAppBuilderComponent } from '@/features/app-builder/services/appBuilderComponentState';

export interface AppBuilderComponentRowProps {
    /** The appBuilderComponent to render (id + persisted state). */
    appBuilderComponent: IdentifiedAppBuilderComponent;
    /** Live deploy progress (deploying) or failure detail (error). */
    message?: string;
    /**
     * Remove intent handler. The row never tears down on its own — the
     * destructive confirm guard lives in the list, so Remove bubbles up here
     * (the list opens {@link AppBuilderComponentRemoveDialog}). Required in practice; the
     * list always supplies it.
     */
    onRemove: () => void;
}

/** A persisted `stale` status renders as deployed (still up; just drift-flagged). */
function isDeployedView(status: string): boolean {
    return status === 'deployed' || status === 'stale';
}

/**
 * Per-appBuilderComponent row. The label is the appBuilderComponent id (the handler resolves the
 * catalog name; the row stays presentational + id-dispatching). The persisted
 * `status` widens to a string here so the live `appBuilderComponentStatusUpdate`
 * 'deploying' transition (not part of the persisted union) renders too.
 */
export function AppBuilderComponentRow({ appBuilderComponent, message, onRemove }: AppBuilderComponentRowProps) {
    const { id } = appBuilderComponent;
    const status: string = appBuilderComponent.status;

    return (
        <View>
            {status === 'deploying' && <DeployingState message={message} />}
            {isDeployedView(status) && (
                <DeployedState
                    view={{ label: id, url: appBuilderComponent.url, deployedUrls: appBuilderComponent.deployedUrls }}
                    onRedeploy={() => webviewClient.postMessage('redeployAppBuilderComponent', { id })}
                    onRemove={onRemove}
                    verifyAction={{
                        label: 'Verify',
                        onPress: () => webviewClient.postMessage('verifyAppBuilderComponent', { id }),
                        testId: `appBuilderComponent-verify-${id}`,
                    }}
                />
            )}
            {status === 'error' && (
                <ErrorState
                    label={id}
                    message={message}
                    onRetry={() => webviewClient.postMessage('deployAppBuilderComponent', { id })}
                />
            )}
            {status === 'not-deployed' && (
                <Flex>
                    <Button
                        variant="primary"
                        onPress={() => webviewClient.postMessage('deployAppBuilderComponent', { id })}
                    >
                        Deploy
                    </Button>
                </Flex>
            )}
        </View>
    );
}
