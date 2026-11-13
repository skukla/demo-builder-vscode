/**
 * `clear-commerce-instance` (datapack-simplification step 06, C4): clear the websites the instance
 * check showed, whoever put the data there. Gated twice in the handler, as an agent sends it too:
 * `confirm`, and `understood` (the window's "I understand" box). An instance clearing:
 *
 * 1. refuses unless confirmed and understood, with a known instance token, while no type of the list
 *    was too slow to read;
 * 2. asks, before anything runs, when a project's changes in a pack not the SC's have no answer
 *    (the batch save question's, by project path);
 * 3. uninstalls each listed datapack in turn (only packs every record of which is on a chosen website
 *    of this instance: `instanceClaims.ts`), on its own `Project`: the open project's own object, or
 *    another's manifest read from disk right before its step, with its own answer, its manifest saved
 *    without making it the open project (`forgetRemovedPack`: re-read, only the pack cleared). A save
 *    or removal that fails stops HERE, before any wipe write, and the token is given back: Retry
 *    skips a project whose pack is already out;
 * 4. re-plans with the records as the removals left them (a pack left in part on purpose keeps its
 *    project's records respected), held to the shown list, and wipes; notes what it could not finish
 *    (`rememberWipeUnfinished`); and, after a full clearing, has each project whose pack the service
 *    installed (no record) stop naming it. The result names the projects that kept their data.
 *
 * Cannot be undone, except the datapacks: their changes are saved first and the library keeps them,
 * so each project installs its pack again (the result says so).
 *
 * @module features/data-installer/handlers/demoDataInstanceClear
 */

import { type ClearRun, clearRun, needsAdmin } from '../services/demoDataWipe/clearRunRows';
import type { WipeClaims } from '../services/demoDataWipe/wipeClaims';
import type { WipePlan } from '../services/demoDataWipe/wipePlan';
import {
    WipeChangedError,
    type WipeOutcome,
    websitesInWords,
} from '../services/demoDataWipe/wipeRun';
import {
    INSTANCE_REINSTALL,
    forgottenPacks,
    notUninstalled,
    settingsSetBack,
    uninstalledEachFirst,
} from '../ui/clearDemoDataWords';
import { noteStopped, runShownWipe, slowTypes, tookItAll, warningOf } from './demoDataClear';
import { instanceClaimsOf } from './demoDataInstanceCheck';
import {
    type DemoDataDeps,
    type InstanceRemoval,
    LOG_PREFIX,
    type Opened,
    type ShownPlan,
    type ShownPlans,
    failure,
    keep,
    openStore,
} from './demoDataStore';
import { createNonSwitchingStateManager } from '@/core/state/workingProjectStateManager';
import { andList } from '@/core/utils/andList';
import { DEMO_DATA_CLEAR_OPERATION_ID } from '@/core/utils/operationIds';
import { getProjectDisplayName } from '@/core/utils/projectDisplayName';
import { withOperationProgress } from '@/core/vscode/withOperationProgress';
import { forgetRemovedPack } from '@/features/eds/services/reset/edsResetSampleData';
import type { Project } from '@/types/base';
import type { ClearInstanceRequest } from '@/types/demoDataWipe';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';

type Removals = NonNullable<ShownPlan['instance']>['removals'];

/** The token is claimed for one run; `release` gives it back when the run stopped before any wipe write. */
interface Claimed {
    shown: ShownPlan;
    removals: Removals;
    payload: ClearInstanceRequest;
    run: ClearRun;
    release: () => void;
}

/** How each removal went, in the list's order: skipped when the project no longer named its pack. */
interface Uninstalled {
    path: string;
    name: string;
    leftInStore: boolean;
    skipped?: true;
}

const FAILED = "The Commerce instance's websites could not be cleared.";

