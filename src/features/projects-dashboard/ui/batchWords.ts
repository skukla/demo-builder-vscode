/**
 * The batch window's words, in one place: its confirm, its red button, its run and its end.
 *
 * Several projects are named by kind and count: "Reset 3 Projects?", "Resetting Projects",
 * "Projects Reset" (the window-header convention, owner 2026-11-04). One project, opened from its
 * card or row, is named instead (decisions J7-1; step-05 P5-Q1): "Reset Kukla Luma?", the button
 * the bare verb, "Resetting Kukla Luma", and "Kukla Luma Reset", the thing first (rule 21).
 *
 * @module features/projects-dashboard/ui/batchWords
 */

import type { ProjectDisplayName } from '@/core/utils/projectDisplayName';
import type { ProjectsBatchAction } from '@/types/projectsBatch';

/** What the window is about: the action, how many projects, and the project's name when one. */
export interface BatchSubject {
    action: ProjectsBatchAction;
    count: number;
    /** Set only when the window is on exactly one project. */
    one?: ProjectDisplayName;
}

/** The subject of an action over these projects' names. */
export function batchSubject(
    action: ProjectsBatchAction,
    names: readonly ProjectDisplayName[],
): BatchSubject {
    return names.length === 1
        ? { action, count: 1, one: names[0] }
        : { action, count: names.length };
}

// Every word is written out, not assembled from a verb table, so the Title Case check
// (`ui-label-case.test.ts`) can read each label it names.

/** The red button: the verb alone for one project, else the verb and how many it takes. */
export function runLabel({ action, count, one }: BatchSubject): string {
    if (action === 'delete') {
        if (one) return 'Delete';
        return count === 1 ? 'Delete 1 Project' : `Delete ${count} Projects`;
    }
    if (one) return 'Reset';
    return count === 1 ? 'Reset 1 Project' : `Reset ${count} Projects`;
}

/** The confirm's title: it asks, by name for one project, else with the button's count. */
export function confirmTitle(subject: BatchSubject): string {
    if (!subject.one) return `${runLabel(subject)}?`;
    return subject.action === 'delete' ? `Delete ${subject.one}?` : `Reset ${subject.one}?`;
}

/** The run's header, and the notification's a run closed mid-way goes on in. */
export function runningTitle({ action, one }: BatchSubject): string {
    if (action === 'delete') return one ? `Deleting ${one}` : 'Deleting Projects';
    return one ? `Resetting ${one}` : 'Resetting Projects';
}

/**
 * The run's header once it has ended: what happened, by name for one project; for several, which
 * project and why is in the rows beneath.
 *
 * @param fell - the run failed, or some project did not go through
 */
export function endTitle({ action, one }: BatchSubject, fell: boolean): string {
    if (action === 'delete') {
        if (fell) return one ? `Couldn't Delete ${one}` : "Couldn't Delete Projects";
        return one ? `${one} Deleted` : 'Projects Deleted';
    }
    if (fell) return one ? `Couldn't Reset ${one}` : "Couldn't Reset Projects";
    return one ? `${one} Reset` : 'Projects Reset';
}
