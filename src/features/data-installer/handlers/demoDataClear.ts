/**
 * `clear-demo-data` (datapack-engine step 10; datapack-simplification step 06, C3): one handler for
 * the Data Installer's red button and the agent's `clear_demo_data`. Confirm-gated, and handed the
 * token of the list the SC (or the agent's user) was shown.
 *
 * The list was made as if the project's datapack were already gone, so the clearing:
 *
 * 1. refuses unless confirmed, with a known token, while no type of the list was too slow to read;
 * 2. uninstalls the datapack first through the engine's own removal (`DemoDataDeps.remove`, which is
 *    `removeProjectSampleDataOutcome`), its changes settled with the answer the request carries
 *    (`changes`, `saveAs`, read as `delete_project` and `reset_project` read them). A save or removal
 *    that fails, or changes in a pack not the SC's with no answer, stops HERE, before any wipe write:
 *    the project keeps naming its pack (R1), the token stays, so Retry runs it again. A pack with no
 *    install record here (one the service installed) is not uninstalled: the wipe alone;
 * 3. re-plans with the records as the removal left them (what it kept on purpose stays respected) and
 *    holds to the shown list (`withinPlan`, which allows the website settings the removal put back);
 * 4. wipes, then notes what it could not finish (`rememberWipeUnfinished`) for a second Clear.
 *
 * One progress window: "Uninstall <Datapack>", then a row per data type (`clearRun`). It ends on its
 * rows when something is left to do: payment-review orders and list settings with Open Commerce Admin.
 * Cannot be undone, except the datapack part: its changes are saved and the library keeps the pack.
 *
 * @module features/data-installer/handlers/demoDataClear
 */

import { phaseLine } from '../services/datapackTypesLine';
import { type ClearRun, clearRun, needsAdmin } from '../services/demoDataWipe/clearRunRows';
import type { WipeClaims } from '../services/demoDataWipe/wipeClaims';
import { WIPE_PHASES } from '../services/demoDataWipe/wipePhases';
import type { WipePlan } from '../services/demoDataWipe/wipePlan';
import {
    WipeChangedError,
    type WipeOutcome,
    clearShown,
    websitesInWords,
} from '../services/demoDataWipe/wipeRun';
import { type WipeUnfinished, readWipeUnfinished, rememberWipeUnfinished } from '../services/demoDataWipe/wipeUnfinished';
import { notUninstalled, packForgotten, settingsSetBack, uninstalledFirst } from '../ui/clearDemoDataWords';
import { dataTypeLabel } from '../ui/dataTypeLabel';
import { answerOf, checkPlan } from './demoDataCheck';
import {
    type DemoDataDeps,
    LOG_PREFIX,
    type Opened,
    type ShownPlan,
    type ShownPlans,
    claimsOf,
    failure,
    keep,
    openStore,
} from './demoDataStore';
import { andList } from '@/core/utils/andList';
import { DATAPACK_STAGES } from '@/core/utils/datapackStages';
import { DEMO_DATA_CLEAR_OPERATION_ID } from '@/core/utils/operationIds';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import { withOperationProgress } from '@/core/vscode/withOperationProgress';
import { changesAnswer, changesNeedAnswer } from '@/features/ai/server/datapackAnswerArgs';
import { forgetRemovedPack } from '@/features/eds/services/reset/edsResetSampleData';
import type { DemoDataRequest } from '@/types/demoDataWipe';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';

/** The types the list could not read in time, by name: the clearing waits for Retry. */
function slowTypes(shown: ShownPlan): string[] {
    return Object.entries(shown.plan.check.unread ?? {})
        .filter(([, kind]) => kind === 'slow')
        .map(([type]) => dataTypeLabel(type));
}

/** The refusal an unconfirmed clearing, or one of a list that must be read again, answers. */
function clearRefusal(payload: DemoDataRequest | undefined, shown: ShownPlan): string | undefined {
    const slow = slowTypes(shown);
    if (slow.length > 0)
        return `Commerce didn't answer for ${andList(slow)}, so nothing was cleared. Check again (check_demo_data) before clearing.`;
    if (payload?.confirm === true) return undefined;
    const first = shown.removing
        ? `It first uninstalls this project's datapack ${shown.removing.name}, its changes saved first unless changes is "drop". Then it removes `
        : 'This removes ';
    return (
        `${first}everything on ${websitesInWords(shown.plan.check)} that no other project's datapack lists, as listed: products, ` +
        'categories, customers, cart rules, companies, shared catalogs, customer groups, attribute sets and attributes. It sets ' +
        "those websites' settings to the default's value, cancels or refunds their orders and closes their returns (bringing in " +
        'line the ERP of an ERP integration that serves these websites, from Commerce). It cannot be undone. Confirm to proceed.'
    );
}