/** The refusal an unconfirmed clearing, or one of a list that must be read again, answers. */
function instanceRefusal(
    payload: ClearInstanceRequest,
    shown: ShownPlan,
    removals: Removals,
): string | undefined {
    const slow = slowTypes(shown);
    if (slow.length > 0)
        return `Commerce didn't answer for ${andList(slow)}, so nothing was cleared. Check again before clearing.`;
    if (payload.confirm === true && payload.understood === true) return undefined;
    const first =
        removals.length > 0
            ? `It first uninstalls the datapacks ${andList(removals.map((r) => r.name))}, each project's changes saved first unless its answer is "drop". Then it removes `
            : 'This removes ';
    return (
        `${first}everything on ${websitesInWords(shown.plan.check)} that no kept project's datapack lists, as listed. ` +
        'Every project whose datapack is uninstalled loses its demo data there; the others keep theirs, as the list said. ' +
        "It can't be undone, except the datapacks: each can be installed again from the library. " +
        'Confirm, and say the user understood, to proceed.'
    );
}

/** The changes with no answer: nothing ran, and how to answer. */
const needsAnswer = (why: string): HandlerResponse => ({
    success: false,
    code: ErrorCode.CHANGES_NEED_ANSWER,
    error: `${why} Nothing was cleared. Tell the user, then call again with that project's changes answered: a saveAs name for a new datapack, or "drop" to lose them.`,
});

/** The open project and every other one, loaded now. */
async function loadedProjects(deps: DemoDataDeps, context: HandlerContext): Promise<Project[]> {
    const current = await context.stateManager.getCurrentProject();
    return current ? [current, ...(await deps.others(context, current))] : [];
}

/**
 * Before anything runs: changes in a pack that is not the SC's, with no answer, need one, so the
 * window asks its question (or the agent its user). Changes in the SC's own pack are saved into it.
 */
async function askedFirst(
    deps: DemoDataDeps,
    context: HandlerContext,
    removals: Removals,
    payload: ClearInstanceRequest,
): Promise<HandlerResponse | undefined> {
    const unanswered = removals.filter((r) => payload.changes?.[r.path] === undefined);
    if (unanswered.length === 0) return undefined;
    const projects = await loadedProjects(deps, context);
    for (const removal of unanswered) {
        const project = projects.find((p) => p.path === removal.path);
        const changes = project ? await deps.changes(context, project) : undefined;
        if (project && changes && changes.count > 0 && changes.packName === undefined) {
            const said =
                changes.sentence ??
                `You changed ${changes.count} things in the datapack ${removal.pack.name} since it was installed.`;
            return needsAnswer(`${getProjectDisplayName(project)}: ${said}`);
        }
    }
    return undefined;
}

/**
 * The project a pack names, read right before its step: the open one's own object, or another's
 * manifest as it is on disk now, so no copy loaded before the earlier removals is acted on or saved.
 */
async function projectNow(context: HandlerContext, opened: Opened, path: string): Promise<Project | undefined> {
    if (opened.project.path === path) return opened.project;
    return (await context.stateManager.loadProjectFromPath(path, undefined, { persistAfterLoad: false })) ?? undefined;
}

const samePack = (held: Project['datapack'], pack: InstanceRemoval['pack']): boolean => held?.name === pack.name && held.version === pack.version;

/** Stop on the removal at `at`: nothing after it runs, and no wipe write has happened. */
function stoppedAt(
    context: HandlerContext,
    run: ClearRun,
    at: number,
    response: HandlerResponse,
): { response: HandlerResponse } {
    context.logger.warn(`${LOG_PREFIX} Nothing was cleared: ${response.error}`);
    return { response: { ...response, rows: run.stopped(response.error ?? '', at) } };
}

/** One removal, on its project as loaded now; a project no longer naming its pack is skipped (a Retry after part ran). */
async function uninstallOne(
    deps: DemoDataDeps,
    context: HandlerContext,
    opened: Opened,
    claimed: Claimed,
    at: number,
): Promise<Uninstalled | { response: HandlerResponse }> {
    const { removals, payload, run, shown } = claimed;
    const removal = removals[at];
    const project = await projectNow(context, opened, removal.path);
    const held = project?.datapack;
    if (project && !held) return { path: removal.path, name: removal.name, leftInStore: false, skipped: true };
    if (!project || !samePack(held, removal.pack)) {
        return stoppedAt(context, run, at, {
            success: false,
            error: `The datapack ${removal.name} uses changed since the list was made. Check again.`,
        });
    }
    const runContext: HandlerContext = {
        ...context,
        stateManager: createNonSwitchingStateManager(context.stateManager),
    };
    run.uninstalling(true, at);
    const outcome = await deps.remove(
        project,
        runContext,
        run.report,
        payload.changes?.[removal.path],
        shown.plan.deleteSkus,
    );
    run.uninstalling(false, at);
    if (outcome.kept === undefined)
        return { path: removal.path, name: removal.name, leftInStore: outcome.leftInStore === true };
    const response = outcome.unanswered
        ? needsAnswer(outcome.kept)
        : {
              success: false,
              error: notUninstalled(removal.name, outcome.kept, outcome.partly === true),
          };
    return stoppedAt(context, run, at, response);
}

