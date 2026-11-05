/**
 * Resetting or deleting several projects at once, from the projects list (owner, 2026-11-04,
 * `.rptc/research/projects-bulk-actions/research.md`).
 *
 * Two halves, as the window has two screens:
 * - **prepare** reads what the questions need, for every project picked, and writes nothing: which
 *   online resources a delete may take (none another project still uses, counting the batch's own
 *   projects as going), and whether a reset's datapack has changes that need a name.
 * - **run** takes the answers and works the projects: deletes one at a time (each is quick); resets
 *   side by side within an IMS organization, up to `RESETS_AT_ONCE` (owner, 2026-11-04: a reset
 *   takes about six minutes). The token reaches one org, so orgs run one after another, each costing
 *   one sign-in switch; resets that remove a pack's store data take turns, as nothing locks a
 *   Commerce instance; the open-project pointer never moves (`createNonSwitchingStateManager`); and
 *   a sign-in needed by several at once is asked once (both guards' `SingleFlight`), the window's
 *   questions taking turns (`operationPrompt`). Each project reports into its own row, and one that
 *   fails does not stop the rest.
 *
 * The single delete and reset are reused, not copied: `runProjectDelete`, and each reset's
 * answered run, which asks nothing and reports into this window.
 *
 * @module features/projects-dashboard/services/projectsBatch
 */

import * as vscode from 'vscode';
import { deletablePackOf } from './demoPackDeletion';
import { runProjectDelete } from './projectDeletionService';
import { getProjectDisplayName } from '@/core/utils/projectDisplayName';
import { stageLine } from '@/core/utils/stageLine';
import type { ReportStage } from '@/core/vscode/withOperationProgress';
import { openLibraryWriter } from '@/features/data-installer/handlers/libraryWriter';
import { readRemovalChangesOf } from '@/features/data-installer/handlers/removalChanges';
import { commerceBackendOf } from '@/features/data-installer/services/commerceBackend';
import { extractEdsMetadata } from '@/features/eds/services/resourceCleanupHelpers';
import { sharedOnlineOf } from '@/features/eds/services/storefront/sharedRepoProjects';
import { getBrandStackSummary } from '@/features/projects-dashboard/utils/componentSummaryUtils';
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
            const row: BatchDeleteRow = { path: project.path, name: getProjectDisplayName(project) };
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
/**
 * What Reset Selected draws under a project's name: its storefront's repository, which a reset
 * overwrites, and its card's line for a project with none (owner, 2026-11-04: two projects of one
 * package read the same). Delete Selected names the repository in its box instead (2026-11-05).
 */
function summaryOf(project: Project): { repository?: string; summary?: string } {
    const repository = extractEdsMetadata(project)?.githubRepo;
    const summary = getBrandStackSummary(project);
    return { ...(repository ? { repository } : {}), ...(summary ? { summary } : {}) };
}

/**
 * A library pack's display name, as the Datapacks screen shows it (F17: the confirm showed its id,
 * "kukla-justrite-a80dca"). Undefined for a pack outside the library, or a library that does not
 * answer: the caller falls back to the id.
 */
async function displayNameOf(context: HandlerContext, held: NonNullable<Project['datapack']>): Promise<string | undefined> {
    if (held.store !== 'library') return undefined;
    try {
        const library = await openLibraryWriter(context);
        if (!library.ok) return undefined;
        const page = await library.client.findDatapacks({ datapackName: held.name });
        return page.items.find((item) => item.id.name === held.name)?.displayName;
    } catch (error) {
        context.debugLogger.debug(`[ProjectsBatch] Could not read ${held.name}'s display name: ${error instanceof Error ? error.message : String(error)}`);
        return undefined;
    }
}

/** A project's IMS organization as the SC knows it: its name, its id when it has none. */
function orgOf(project: Project): { org?: string } {
    const org = project.adobe?.organizationName ?? project.adobe?.organization;
    return org ? { org } : {};
}

