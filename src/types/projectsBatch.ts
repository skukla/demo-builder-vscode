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
    /** What it is called where it lives: `owner/repo`, `org/site`. */
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
    /**
     * Present when Demo Builder installed the project's datapack into its Commerce instance: Remove
     * Datapack Data, unticked to start (walk F96).
     */
    datapack?: BatchDatapack;
}

/**
 * The datapack whose data a reset or a delete would remove from Commerce, and what it would do with
 * the SC's changes in it.
 */
export interface BatchDatapack {
    /** The pack's name as the SC knows it. */
    name: string;
    /**
     * The changes since the install: `saves` when the pack is the SC's own, so a save goes into it
     * (asked unless `alwaysSave`); `asks` when it is not theirs, so a save makes a new pack; and
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
    datapack?: BatchDatapack;
}

/**
 * What "Save Your Changes First?" needs, beside the rows (step-05 S1, J7-2): the names a new
 * datapack may not take, and whether the SC's own packs are saved into without asking.
 */
export interface BatchSaveNames {
    /** The SC's own datapacks' names in the library (`packSave.ts`); none when it cannot be asked. */
    ownNames: string[];
    /**
     * `demoBuilder.dataInstaller.changesOnRemoval` is `save`: a pack whose changes are `saves` goes
     * into the SC's own pack with no question, so the save question leaves it out (P5-Q6).
     */
    alwaysSave: boolean;
}

export type PrepareProjectsBatchResponse =
    | ({ action: 'delete'; rows: BatchDeleteRow[] } & BatchSaveNames)
    | ({ action: 'reset'; rows: BatchResetRow[] } & BatchSaveNames);

/** What the SC chose for one project of a delete batch. */
export interface BatchDeleteAnswer {
    path: string;
    deleteGitHubRepo: boolean;
    deleteDaLiveSite: boolean;
    /** Uninstall Datapack: the pack's data comes out of Commerce before the files go. */
    removeDatapackData: boolean;
    /**
     * The save question's answer for a pack with changes: a new pack's name, or `drop`. Absent: a
     * pack of the SC's own is saved into, one that is not theirs keeps its data.
     */
    changes?: { saveAs: string } | 'drop';
}

/** What the SC chose for one project of a reset batch. */
export interface BatchResetAnswer {
    path: string;
    removeDatapack: boolean;
    /** As a delete's (`BatchDeleteAnswer.changes`). */
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
    /**
     * Done: what a reset finished around (the code not published, pages left undone, the mesh not
     * redeployed, a datapack that did not all come out). Failed: what its datapack step did to the
     * store first. In the reset's own words, each an orange note.
     */
    warnings?: string[];
}

/**
 * The project dashboard's Delete opens the projects list on its one-row Delete window (step-05 S4,
 * owner 2026-11-13, P5-Q2). A list not open yet takes the instruction once it has mounted
 * (`takeDeleteRequest`); one already open is pushed `openDeleteWindow`.
 */
export interface OpenDeleteWindowPayload {
    /** The project to open the Delete window on, by its folder. */
    projectPath: string;
}

/** `takeDeleteRequest`: the project to open the Delete window on now, or null; used up either way. */
export interface TakeDeleteRequestResponse {
    success: true;
    data: { projectPath: string | null };
}