/** Every listed datapack uninstalled, in order, or the response to stop on. */
async function uninstallEach(
    deps: DemoDataDeps,
    context: HandlerContext,
    opened: Opened,
    claimed: Claimed,
): Promise<Uninstalled[] | { response: HandlerResponse }> {
    const done: Uninstalled[] = [];
    for (let at = 0; at < claimed.removals.length; at += 1) {
        const one = await uninstallOne(deps, context, opened, claimed, at);
        if ('response' in one) return one;
        done.push(one);
    }
    return done;
}

/** The result's sentence: the datapacks first, the wipe, the settings their removals had put back, and the way back. */
function sentenceOf(
    outcome: WipeOutcome,
    shown: ShownPlan,
    uninstalled: readonly Uninstalled[],
    forgotten: readonly string[],
): string {
    const plan = shown.plan;
    const ran = uninstalled.filter((u) => !u.skipped);
    const back = outcome.settingsSet.filter((key) => plan.setBack?.includes(key)).length;
    const parts = [outcome.sentence];
    if (ran.length > 0)
        parts.unshift(
            uninstalledEachFirst(
                ran.map((u) => u.name),
                ran.filter((u) => u.leftInStore).map((u) => u.name),
            ),
        );
    if (back > 0) parts.push(settingsSetBack(back));
    if (forgotten.length > 0) parts.push(forgottenPacks(forgotten));
    parts.push(...(shown.instance?.kept ?? []));
    if (ran.length > 0) parts.push(INSTANCE_REINSTALL);
    return parts.join(' ');
}

/** The wipe, re-planned with the records as they are now and held to the list shown. */
async function wipe(
    deps: DemoDataDeps,
    context: HandlerContext,
    opened: Opened,
    claims: WipeClaims,
    claimed: Claimed,
    uninstalled: readonly Uninstalled[],
): Promise<HandlerResponse> {
    const { shown, run } = claimed;
    const { outcome, ran } = await runShownWipe(deps, context, opened, claims, shown, run);
    const forgotten = await forgetServicePacks(context, opened, shown, outcome, ran);
    const sentence = sentenceOf(outcome, shown, uninstalled, forgotten);
    context.logger.info(`${LOG_PREFIX} ${sentence}`);
    const rows = run.ended(
        outcome,
        uninstalled.map((u) => u.leftInStore),
    );
    const warning = warningOf(outcome, rows);
    const offer = needsAdmin(outcome) ? { offer: { action: 'open-commerce-admin' as const } } : {};
    return {
        success: true,
        note: sentence,
        data: { ...outcome, sentence },
        rows,
        ...(warning ? { warning } : {}),
        ...offer,
    };
}

/**
 * After a full clearing, each project whose pack the service installed (no record here) and whose
 * websites were all chosen stops naming it, as Clear Demo Data forgets one (`forgetRemovedPack`:
 * re-read from disk, only the pack cleared, saved without making it the open project).
 *
 * @returns the projects that stopped naming their pack
 */
async function forgetServicePacks(context: HandlerContext, opened: Opened, shown: ShownPlan, outcome: WipeOutcome, ran: WipePlan | undefined): Promise<string[]> {
    const forgets = shown.instance?.forgets ?? [];
    if (forgets.length === 0 || !ran || !tookItAll(shown, ran, outcome)) return [];
    const names: string[] = [];
    for (const forget of forgets) {
        const project = await projectNow(context, opened, forget.path);
        if (project && samePack(project.datapack, forget.pack) && (await forgetRemovedPack(project, context))) names.push(forget.name);
    }
    return names;
}

/**
 * The removals the list named that the store as it is now would no longer make: a pack since
 * installed on a website not chosen, a record that names none, or a different pack. A project that
 * no longer names any pack is not one of them: its pack is out (a Retry after part ran).
 */