export async function prepareResetBatch(context: HandlerContext, paths: readonly string[]): Promise<BatchResetRow[]> {
    const projects = await loadAll(context, paths);
    return Promise.all(
        projects.map(async (project): Promise<BatchResetRow> => {
            const row: BatchResetRow = { path: project.path, name: getProjectDisplayName(project), ...summaryOf(project), ...orgOf(project) };
            if (!project.datapack || commerceBackendOf(project) === undefined) return row;
            const changes = await readRemovalChangesOf(context, project);
            const name = changes?.packName ?? (await displayNameOf(context, project.datapack)) ?? project.datapack.name;
            row.datapack = { name };
            // Unread is not "no changes": the pack stays rather than lose what nobody could see.
            if (!changes) row.datapack.changes = 'unchecked';
            // Changes go into the SC's own pack with no question; else they need a name.
            else if (changes.count > 0) row.datapack.changes = changes.packName ? 'saves' : 'asks';
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
            // The stage and how far through it, as the notification says it (owner, 2026-11-04).
            tell({ path, state: 'running', message: stageLine(stage, position) });
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

/** The answers by IMS organization, in the order each org first appears, each in the order picked. */
function groupsByOrganization<T extends { path: string }>(answers: readonly T[], orgOf: (path: string) => string | undefined): T[][] {
    const groups = new Map<string, T[]>();
    for (const answer of answers) {
        const org = orgOf(answer.path) ?? '';
        groups.set(org, [...(groups.get(org) ?? []), answer]);
    }
    return [...groups.values()];
}

/** The answers in run order: grouped by IMS organization, each group in the order picked. */
export function byOrganization<T extends { path: string }>(answers: readonly T[], orgOf: (path: string) => string | undefined): T[] {
    return groupsByOrganization(answers, orgOf).flat();
}

/**
 * How many resets run at once within one org (owner, 2026-11-04: a reset takes about six minutes).
 * Three keeps the DA.live and Helix calls they share within what those services take before they
 * ask to slow down (both retry a 429, nothing limits across projects).
 */
const RESETS_AT_ONCE = 3;

/**
 * Run each item, up to `limit` at a time, in order; an item with a lane waits while another of its
 * lane runs. Resolves with how many failed once every item has ended.
 */
function inParallel<T>(items: readonly T[], limit: number, laneOf: (item: T) => string | undefined, work: (item: T) => Promise<boolean>): Promise<number> {
    const pending = [...items];
    const busy = new Set<string>();
    let running = 0;
    let failed = 0;
    return new Promise((resolve) => {
        const next = (): void => {
            if (pending.length === 0 && running === 0) {
                resolve(failed);
                return;
            }
            while (running < limit) {
                const at = pending.findIndex((item) => {
                    const lane = laneOf(item);
                    return lane === undefined || !busy.has(lane);
                });
                if (at < 0) return;
                const [item] = pending.splice(at, 1);
                const lane = laneOf(item);
                if (lane !== undefined) busy.add(lane);
                running++;
                void work(item)
                    .then((ok) => (ok ? undefined : failed++), () => failed++)
                    .finally(() => {
                        running--;
                        if (lane !== undefined) busy.delete(lane);
                        next();
                    });
            }
        };
        next();
    });
}

/**
 * A reset that removes its pack's data plans the store's clearing before it clears; two at once
 * could each plan before the other removed anything (no lock on a Commerce instance), so they take
 * turns. A batch never clears other store data, so nothing else shares this lane.
 */
const REMOVES_STORE_DATA = 'removes-store-data';

/**
 * Reset each project as answered, grouped by IMS organization: an org's projects side by side, up to
 * {@link RESETS_AT_ONCE} at a time, those removing a pack's store data taking turns.
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
    const groups = groupsByOrganization(answers, (path) => projects.get(path)?.adobe?.organization);
    tellWaiting(groups.flat().map((answer) => answer.path), tell);
    const resetOne = (answer: BatchResetAnswer): Promise<boolean> =>
        runRow(answer.path, tell, report, async (rowReport) => {
            const project = projects.get(answer.path);
            if (!project) return { error: 'This project is no longer on this computer.' };
            const result = await runReset(context, project, answer, rowReport);
            return result.success ? undefined : { error: result.error ?? 'The reset did not finish.' };
        });
    // One org at a time, the token reaching one; within it, side by side (owner, 2026-11-04).
    let failed = 0;
    for (const group of groups) {
        failed += await inParallel(group, RESETS_AT_ONCE, (answer) => (answer.removeDatapack ? REMOVES_STORE_DATA : undefined), resetOne);
    }
    return failed;
}
