/**
 * Resetting or deleting several projects at once, from the projects list (owner, 2026-11-04,
 * `.rptc/research/projects-bulk-actions/research.md`).
 *
 * Two halves, as the window has two screens:
 * - **prepare** reads what the questions need, for every project picked, and writes nothing: which
 *   online resources a delete may take (none another project still uses, counting the batch's own
 *   projects as going), and whether a reset's datapack has changes that need a name.
 * - **run** takes the answers and works the projects **one at a time**: one IMS identity, one
 *   open-project pointer and one Commerce instance per project's store all rule out side by side.
 *   Each project reports into its own row, and one that fails does not stop the rest. Reset
 *   projects run grouped by IMS organization, so each other organization costs one sign-in switch.
 *
 * The single delete and reset are reused, not copied: `runProjectDelete`, and each reset's
 * answered run, which asks nothing and reports into this window.
 *
 * @module features/projects-dashboard/services/projectsBatch
 */

import * as vscode from 'vscode';
import { deletablePackOf } from './demoPackDeletion';
import { runProjectDelete } from './projectDeletionService';
import type { ReportStage } from '@/core/vscode/withOperationProgress';
import { readRemovalChangesOf } from '@/features/data-installer/handlers/removalChanges';
import { commerceBackendOf } from '@/features/data-installer/services/commerceBackend';
import { extractEdsMetadata } from '@/features/eds/services/resourceCleanupHelpers';
import { sharedOnlineOf } from '@/features/eds/services/storefront/sharedRepoProjects';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';
import type {
    BatchDeleteAnswer,
    BatchDeleteRow,
    BatchResetAnswer,
    BatchResetRow,
    ProjectsBatchRowStatus,
} from '@/types/projectsBatch';

/** Tells the window where one project's row has got to. */
export type TellRow = (status: ProjectsBatchRowStatus) => void;

/** Runs one project's reset, answered, reporting into the batch (wired by the handler). */
export type RunReset = (context: HandlerContext, project: Project, answer: BatchResetAnswer, report: ReportStage) => Promise<{ success: boolean; error?: string }>;

/** Each project picked, loaded, in the order picked; a path that no longer loads is left out. */
async function loadAll(context: HandlerContext, paths: readonly string[]): Promise<Project[]> {
    const loaded = await Promise.all(paths.map((path) => context.stateManager.loadProjectFromPath(path, undefined, { persistAfterLoad: false })));
    return loaded.filter((project): project is Project => Boolean(project));
}

const cleanupBehavior = (): string => vscode.workspace.getConfiguration('demoBuilder').get<string>('cleanupBehavior', 'ask');

/**
 * A delete batch's table: per project, the options it has. `deleteAll` ticks the repository and the
 * site, never the datapack; `localOnly` offers none, as the single delete does.
 */
export async function prepareDeleteBatch(context: HandlerContext, paths: readonly string[]): Promise<BatchDeleteRow[]> {
    const behavior = cleanupBehavior();
    const projects = await loadAll(context, paths);
    return Promise.all(
        projects.map(async (project): Promise<BatchDeleteRow> => {
            const row: BatchDeleteRow = { path: project.path, name: project.name };
            if (behavior === 'localOnly') return row;
            const eds = extractEdsMetadata(project);
            const shared = await sharedOnlineOf(context.stateManager, eds, paths);
            const tick = behavior === 'deleteAll';
            if (eds?.githubRepo && shared.repo.length === 0) row.repo = { name: eds.githubRepo, ticked: tick };
            if (eds?.daLiveOrg && eds.daLiveSite && shared.site.length === 0) row.site = { name: `${eds.daLiveOrg}/${eds.daLiveSite}`, ticked: tick };
            const pack = await deletablePackOf(context, project, paths);
            if (pack) row.datapack = { name: pack.displayName, ticked: false };
            return row;
        }),
    );
}

