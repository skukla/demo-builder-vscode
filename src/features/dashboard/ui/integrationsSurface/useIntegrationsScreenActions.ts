/**
 * useIntegrationsScreenActions — what the integrations screen's controls do.
 *
 * The add and destination journeys' open/closed state, the mesh deploy, the
 * destination move, the back/refresh/re-authenticate messages, and the
 * once-per-visit update check. Moved out of `IntegrationsScreen` (EDS-8,
 * 2026-10-08) unchanged.
 *
 * @module features/dashboard/ui/integrationsSurface/useIntegrationsScreenActions
 */

import { useCallback, useEffect, useState } from 'react';
import type { ComponentOperation } from '../hooks/useComponentOperation';
import type { OperationRunnerControls } from '@/core/ui/hooks/useOperationRunner';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { DESTINATION_OPERATION_ID } from '@/core/utils/operationIds';
import type { DestinationRef } from '@/types/webviewRequests';

/**
 * The mesh deploy as the progress modal knows it (PL-59 slice 1). Its own entry
 * because the card-action tables key off an App Builder component id and a verb,
 * and the mesh has neither: one message, one title.
 *
 * The id is the mesh CARD's id, which is also the extension's `MESH_OPERATION_ID`
 * (`features/mesh/services/deployMeshWithFeedback.ts`) — so the pushes, the modal
 * and reopening a running tile all name the same operation.
 */
export const MESH_OPERATION: Omit<ComponentOperation, 'run' | 'resume'> = {
    id: 'mesh',
    name: 'API Mesh',
    message: 'deployMesh',
    title: 'Deploying API Mesh',
    failureTitle: "Couldn't deploy API Mesh",
    successTitle: 'API Mesh deployed',
};

/** The project and workspace the destination journey settled on. */
export interface ChosenDestination {
    project: DestinationRef;
    workspace: DestinationRef;
}

/** The screen's handlers, and which of its two journeys is open. */
export interface IntegrationsScreenActions {
    addOpen: boolean;
    destOpen: boolean;
    openAdd: () => void;
    closeAdd: () => void;
    openDestination: () => void;
    closeDestination: () => void;
    handleBack: () => void;
    handleDeployMesh: () => void;
    handleReAuthenticate: () => void;
    handleRefresh: () => void;
    handleDestinationChosen: (chosen: ChosenDestination) => void;
}

/**
 * The integrations screen's actions.
 *
 * @param startOperation - opens the screen's progress modal on an operation
 */
export function useIntegrationsScreenActions(
    startOperation: OperationRunnerControls['start'],
): IntegrationsScreenActions {
    const [addOpen, setAddOpen] = useState(false);
    // One modal instance, two journeys — `mode` selects the stage set, so a
    // second <AddIntegrationFlowAdapter> would just duplicate its state.
    const [destOpen, setDestOpen] = useState(false);

    // Which integrations have newer code: asked once per visit. The answer
    // arrives as a components snapshot when anything changed.
    useEffect(() => {
        webviewClient.postMessage('checkIntegrationUpdates');
    }, []);

    const handleBack = useCallback((): void => {
        webviewClient.postMessage('showProjectDashboard');
    }, []);

    // The mesh deploy takes the same road as an integration's: the screen's
    // progress modal, which hands over to a notification on "Run in background".
    const handleDeployMesh = useCallback((): void => {
        startOperation(MESH_OPERATION);
    }, [startOperation]);

    const handleReAuthenticate = useCallback((): void => {
        webviewClient.postMessage('reAuthenticate');
    }, []);

    const handleRefresh = useCallback((): void => {
        webviewClient.postMessage('requestStatus');
    }, []);

    const openAdd = useCallback((): void => setAddOpen(true), []);
    const closeAdd = useCallback((): void => setAddOpen(false), []);
    const openDestination = useCallback((): void => setDestOpen(true), []);
    const closeDestination = useCallback((): void => setDestOpen(false), []);

    // The move takes minutes and moves each integration in turn, so it narrates
    // into the same modal every other operation here uses (PL-59 slice 5).
    const handleDestinationChosen = useCallback(
        (chosen: ChosenDestination): void => {
            const target = [
                chosen.project.title ?? chosen.project.name,
                chosen.workspace.title ?? chosen.workspace.name,
            ]
                .filter(Boolean)
                .join(' · ');
            startOperation({
                id: DESTINATION_OPERATION_ID,
                name: target,
                message: 'setProjectDestination',
                payload: { project: chosen.project, workspace: chosen.workspace },
                title: `Changing destination to ${target}`,
                failureTitle: "Couldn't change the destination",
                successTitle: 'Destination changed',
            });
            closeDestination();
        },
        [startOperation, closeDestination],
    );

    return {
        addOpen,
        destOpen,
        openAdd,
        closeAdd,
        openDestination,
        closeDestination,
        handleBack,
        handleDeployMesh,
        handleReAuthenticate,
        handleRefresh,
        handleDestinationChosen,
    };
}
