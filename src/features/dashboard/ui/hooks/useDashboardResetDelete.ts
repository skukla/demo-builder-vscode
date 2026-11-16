/**
 * useDashboardResetDelete — the project dashboard's Reset and Delete (step-05 S4; owner
 * 2026-11-13, P5-Q2; Delete on the dashboard, owner 2026-11-16, release test 2.7).
 *
 * Both open the projects list's batch window here, on the dashboard's own project as its one row
 * (`useProjectsBatch`, `ProjectsBatchModal`): the same window and words as a card's Reset or Delete
 * ("Delete Kukla Luma?", "Delete", "Deleting Kukla Luma", "Kukla Luma Deleted").
 *
 * The dashboard stays while the window is open. Only once its project is actually deleted (its row
 * ended `done`) does closing the window move to the projects list (`navigateBack`). A cancelled
 * question, a failed delete, a reset, or a run sent to the background leaves the SC on this
 * dashboard, which asks for its status again. Delete used to hand over to the projects list before
 * asking, so Cancel left the SC on the list instead of where they started (owner, 2026-11-16).
 *
 * Both are real cloud operations: the window's red button is the only thing that starts a run.
 *
 * @module features/dashboard/ui/hooks/useDashboardResetDelete
 */

import { useCallback, useMemo } from 'react';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import {
    type BatchClosed,
    useProjectsBatch,
    type ProjectsBatchControls,
} from '@/features/projects-dashboard/ui/hooks/useProjectsBatch';

export interface DashboardResetDelete {
    /** The batch window's controls, for `ProjectsBatchModal`. */
    batch: ProjectsBatchControls;
    handleResetProject: () => void;
    handleDeleteProject: () => void;
}

/**
 * @param name - the name the dashboard shows, which titles the window
 * @param path - the project's folder now (a rename moves it), or undefined before it is known
 * @returns the window's controls and the two tiles' handlers
 */
export function useDashboardResetDelete(
    name: string,
    path: string | undefined,
): DashboardResetDelete {
    const afterRun = useCallback(
        ({ action, done }: BatchClosed): void => {
            if (action === 'delete' && path !== undefined && done.includes(path)) {
                // The project is gone: the list is the only screen left to show.
                webviewClient.postMessage('navigateBack');
                return;
            }
            webviewClient.postMessage('requestStatus');
        },
        [path],
    );
    const batch = useProjectsBatch(afterRun);
    const { start } = batch;
    const handleResetProject = useCallback((): void => {
        if (path) start('reset', [{ path, name }]);
    }, [start, path, name]);
    const handleDeleteProject = useCallback((): void => {
        if (path) start('delete', [{ path, name }]);
    }, [start, path, name]);
    return useMemo(
        () => ({ batch, handleResetProject, handleDeleteProject }),
        [batch, handleResetProject, handleDeleteProject],
    );
}
