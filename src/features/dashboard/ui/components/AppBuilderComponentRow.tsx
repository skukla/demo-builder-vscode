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
 *                    Verify (StatusCard.action, on-demand) → verifyAppBuilderComponent {id};
 *                    Manage APIs → bubbles up via onManageApis (the list hosts the shared modal)
 *   - error        : Retry    → deployAppBuilderComponent   {id}
 *
 * @module features/dashboard/ui/components/AppBuilderComponentRow
 */

import { View, Flex, Button } from '@adobe/react-spectrum';
import React from 'react';
import { DeployingState, DeployedState, ErrorState } from './appBuilderComponentStates';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { IdentifiedAppBuilderComponent } from '@/features/app-builder/services/appBuilderComponentState';
import { getAppBuilderComponentEntry } from '@/features/project-creation/services/appBuilderComponentCatalogLoader';

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
    /**
     * Manage-APIs intent handler (deployed/stale only). Like Remove, the row
     * never opens UI on its own — the list hosts the ONE shared
     * {@link ManageApisModal}, so the click bubbles up with this row's id.
     */
    onManageApis: () => void;
}

/** A persisted `stale` status renders as deployed (still up; just drift-flagged). */
function isDeployedView(status: string): boolean {
    return status === 'deployed' || status === 'stale';
}

/**
 * Rename is offered for integration entries whose id is NOT a pre-built
 * catalog id: the runner resolves catalog-first and rewrites `name: entry.name`
 * on every redeploy, so a catalog-id rename would be silently reverted (same
 * exclusion the rename handler and the settings serializer apply). The catalog
 * loader is a pure bundled-JSON lookup, so it is webview-safe here.
 */
function isRenamable(appBuilderComponent: IdentifiedAppBuilderComponent): boolean {
    return (
        appBuilderComponent.kind === 'integration' &&
        getAppBuilderComponentEntry(appBuilderComponent.id) === undefined
    );
}

/**
 * Per-appBuilderComponent row. The label prefers the persisted display `name`
 * (AI-built instances) and falls back to the id (same convention as
 * projectStatusUtils). Messages ALWAYS dispatch the id — the name is display
 * only. The persisted `status` widens to a string here so the live
 * `appBuilderComponentStatusUpdate` 'deploying' transition (not part of the
 * persisted union) renders too.
 */
export function AppBuilderComponentRow({
    appBuilderComponent,
    message,
    onRemove,
    onManageApis,
}: AppBuilderComponentRowProps) {
    const { id } = appBuilderComponent;
    const label = appBuilderComponent.name ?? id;
    const status: string = appBuilderComponent.status;

    return (
        <View>
            {status === 'deploying' && <DeployingState message={message} />}
            {isDeployedView(status) && (
                <DeployedState
                    view={{
                        label,
                        url: appBuilderComponent.url,
                        deployedUrls: appBuilderComponent.deployedUrls,
                    }}
                    onRedeploy={() =>
                        webviewClient.postMessage('redeployAppBuilderComponent', { id })
                    }
                    onRemove={onRemove}
                    onManageApis={onManageApis}
                    // Display-name rename (non-catalog integration entries only;
                    // a mesh keeps its fixed "API Mesh" identity and a catalog
                    // entry's name is rewritten on redeploy). The extension owns
                    // the input surface (showInputBox) — the row dispatches ONLY
                    // the id.
                    onRename={
                        isRenamable(appBuilderComponent)
                            ? () => webviewClient.postMessage('renameAppBuilderComponent', { id })
                            : undefined
                    }
                    verifyAction={{
                        label: 'Verify',
                        onPress: () =>
                            webviewClient.postMessage('verifyAppBuilderComponent', { id }),
                        testId: `appBuilderComponent-verify-${id}`,
                    }}
                />
            )}
            {status === 'error' && (
                <ErrorState
                    label={label}
                    message={message}
                    onRetry={() => webviewClient.postMessage('deployAppBuilderComponent', { id })}
                />
            )}
            {status === 'not-deployed' && (
                <Flex>
                    <Button
                        variant="primary"
                        onPress={() =>
                            webviewClient.postMessage('deployAppBuilderComponent', { id })
                        }
                    >
                        Deploy
                    </Button>
                </Flex>
            )}
        </View>
    );
}