/** How the datapack part went, once it went through. */
interface Uninstalled {
    name: string;
    leftInStore: boolean;
}

/** The token is claimed for one run; `release` gives it back when the run stopped before any wipe write, so Retry works. */
interface Claimed {
    shown: ShownPlan;
    payload: DemoDataRequest;
    run: ClearRun;
    release: () => void;
}

/** The changes with no answer: nothing was cleared, and how to answer (`datapackAnswerArgs`, shared with reset and delete). */
const needsAnswer = (why: string): HandlerResponse => ({ success: false, ...changesNeedAnswer(why, 'cleared') });

/**
 * Before anything runs, with no answer given: changes in a pack that is not the SC's need one, so the
 * window asks its question (or the agent its user) and no progress window opens. Changes in the SC's
 * own pack are saved into it, as Uninstall's are.
 */
async function askedFirst(deps: DemoDataDeps, context: HandlerContext, shown: ShownPlan, payload: DemoDataRequest): Promise<HandlerResponse | undefined> {
    if (!shown.removing || changesAnswer(payload) !== undefined) return undefined;
    const project = await context.stateManager.getCurrentProject();
    const changes = project ? await deps.changes(context, project) : undefined;
    if (!changes || changes.count === 0 || changes.packName !== undefined) return undefined;
    return needsAnswer(changes.sentence ?? `You changed ${changes.count} things in the datapack ${shown.removing.name} since it was installed.`);
}

/**
 * The datapack uninstalled first, on the open project's own object (the removal clears its pack
 * there when everything came out). Anything short of that answers the response to stop on.
 */
async function uninstallFirst(deps: DemoDataDeps, context: HandlerContext, opened: Opened, claimed: Claimed): Promise<Uninstalled | { response: HandlerResponse }> {
    const { shown, payload, run } = claimed;
    const removing = shown.removing;
    if (!removing) return { response: { success: false, error: 'No datapack to uninstall.' } };
    const held = opened.project.datapack;
    if (held?.name !== removing.pack.name || held.version !== removing.pack.version) {
        return { response: { success: false, error: 'The datapack this project uses changed since the list was made. Check again.' } };
    }
    run.uninstalling(true);
    run.report(OPERATION_STAGES.removingDatapack.label);
    // The products the wipe deletes next leave too, so the uninstall keeps what Clear's check removes.
    const removal = await deps.remove(opened.project, context, run.report, changesAnswer(payload), shown.plan.deleteSkus);
    run.uninstalling(false);
    if (removal.kept === undefined) return { name: removing.name, leftInStore: removal.leftInStore === true };
    const response = removal.unanswered ? needsAnswer(removal.kept) : { success: false, error: notUninstalled(removing.name, removal.kept, removal.partly === true) };
    context.logger.warn(`${LOG_PREFIX} Nothing was cleared: ${response.error}`);
    return { response: { ...response, rows: run.stopped(response.error ?? removal.kept) } };
}

/** The store would now clear more than was shown: the new list is offered, never acted on. */
async function offerAgain(plans: ShownPlans, opened: Opened, claims: WipeClaims, context: HandlerContext, error: WipeChangedError, lead: string): Promise<HandlerResponse> {
    const fresh = await checkPlan(opened, claims, context);
    keep(plans, { plan: fresh });
    return { success: false, error: `${lead}${error.message}`, data: answerOf(fresh, claims, opened.project) };
}

/** The window's line when something is left to do, else nothing: the rows say what. */
function warningOf(outcome: WipeOutcome, rows: ReadonlyArray<{ problem?: unknown }>): string | undefined {
    if (needsAdmin(outcome)) return 'Some of it needs the Commerce Admin.';
    return rows.some((row) => row.problem) ? 'Not everything was cleared.' : undefined;
}