/** A reset batch's screen: per project, the datapack the reset could remove and its changes. */
export async function prepareResetBatch(context: HandlerContext, paths: readonly string[]): Promise<BatchResetRow[]> {
    const projects = await loadAll(context, paths);
    return Promise.all(
        projects.map(async (project): Promise<BatchResetRow> => {
            const row: BatchResetRow = { path: project.path, name: project.name };
            if (!project.datapack || commerceBackendOf(project) === undefined) return row;
            const changes = await readRemovalChangesOf(context, project);
            const name = changes?.packName ?? project.datapack.name;
            row.datapack = { name };
            // Changes go into the SC's own pack with no question; else they need a name.
            if ((changes?.count ?? 0) > 0) row.datapack.changes = changes?.packName ? 'saves' : 'asks';
            return row;
        }),
    );
}

/**
 * One project of a run: what it does, told into its row and to the window's own line (which a
 * notification shows when the window is closed), never thrown out of the batch.
 */
async function runRow(path: string, tell: TellRow, outer: ReportStage, work: (report: ReportStage) => Promise<{ error?: string } | undefined>): Promise<boolean> {
    tell({ path, state: 'running' });
    try {
        const outcome = await work((stage, step, position) => {
            tell({ path, state: 'running', message: stage });
            outer(stage, step, position);
        });
        if (outcome?.error) {
            tell({ path, state: 'failed', message: outcome.error });
            return false;
        }
        tell({ path, state: 'done' });
        return true;
    } catch (error) {
        tell({ path, state: 'failed', message: error instanceof Error ? error.message : String(error) });
        return false;
    }
}

/** Tell every row waiting, so the window shows the whole batch from the start. */
const tellWaiting = (paths: readonly string[], tell: TellRow): void => paths.forEach((path) => tell({ path, state: 'waiting' }));

/**
 * Delete each project as answered, one at a time.
 *
 * @returns how many failed
 */
export async function runDeleteBatch(context: HandlerContext, answers: readonly BatchDeleteAnswer[], tell: TellRow, report: ReportStage): Promise<number> {
    const going = answers.map((answer) => answer.path);
    tellWaiting(going, tell);
    let failed = 0;
    for (const answer of answers) {
        const ok = await runRow(answer.path, tell, report, async (rowReport) => {
            const project = await context.stateManager.loadProjectFromPath(answer.path, undefined, { persistAfterLoad: false });
            if (!project) return { error: 'This project is no longer on this computer.' };
            const ownPack = answer.deleteDatapack ? await deletablePackOf(context, project, going) : undefined;
            const cleanupOptions = { deleteGitHubRepo: answer.deleteGitHubRepo, deleteDaLiveSite: answer.deleteDaLiveSite, deleteDatapack: answer.deleteDatapack };
            const ran = await runProjectDelete(context, project, { cleanupOptions, ownPack, cleanupResults: [] }, rowReport);
            return ran.stopped ? { error: ran.stopped } : undefined;
        });
        if (!ok) failed++;
    }
    return failed;
}

/** The answers in run order: grouped by IMS organization, each group in the order picked. */
export function byOrganization<T extends { path: string }>(answers: readonly T[], orgOf: (path: string) => string | undefined): T[] {
    const groups = new Map<string, T[]>();
    for (const answer of answers) {
        const org = orgOf(answer.path) ?? '';
        groups.set(org, [...(groups.get(org) ?? []), answer]);
    }
    return [...groups.values()].flat();
}

/**
 * Reset each project as answered, one at a time, grouped by IMS organization.
 *
 * @returns how many failed
 */
export async function runResetBatch(
    context: HandlerContext,
    answers: readonly BatchResetAnswer[],
    run: { tell: TellRow; report: ReportStage; runReset: RunReset },
): Promise<number> {
    const { tell, report, runReset } = run;
    const projects = new Map((await loadAll(context, answers.map((answer) => answer.path))).map((project) => [project.path, project]));
    const ordered = byOrganization(answers, (path) => projects.get(path)?.adobe?.organization);
    tellWaiting(ordered.map((answer) => answer.path), tell);
    let failed = 0;
    for (const answer of ordered) {
        const ok = await runRow(answer.path, tell, report, async (rowReport) => {
            const project = projects.get(answer.path);
            if (!project) return { error: 'This project is no longer on this computer.' };
            const result = await runReset(context, project, answer, rowReport);
            return result.success ? undefined : { error: result.error ?? 'The reset did not finish.' };
        });
        if (!ok) failed++;
    }
    return failed;
}
