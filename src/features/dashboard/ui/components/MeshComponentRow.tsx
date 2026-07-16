/**
 * MeshComponentRow Component (ADR-011 D3 Step 08)
 *
 * The mesh's row in the dashboard integrations list — the ONE mesh surface
 * after Step 08 retired the masthead "API Mesh" badge and the ActionGrid
 * "Deploy Mesh" tile. Purely presentational: it renders the SAME live
 * StatusDisplay the badge used (so the status vocabulary — Deployed /
 * Not deployed / deploying message / Redeploy Mesh / Session expired — is
 * unchanged) and routes its one action to the injected callbacks:
 *   - Deploy / Redeploy → onDeploy (the existing 'deployMesh' path — the mesh
 *     deploy verb is `demoBuilder.deployMesh`, NEVER the keyed `aio app deploy`
 *     messages the integration rows dispatch)
 *   - needs-auth        → a "Sign in" StatusCard action → onReAuthenticate
 * Mesh has NO Manage APIs and NO Remove: its lifecycle is owned by the project
 * configuration (wizard/Configure), not the per-id keyed remove.
 *
 * @module features/dashboard/ui/components/MeshComponentRow
 */

import { Flex, Button } from '@adobe/react-spectrum';
import React from 'react';
import type { StatusDisplay, MeshStatus } from '../hooks/useDashboardStatus';
import { DeployingState } from './appBuilderComponentStates';
import { StatusCard } from '@/core/ui/components/feedback';

export interface MeshComponentRowProps {
    /** Live mesh status display (same source as the retired badge). */
    statusDisplay: StatusDisplay;
    /** Raw mesh status — drives which action the row offers. */
    status: MeshStatus | undefined;
    /** Disable the deploy action while a mesh/demo operation is in flight. */
    isActionDisabled: boolean;
    /** The existing mesh deploy path (posts 'deployMesh'). */
    onDeploy: () => void;
    /** User-initiated re-auth for the needs-auth state (posts 'reAuthenticate'). */
    onReAuthenticate: () => void;
}

/**
 * Resolve the row's action label: Deploy before the first deploy, Redeploy for
 * every deployed-ish/error state, none while busy or unresolved (needs-auth
 * offers Sign in instead; checking/deploying are in-flight).
 */
function meshActionLabel(status: MeshStatus | undefined): string | null {
    switch (status) {
        case 'not-deployed':
            return 'Deploy';
        case 'deployed':
        case 'config-changed':
        case 'config-incomplete':
        case 'update-declined':
        case 'error':
            return 'Redeploy';
        default:
            return null;
    }
}

/**
 * The mesh row: live status card (+ Sign in remediation on needs-auth) and a
 * single Deploy/Redeploy action routed to the mesh deploy path.
 */
export function MeshComponentRow({
    statusDisplay,
    status,
    isActionDisabled,
    onDeploy,
    onReAuthenticate,
}: MeshComponentRowProps): React.ReactElement {
    if (status === 'deploying') {
        return <DeployingState message={statusDisplay.text} />;
    }

    const actionLabel = meshActionLabel(status);

    return (
        <Flex direction="column" gap="size-150">
            <StatusCard
                label="API Mesh"
                status={statusDisplay.text}
                color={statusDisplay.color}
                size="S"
                action={
                    status === 'needs-auth'
                        ? { label: 'Sign in', onPress: onReAuthenticate }
                        : undefined
                }
            />
            {actionLabel && (
                <Flex>
                    <Button
                        variant="secondary"
                        onPress={onDeploy}
                        isDisabled={isActionDisabled}
                    >
                        {actionLabel}
                    </Button>
                </Flex>
            )}
        </Flex>
    );
}