/** Note what the wipe could not finish, for the next clearing of these websites; never fatal. */
function noteUnfinished(deps: DemoDataDeps, context: HandlerContext, opened: Opened, unfinished: WipeUnfinished | undefined): Promise<void> {
    return rememberWipeUnfinished(deps.files, opened.project.path, unfinished).catch((error: unknown) => context.logger.warn(`${LOG_PREFIX} What was left to do could not be noted: ${String(error)}`));
}

/**
 * A wipe that stopped after the datapack came out: whatever it may have half-done, the next clearing
 * looks again at every group, set and attribute the list meant to remove, with what an earlier note
 * named. Only widens what is looked at (`wipeUnfinished.ts`).
 */
async function noteStopped(deps: DemoDataDeps, context: HandlerContext, opened: Opened, plan: WipePlan): Promise<void> {
    const before = await readWipeUnfinished(deps.files, opened.project.path).catch(() => undefined);
    const earlier = before?.scopeKey === plan.scopeKey ? before : undefined;
    const merged = (a: readonly (string | number)[], b: readonly (string | number)[] = []) => [...new Set([...a, ...b])];
    await noteUnfinished(deps, context, opened, {
        scopeKey: plan.scopeKey,
        groups: merged(plan.groups.map((g) => g.groupId), earlier?.groups) as number[],
        sets: merged(plan.attributeSets.map((s) => s.id), earlier?.sets) as number[],
        attributes: merged(plan.attributes.map((a) => a.code), earlier?.attributes) as string[],
    });
}

/**
 * Whether the wipe certainly left nothing a pack with no record put in: nothing refused, every type
 * read by the list AND by the plan made again at run time (a read failing then drops its type, which
 * `withinPlan` accepts), and nothing kept or only taken off a website. With no record, Demo Builder
 * cannot tell which kept thing is the pack's, so anything kept may be (re-review, 2026-11-13).
 */
function tookItAll(shown: ShownPlan, ran: WipePlan, outcome: WipeOutcome): boolean {
    const unread = (plan: WipePlan): number => Object.keys(plan.check.unread ?? {}).length;
    const kept = Object.values(ran.check.records).some((records) => records.kept.length > 0);
    const takenOff = ran.takeOff.length + ran.ruleTakeOff.length > 0;
    return outcome.failed.length === 0 && unread(shown.plan) + unread(ran) === 0 && !kept && !takenOff;
}

/**
 * A pack the service installed has no record, so no removal ran: the wipe took out what it put in.
 * When it certainly took it all (`tookItAll`), the project stops naming it (step-05 R1's rule, through
 * the same save as a removal's), and the result says so only when that save went through.
 */
async function forgetServicePack(context: HandlerContext, opened: Opened, shown: ShownPlan, wiped: { outcome: WipeOutcome; ran?: WipePlan }): Promise<string | undefined> {
    const pack = opened.project.datapack;
    if (!pack || shown.removing || !wiped.ran || !tookItAll(shown, wiped.ran, wiped.outcome)) return undefined;
    return (await forgetRemovedPack(opened.project, context)) ? packForgotten(pack.name) : undefined;
}

/** The result's sentence: the datapack first, then the wipe, the settings its removal had put back, and a service pack forgotten. */
function sentenceOf(outcome: WipeOutcome, shown: ShownPlan, uninstalled: Uninstalled | undefined, forgotten: string | undefined): string {
    const back = outcome.settingsSet.filter((key) => shown.plan.setBack?.includes(key)).length;
    const parts = [outcome.sentence];
    if (uninstalled) parts.unshift(uninstalledFirst(uninstalled.name, uninstalled.leftInStore));
    if (back > 0) parts.push(settingsSetBack(back));
    if (forgotten) parts.push(forgotten);
    return parts.join(' ');
}

