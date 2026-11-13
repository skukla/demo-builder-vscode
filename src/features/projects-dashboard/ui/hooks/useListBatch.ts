/**
 * useListBatch — the projects list's Reset and Delete, one project or several, through one window
 * (step-05 S2). Reset Selected and Delete Selected open the batch window on the ticked projects the
 * filter shows; a card's or row's Reset or Delete opens it on that one project, titled by its name
 * ("Reset Kukla Luma?", decisions J7-1), replacing the VS Code dialogs the old `resetProject` and
 * `deleteProject` messages ran. Both are real cloud operations: the window's red button is the only
 * thing that starts a run.
 *
 * The project dashboard's Delete arrives here too (step-05 S4, owner 2026-11-13, P5-Q2): the list
 * it opens takes the instruction once mounted (`takeDeleteRequest`), or is pushed it when already
 * open (`openDeleteWindow`), and opens the one-row Delete window once that project is among the
 * projects it loaded. Cancelled, the SC stays on the list.
 *
 * @module features/projects-dashboard/ui/hooks/useListBatch
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ListBatch } from '../components/SelectionActions';
import { useProjectsBatch, type ProjectsBatchControls } from './useProjectsBatch';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { Project } from '@/types/base';
import type { OpenDeleteWindowPayload, TakeDeleteRequestResponse } from '@/types/projectsBatch';

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
 * The project whose Delete window to open on arrival: taken once on mount, or pushed later.
 * Cleared once the window opens on it, so it opens once.
 */
function useDeleteArrival(): [string | null, (path: string | null) => void] {
    const [arrival, setArrival] = useState<string | null>(null);
    useEffect(() => {
        // An answer with no data (a refused request, a host that does not know the message) opens
        // nothing: reading through it threw on every load of the visual check's harness.
        webviewClient
            .request<TakeDeleteRequestResponse | null | undefined>('takeDeleteRequest')
            .then(
                (response) => setArrival(response?.data?.projectPath ?? null),
                () => undefined,
            );
    }, []);
    useEffect(
        () =>
            webviewClient.onMessage('openDeleteWindow', (data) => {
                const path = (data as Partial<OpenDeleteWindowPayload> | undefined)?.projectPath;
                if (path) setArrival(path);
            }),
        [],
    );
    return [arrival, setArrival];
}

/**
 * The list's batch window and its one-project doors.
 *
 * @param refreshList - called when a window that ran is closed, to refresh the projects
 * @param projects - the projects the list loaded, where an arriving Delete finds its project
 * @returns the controls, the list's view of them, and the card actions
 */
export function useListBatch(
    refreshList: () => void,
    projects: readonly Project[],
): ListBatchWiring {
    const batch = useProjectsBatch(refreshList);
    const { start, runs } = batch;
    const [arrival, setArrival] = useDeleteArrival();
    useEffect(() => {
        const project = arrival ? projects.find((p) => p.path === arrival) : undefined;
        if (!project) return;
        setArrival(null);
        start('delete', [project]);
    }, [arrival, projects, start, setArrival]);
    const isOpen = batch.view.phase !== 'closed';
    const listBatch = useMemo(() => ({ start, isOpen, runs }), [start, isOpen, runs]);
    const onResetProject = useCallback((project: Project) => start('reset', [project]), [start]);
    const onDeleteProject = useCallback((project: Project) => start('delete', [project]), [start]);
    return { batch, listBatch, onResetProject, onDeleteProject };
}