async function staleRemovals(deps: DemoDataDeps, opened: Opened, shown: ShownPlan, removals: Removals): Promise<string[]> {
    const now = await instanceClaimsOf(deps, opened, shown.plan.websiteCodes);
    const uninstalls = new Set(now.users.filter((u) => u.decision === 'uninstall').map((u) => u.project.path));
    return removals
        .filter((removal) => {
            const held = (removal.path === opened.project.path ? opened.project : opened.others.find((o) => o.path === removal.path))?.datapack;
            return held !== undefined && (!samePack(held, removal.pack) || !uninstalls.has(removal.path));
        })
        .map((removal) => removal.name);
}

/** The removals, then the wipe, from the open project's store. */
async function clearIn(
    deps: DemoDataDeps,
    context: HandlerContext,
    claimed: Claimed,
): Promise<HandlerResponse> {
    const { shown, release } = claimed;
    const opened = await openStore(deps, context);
    if ('response' in opened) return (release(), opened.response);
    const stale = await staleRemovals(deps, opened, shown, claimed.removals);
    if (stale.length > 0) {
        release();
        return { success: false, error: `The datapacks of these projects changed since the list was made, so nothing was cleared: ${andList(stale)}. Check again.` };
    }
    const uninstalled = await uninstallEach(deps, context, opened, claimed);
    if ('response' in uninstalled) return (release(), uninstalled.response);
    const ran = uninstalled.some((u) => !u.skipped);
    let wiping = false;
    try {
        // The records as the removals left them: only the packs that came out whole stop being respected.
        const whole = new Set(uninstalled.filter((u) => !u.leftInStore).map((u) => u.path));
        const now = await instanceClaimsOf(deps, opened, shown.plan.websiteCodes, whole);
        wiping = true;
        return await wipe(deps, context, opened, now, claimed, uninstalled);
    } catch (error) {
        // Before the wipe began, only removals have run: Retry skips the packs already out.
        if (!wiping || !claimed.run.writing()) release();
        if (ran) await noteStopped(deps, context, opened, shown.plan);
        if (error instanceof WipeChangedError) return { success: false, error: error.message };
        return failure(context, error, FAILED);
    }
}

/**
 * Clear what the instance list with the request's token showed. The token is claimed before anything
 * runs, so two clearings of one list cannot both uninstall; it is given back when a run stops before writing.
 *
 * @param plans - the instance plans the check showed, by token
 */
export async function clearInstance(
    deps: DemoDataDeps,
    plans: ShownPlans,
    context: HandlerContext,
    payload?: ClearInstanceRequest,
): Promise<HandlerResponse> {
    if (!payload?.token)
        return {
            success: false,
            error: 'Check what would be removed first, and hand its token back.',
            code: ErrorCode.INVALID_OPERATION,
        };
    const shown = plans.get(payload.token);
    const removals = shown?.instance?.removals;
    if (!shown || !removals)
        return {
            success: false,
            error: 'That list is no longer known here. Check what would be removed again.',
        };
    const refusal = instanceRefusal(payload, shown, removals);
    if (refusal) return { success: false, error: refusal, code: ErrorCode.INVALID_OPERATION };
    plans.delete(payload.token);
    const release = (): void => keep(plans, shown);
    const asked = await askedFirst(deps, context, removals, payload).catch((error: unknown) => {
        context.logger.warn(`${LOG_PREFIX} The datapacks' changes could not be read: ${String(error)}`);
        return { success: false, error: "The datapacks' changes could not be read, so nothing was cleared. Try again." };
    });
    if (asked) return (release(), asked);
    const options = {
        id: DEMO_DATA_CLEAR_OPERATION_ID,
        title: 'Clearing Commerce Instance',
        inModal: payload.progress === 'modal',
    };
    return withOperationProgress(options, async (report) => {
        const run = clearRun(
            shown.plan,
            removals.map((r) => r.name),
            report,
        );
        try {
            return await clearIn(deps, context, { shown, removals, payload, run, release });
        } catch (error) {
            // Thrown before a removal or a wipe write began: Retry still works.
            if (!run.writing()) release();
            return failure(context, error, FAILED);
        }
    });
}