/** The wipe, re-planned with the records as they are now and held to the list shown. */
async function wipe(deps: DemoDataDeps, context: HandlerContext, opened: Opened, claims: WipeClaims, claimed: Claimed, uninstalled?: Uninstalled): Promise<HandlerResponse> {
    const { shown, run } = claimed;
    const onPhase = (at: number): void => run.report(DATAPACK_STAGES.verifyingDemoData.label, phaseLine(WIPE_PHASES, at));
    onPhase(0);
    let ran: WipePlan | undefined;
    const onWiped = (done: WipeOutcome, plan: WipePlan): Promise<void> => {
        ran = plan;
        return noteUnfinished(deps, context, opened, done.unfinished);
    };
    const outcome = await clearShown(opened.commerce, shown.plan, { ...claims.respects, erp: opened.erp, onPhase, onWiped }, run.report);
    const forgotten = await forgetServicePack(context, opened, shown, { outcome, ...(ran ? { ran } : {}) });
    const sentence = sentenceOf(outcome, shown, uninstalled, forgotten);
    context.logger.info(`${LOG_PREFIX} ${sentence}`);
    const rows = run.ended(outcome, uninstalled?.leftInStore === true);
    const warning = warningOf(outcome, rows);
    const offer = needsAdmin(outcome) ? { offer: { action: 'open-commerce-admin' as const } } : {};
    return { success: true, note: sentence, data: { ...outcome, sentence }, rows, ...(warning ? { warning } : {}), ...offer };
}

/** Clear the list shown, from this project: the datapack first, when the list was made without it. */
async function clearIn(deps: DemoDataDeps, plans: ShownPlans, context: HandlerContext, claimed: Claimed): Promise<HandlerResponse> {
    const { shown, release } = claimed;
    const opened = await openStore(deps, context);
    if ('response' in opened) return (release(), opened.response);
    const claims = await claimsOf(deps, opened);
    if (claims.scope.key !== shown.plan.scopeKey) {
        release();
        return { success: false, error: `That list is for ${websitesInWords(shown.plan.check)}, not the websites this project uses now. Check again.` };
    }
    const uninstalled = shown.removing ? await uninstallFirst(deps, context, opened, claimed) : undefined;
    if (uninstalled && 'response' in uninstalled) return (release(), uninstalled.response);
    const lead = uninstalled ? `${uninstalledFirst(uninstalled.name, uninstalled.leftInStore)} ` : '';
    try {
        // The records as the removal left them, on the websites the list covered.
        const now = uninstalled ? await claimsOf(deps, opened, { websites: shown.plan.websiteCodes }) : claims;
        try {
            return await wipe(deps, context, opened, now, claimed, uninstalled);
        } catch (error) {
            if (error instanceof WipeChangedError) return await offerAgain(plans, opened, now, context, error, lead);
            throw error;
        }
    } catch (error) {
        if (!claimed.run.writing()) release();
        if (uninstalled) await noteStopped(deps, context, opened, shown.plan);
        const failed = failure(context, error, "This project's websites could not be cleared.");
        return { ...failed, error: `${lead}${failed.error ?? ''}` };
    }
}

/**
 * Clear what the list with the request's token showed. The token is claimed before anything runs, so
 * two clearings of one list cannot both uninstall; it is given back when a run stops before writing.
 *
 * @param plans - the plans the check showed, by token
 */
export async function clearDemoData(deps: DemoDataDeps, plans: ShownPlans, context: HandlerContext, payload?: DemoDataRequest): Promise<HandlerResponse> {
    if (!payload?.token) return { success: false, error: 'Check what would be removed first (check_demo_data), and hand its token back.', code: ErrorCode.INVALID_OPERATION };
    const shown = plans.get(payload.token);
    if (!shown) return { success: false, error: 'That list is no longer known here. Check what would be removed again.' };
    const refusal = clearRefusal(payload, shown);
    if (refusal) return { success: false, error: refusal, code: ErrorCode.INVALID_OPERATION };
    plans.delete(payload.token);
    const release = (): void => keep(plans, shown);
    const asked = await askedFirst(deps, context, shown, payload).catch(() => undefined);
    if (asked) return (release(), asked);
    const options = { id: DEMO_DATA_CLEAR_OPERATION_ID, title: 'Clearing Demo Data', inModal: payload.progress === 'modal' };
    return withOperationProgress(options, async (report) => {
        const run = clearRun(shown.plan, shown.removing?.name, report);
        try {
            return await clearIn(deps, plans, context, { shown, payload, run, release });
        } catch (error) {
            // Thrown before a removal or a wipe write began (opening the store, reading the records): Retry still works.
            if (!run.writing()) release();
            return failure(context, error, "This project's websites could not be cleared.");
        }
    });
}
