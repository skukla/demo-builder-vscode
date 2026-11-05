/**
 * Resetting or deleting several projects at once, from the projects list (owner, 2026-11-04,
 * `.rptc/research/projects-bulk-actions/research.md`): the questions asked once, up front, then one
 * window with a row per project, as the Updates window runs its rows: deletes one at a time, resets
 * side by side within an org (`projectsBatch.ts`).
 *
 * @module types/projectsBatch
 */

import type { UpdateRowState } from './pendingUpdates';
import type { ProjectDisplayName } from '@/core/utils/projectDisplayName';

export type ProjectsBatchAction = 'reset' | 'delete';

/** `prepareProjectsBatch`: what the questions need, read for the projects picked. */
export interface PrepareProjectsBatchRequest {
    action: ProjectsBatchAction;
    projectPaths: string[];
}

/** One online resource a delete may take with the project. */
export interface BatchDeleteOption {
    /** What it is called where it lives: `owner/repo`, `org/site`, the datapack's name. */
    name: string;
    /** Where the box starts: `demoBuilder.cleanupBehavior` `deleteAll` ticks the repository and the site. */
    ticked: boolean;
}

/** One project of a delete batch: only the options it has, and none another project still uses. */
export interface BatchDeleteRow {
    path: string;
    /** As its card names it (`getProjectDisplayName`): a folder name fails to compile. */
    name: ProjectDisplayName;
    repo?: BatchDeleteOption;
    site?: BatchDeleteOption;
    datapack?: BatchDeleteOption;
}

/** The datapack a reset would remove, and what it would do with the SC's changes in it. */
export interface BatchResetDatapack {
    /** The pack's name as the SC knows it. */
    name: string;
    /**
     * The changes since the install: `saves` when they go into the SC's own pack with no question,
     * `asks` when the pack is not theirs and they need a new pack's name or to be discarded, and
     * `unchecked` when they could not be read, so the batch keeps the pack (owner, 2026-11-04: a
     * batch never discards changes nobody could see). Absent with no changes.
     */
    changes?: 'saves' | 'asks' | 'unchecked';
}

/** One project of a reset batch. */
export interface BatchResetRow {
    path: string;
    /** As its card names it (`getProjectDisplayName`): a folder name fails to compile. */
    name: ProjectDisplayName;
    /** Its storefront's GitHub repository ("skukla/bodea"): drawn under the name, over the summary. */
    repository?: string;
    /** What the project is, as its card says it ("Bodea, Edge Delivery + ACCS"). */
    summary?: string;
    /** Its IMS organization, by name (its id without one): the run is grouped by it. */
    org?: string;
    /** Present when the project has a datapack the reset can remove. */
    datapack?: BatchResetDatapack;
}

export type PrepareProjectsBatchResponse =
    | { action: 'delete'; rows: BatchDeleteRow[] }
    | { action: 'reset'; rows: BatchResetRow[] };

/** What the SC chose for one project of a delete batch. */
export interface BatchDeleteAnswer {
    path: string;
    deleteGitHubRepo: boolean;
    deleteDaLiveSite: boolean;
    deleteDatapack: boolean;
}

/** What the SC chose for one project of a reset batch. */
export interface BatchResetAnswer {
    path: string;
    removeDatapack: boolean;
    /** When the pack is not theirs and has changes: a name to save them as, or `drop`. */
    changes?: { saveAs: string } | 'drop';
}

/** `runProjectsBatch`: the answers, one per project, in the order shown. */
export type RunProjectsBatchRequest =
    | { action: 'delete'; answers: BatchDeleteAnswer[] }
    | { action: 'reset'; answers: BatchResetAnswer[] };

/** `projectsBatchRow`: pushed as each project starts, moves on a step, and ends. */
export interface ProjectsBatchRowStatus {
    path: string;
    state: UpdateRowState;
    /** Running: the step it is on. Failed or skipped: why. */
    message?: string;
}
