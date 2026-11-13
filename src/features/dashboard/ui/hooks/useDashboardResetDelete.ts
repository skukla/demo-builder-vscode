/**
 * useDashboardResetDelete — the project dashboard's Reset and Delete (step-05 S4; owner
 * 2026-11-13, P5-Q2).
 *
 * Reset opens the projects list's batch window here, on the dashboard's own project as its one row
 * (`useProjectsBatch`, `ProjectsBatchModal`): the same window and words as a card's Reset ("Reset
 * Kukla Luma?", "Reset", "Resetting Kukla Luma", "Kukla Luma Reset"). After a run, closing the
 * window keeps the dashboard and asks for its status again.
 *
 * Delete opens the projects list on its one-row Delete window (`deleteFromProjectsList`): the
 * dashboard closes when its project is deleted, so the window cannot live here.
 *
 * Both are real cloud operations: the window's red button is the only thing that starts a run.
 *
 * @module features/dashboard/ui/hooks/useDashboardResetDelete
 */

import { useCallback, useMemo } from 'react';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import {
    useProjectsBatch,
    type ProjectsBatchControls,
} from '@/features/projects-dashboard/ui/hooks/useProjectsBatch';

export interface DashboardResetDelete {
    /** The batch window's controls, for `ProjectsBatchModal`. */
    batch: ProjectsBatchControls;
    handleResetProject: () => void;
    handleDeleteProject: () => void;
}

/** After a reset the dashboard stays: its status is asked for again. Module-level, so stable. */
function refreshStatus(): void {
    webviewClient.postMessage('requestStatus');
}

/** The hand-over: the extension opens the projects list on this project's Delete window. */
function deleteFromProjectsList(): void {
    webviewClient.postMessage('deleteFromProjectsList');
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
    const batch = useProjectsBatch(refreshStatus);
    const { start } = batch;
    const handleResetProject = useCallback((): void => {
        if (path) start('reset', [{ path, name }]);
    }, [start, path, name]);
    return useMemo(
        () => ({ batch, handleResetProject, handleDeleteProject: deleteFromProjectsList }),
        [batch, handleResetProject],
    );
}
