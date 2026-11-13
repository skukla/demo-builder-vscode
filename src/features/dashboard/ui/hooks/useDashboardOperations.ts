/**
 * useDashboardOperations — the dashboard's three long storefront actions, and the
 * one modal they narrate into (PL-59 slices 2-4).
 *
 * Sync storefront, refresh block library and republish are measured in minutes
 * rather than seconds. Each is started the same way: send the message, and open
 * the progress modal once the run reports — VS Code may confirm first (a sync
 * asks for a commit message), and a spinner behind a question is worse than no
 * spinner. Reset and Delete left for the batch window (`useDashboardResetDelete`,
 * step-05 S4).
 *
 * Separate from {@link useDashboardActions}, which holds the SHORT ones — the
 * ones that post a message and are done. The split is also what keeps the screen
 * under its size limit.
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
    REPUBLISH_OPERATION_ID,
    SYNC_OPERATION_ID,
} from '@/core/utils/operationIds';

export interface DashboardOperations {
    /** What the screen hands its `OperationProgressModal`. */
    controls: OperationRunnerControls;
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

    const handleSyncStorefront = useCallback((): void => {
        start({
            id: SYNC_OPERATION_ID,
            name: projectName,
            message: 'syncStorefront',
            title: 'Syncing the Storefront',
            failureTitle: "Couldn't Sync the Storefront",
            successTitle: 'Storefront Synced',
        });
    }, [start, projectName]);

    const handleRefreshBlockLibrary = useCallback((): void => {
        start({
            id: BLOCK_LIBRARY_OPERATION_ID,
            name: projectName,
            message: 'refreshBlockLibrary',
            title: 'Refreshing the Block Library',
            failureTitle: "Couldn't Refresh the Block Library",
            successTitle: 'Block Library Refreshed',
        });
    }, [start, projectName]);

    const handleRepublishContent = useCallback((): void => {
        start({
            id: REPUBLISH_OPERATION_ID,
            name: projectName,
            message: 'republishContent',
            title: `Republishing ${projectName}`,
            failureTitle: `Couldn't Republish ${projectName}`,
            successTitle: `${projectName} Republished`,
        });
    }, [start, projectName]);

    return useMemo(
        () => ({
            controls,
            handleSyncStorefront,
            handleRefreshBlockLibrary,
            handleRepublishContent,
        }),
        [
            controls,
            handleSyncStorefront,
            handleRefreshBlockLibrary,
            handleRepublishContent,
        ],
    );
}
