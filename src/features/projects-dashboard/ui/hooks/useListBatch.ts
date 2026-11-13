/**
 * useListBatch — the projects list's Reset and Delete, one project or several, through one window
 * (step-05 S2). Reset Selected and Delete Selected open the batch window on the ticked projects the
 * filter shows; a card's or row's Reset or Delete opens it on that one project, titled by its name
 * ("Reset Kukla Luma?", decisions J7-1), replacing the VS Code dialogs the old `resetProject` and
 * `deleteProject` messages ran. Both are real cloud operations: the window's red button is the only
 * thing that starts a run.
 *
 * @module features/projects-dashboard/ui/hooks/useListBatch
 */

import { useCallback, useMemo } from 'react';
import type { ListBatch } from '../components/SelectionActions';
import { useProjectsBatch, type ProjectsBatchControls } from './useProjectsBatch';
import type { Project } from '@/types/base';

export interface ListBatchWiring {
    /** The window's controls, for `ProjectsBatchModal`. */
    batch: ProjectsBatchControls;
    /** What selection mode reads: the start, whether the window is open, how many runs began. */
    listBatch: ListBatch;
    /** A card's or row's Reset: the window on that one project. */
    onResetProject: (project: Project) => void;
    /** A card's or row's Delete: the window on that one project. */
    onDeleteProject: (project: Project) => void;
}

/**
 * The list's batch window and its one-project doors.
 *
 * @param refreshList - called when a window that ran is closed, to refresh the projects
 * @returns the controls, the list's view of them, and the card actions
 */
export function useListBatch(refreshList: () => void): ListBatchWiring {
    const batch = useProjectsBatch(refreshList);
    const { start, runs } = batch;
    const isOpen = batch.view.phase !== 'closed';
    const listBatch = useMemo(() => ({ start, isOpen, runs }), [start, isOpen, runs]);
    const onResetProject = useCallback((project: Project) => start('reset', [project]), [start]);
    const onDeleteProject = useCallback((project: Project) => start('delete', [project]), [start]);
    return { batch, listBatch, onResetProject, onDeleteProject };
}
