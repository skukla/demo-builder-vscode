/**
 * useProjectSelection — the projects list's selection mode (owner, 2026-11-04): Select puts a box
 * on every card, Done or Escape leaves it and forgets what was ticked.
 *
 * It acts only on what the filter shows: Select All covers the shown projects, the count is of
 * them, and Reset Selected or Delete Selected takes only the ticked ones still in view, so a
 * project the filter hides is never reset or deleted unseen. A project still being created
 * cannot be ticked.
 *
 * @module features/projects-dashboard/ui/hooks/useProjectSelection
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Project } from '@/types/base';

export interface ProjectSelectionControls {
    selecting: boolean;
    /** Paths ticked, among them some the filter may hide now. */
    selected: ReadonlySet<string>;
    /** The ticked projects the filter shows, in the list's order. */
    chosen: Project[];
    /** How many the filter shows. */
    shown: number;
    /** Every shown project that can be ticked is ticked. */
    all: boolean;
    enter: () => void;
    /** Leave selection mode, forgetting what was ticked. */
    done: () => void;
    toggle: (project: Project) => void;
    /** Select All: ticks every shown project when not all are, else unticks them. */
    toggleAll: () => void;
}

const NONE: ReadonlySet<string> = new Set();

const canSelect = (project: Project): boolean => project.status !== 'creating';

/**
 * The selection over the projects the list shows.
 *
 * @param shownProjects - the projects the filter shows, in their order
 * @param escapeLeaves - whether Escape leaves selection mode now (not while a window is open over it)
 * @param runs - how many batch runs have started; each takes the ticked projects, and leaves
 * @returns the selection and its actions
 */
export function useProjectSelection(shownProjects: Project[], escapeLeaves: boolean, runs: number): ProjectSelectionControls {
    const [selecting, setSelecting] = useState(false);
    const [selected, setSelected] = useState<ReadonlySet<string>>(NONE);

    const enter = useCallback(() => setSelecting(true), []);
    const done = useCallback(() => {
        setSelecting(false);
        setSelected(NONE);
    }, []);

    const toggle = useCallback((project: Project) => {
        if (!canSelect(project)) return;
        setSelected((previous) => {
            const next = new Set(previous);
            if (next.has(project.path)) next.delete(project.path);
            else next.add(project.path);
            return next;
        });
    }, []);

    const selectable = useMemo(() => shownProjects.filter(canSelect), [shownProjects]);
    const chosen = useMemo(() => selectable.filter((p) => selected.has(p.path)), [selectable, selected]);
    const all = selectable.length > 0 && chosen.length === selectable.length;

    const toggleAll = useCallback(() => {
        setSelected((previous) => {
            const next = new Set(previous);
            for (const project of selectable) {
                if (all) next.delete(project.path);
                else next.add(project.path);
            }
            return next;
        });
    }, [selectable, all]);

    useEffect(() => {
        if (runs > 0) done();
    }, [runs, done]);

    useEffect(() => {
        if (!selecting || !escapeLeaves) return undefined;
        const onKey = (event: KeyboardEvent): void => {
            if (event.key === 'Escape') done();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [selecting, escapeLeaves, done]);

    return useMemo(
        () => ({ selecting, selected, chosen, shown: shownProjects.length, all, enter, done, toggle, toggleAll }),
        [selecting, selected, chosen, shownProjects.length, all, enter, done, toggle, toggleAll],
    );
}
