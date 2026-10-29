/**
 * useDashboardOperations — the dashboard's five long actions, and the one modal
 * they all narrate into (PL-59 slices 2-4).
 *
 * Reset, delete, sync storefront, refresh block library and republish are the
 * dashboard actions measured in minutes rather than seconds. Each is started the
 * same way: send the message, and open the progress modal once the run reports —
 * VS Code confirms first (a reset asks twice, a delete asks which cloud
 * resources go, a sync asks for a commit message), and a spinner behind a
 * question is worse than no spinner.
 *
 * Separate from {@link useDashboardActions}, which holds the SHORT ones — the
 * ones that post a message and are done. The split is also what keeps the screen
 * under its size limit: five callbacks and their ids were enough to tip it over.
 *
 * @module features/dashboard/ui/hooks/useDashboardOperations
 */

import { useCallback, useMemo } from 'react';
import {
    useOperationRunner,
    type OperationRunnerControls,
} from '@/core/ui/hooks/useOperationRunner';
import {
    BLOCK_LIBRARY_OPERATION_ID,
    deleteOperationId,
    REPUBLISH_OPERATION_ID,
    resetOperationId,
    SYNC_OPERATION_ID,
} from '@/core/utils/operationIds';

export interface DashboardOperations {
    /** What the screen hands its `OperationProgressModal`. */
    controls: OperationRunnerControls;
    handleResetProject: () => void;
    handleDeleteProject: () => void;
    handleSyncStorefront: () => void;
    handleRefreshBlockLibrary: () => void;
    handleRepublishContent: () => void;
}

/**
 * @param projectName - the open project, which names every title the SC reads
 */
export function useDashboardOperations(projectName: string): DashboardOperations {
    const controls = useOperationRunner();
    const start = controls.startWhenItBegins;

    const handleResetProject = useCallback((): void => {
        start({
            id: resetOperationId(projectName),
            name: projectName,
            message: 'resetProject',
            title: `Resetting ${projectName}`,
            failureTitle: `Couldn't reset ${projectName}`,
            successTitle: `${projectName} reset`,
        });
    }, [start, projectName]);

    const handleDeleteProject = useCallback((): void => {
        start({
            id: deleteOperationId(projectName),
            name: projectName,
            message: 'deleteProject',
            title: `Deleting ${projectName}`,
            failureTitle: `Couldn't delete ${projectName}`,
            successTitle: `${projectName} deleted`,
        });
    }, [start, projectName]);

    const handleSyncStorefront = useCallback((): void => {
        start({
            id: SYNC_OPERATION_ID,
            name: projectName,
            message: 'syncStorefront',
            title: 'Syncing the storefront',
            failureTitle: "Couldn't sync the storefront",
            successTitle: 'Storefront synced',
        });
    }, [start, projectName]);

    const handleRefreshBlockLibrary = useCallback((): void => {
        start({
            id: BLOCK_LIBRARY_OPERATION_ID,
            name: projectName,
            message: 'refreshBlockLibrary',
            title: 'Refreshing the block library',
            failureTitle: "Couldn't refresh the block library",
            successTitle: 'Block library refreshed',
        });
    }, [start, projectName]);

    const handleRepublishContent = useCallback((): void => {
        start({
            id: REPUBLISH_OPERATION_ID,
            name: projectName,
            message: 'republishContent',
            title: `Republishing ${projectName}`,
            failureTitle: `Couldn't republish ${projectName}`,
            successTitle: `${projectName} republished`,
        });
    }, [start, projectName]);

    return useMemo(
        () => ({
            controls,
            handleResetProject,
            handleDeleteProject,
            handleSyncStorefront,
            handleRefreshBlockLibrary,
            handleRepublishContent,
        }),
        [
            controls,
            handleResetProject,
            handleDeleteProject,
            handleSyncStorefront,
            handleRefreshBlockLibrary,
            handleRepublishContent,
        ],
    );
}
