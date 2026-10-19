/**
 * An integration's demo setup checklist (AB-26x): read it, mark a step done or dismissed
 * (or open again), and run the checks Demo Builder can do itself.
 *
 * The steps are Commerce Admin work no API does, declared on the catalog entry
 * (`setupSteps`). Where the SC is on each is saved on the component
 * (`appBuilderComponents[id].setupSteps`), so the flyout, the agent tools and a later
 * session all read the same state. The checklist lives here in Demo Builder, not in the
 * integration (owner, 2026-09-25).
 *
 * Answers with its result (Pattern B), and pushes the grid's snapshot so the flyout
 * redraws from the saved state.
 *
 * @module features/dashboard/handlers/setupChecklistHandlers
 */

import { postComponentsSnapshot, resolveComponentTarget } from './appBuilderComponentHandlers';
import { getAppBuilderComponent, setAppBuilderComponent } from '@/core/state/appBuilderComponentState';
import { buildCommerceEndpoints } from '@/features/ai/server/commerceEndpointsTool';
import { explainStatus, requestRest, resolveRestTarget } from '@/features/ai/server/commerceRestClient';
import { catalogEntryFor } from '@/features/app-builder/services/componentEntry';
import { setupChecklistOf, withAdobeNames } from '@/features/app-builder/services/setupChecklist';
import { runSetupCheck, type CommerceRead, type SetupCheckResult, type SetupCheckScope } from '@/features/app-builder/services/setupChecks';
import {
    getAppBuilderComponentCatalog,
    getAppBuilderComponentEntry,
} from '@/features/components/services/appBuilderComponentCatalogLoader';
import { systemsUsedBy } from '@/features/components/services/appBuilderComponentLinks';
import type { SetupCheck, SetupChecklistItem, SetupStep } from '@/types/appBuilderComponents';
import type { AppBuilderComponentState, Project, SetupCheckOutcome, SetupStepRecord } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext, HandlerResponse, MessageHandler } from '@/types/handlers';

/** An integration with setup steps: the project, the component, its saved state and the steps. */
export interface OpenedChecklist {
    project: Project;
    id: string;
    state: AppBuilderComponentState;
    steps: SetupStep[];
}

type Opened = OpenedChecklist | { error: HandlerResponse };

/**
 * The component and the steps its entry declares, or the refusal. Shared with "Prepare this
 * store" (`storePreparationHandlers.ts`), which opens the same thing and then Commerce.
 */
export async function openChecklist(context: HandlerContext, idArg: unknown): Promise<Opened> {
    const target = await resolveComponentTarget(context, typeof idArg === 'string' ? idArg : undefined);
    if (!target.ok) return { error: target.error };
    const { id, project } = target;
    const state = getAppBuilderComponent(project, id);
    const steps = state ? getAppBuilderComponentEntry(state.catalogId ?? id)?.setupSteps : undefined;
    if (!state || !steps || steps.length === 0) {
        return {
            error: { success: false, error: `"${id}" has no setup steps.`, code: ErrorCode.INVALID_OPERATION },
        };
    }
    return { project, id, state, steps };
}

/**
 * The names of the ERPs the integration uses, as their cards show them, for a step value
 * entered once per ERP (`setupChecklistOf`). The same lookups the ERP list is built from.
 */
export function erpNamesOf(project: Project, integrationId: string): string[] {
    const catalog = getAppBuilderComponentCatalog();
    return systemsUsedBy(project, integrationId, catalog).map(
        (id) => project.appBuilderComponents?.[id]?.name ?? catalogEntryFor(project, id, catalog)?.name ?? id,
    );
}

/**
 * The checklist as the guide shows it: the ERPs' names and the integration's own Adobe project
 * and workspace in its values (its workspace when it has one of its own, else the project's).
 */
function checklistOf(project: Project, id: string, state: AppBuilderComponentState): SetupChecklistItem[] | undefined {
    const items = setupChecklistOf(id, state, erpNamesOf(project, id));
    const names = { project: project.adobe?.projectTitle, workspace: state.workspace?.title ?? project.adobe?.workspaceTitle };
    return items && withAdobeNames(items, names);
}

/** Save the component's step records and push the grid's snapshot. */
async function saveSteps(
    context: HandlerContext,
    opened: Extract<Opened, { project: Project }>,
    setupSteps: Record<string, SetupStepRecord>,
): Promise<HandlerResponse> {
    const next = { ...opened.state, setupSteps };
    await context.stateManager.saveProject(setAppBuilderComponent(opened.project, opened.id, next));
    await postComponentsSnapshot(context);
    return { success: true, data: { items: checklistOf(opened.project, opened.id, next) } };
}

/**
 * Handle 'getSetupChecklist' — the steps and where the SC is on each, as saved. Runs no
 * check (that is 'checkSetupSteps', which saves what it finds).
 */
export const handleGetSetupChecklist: MessageHandler<{ id?: string }> = async (context, payload) => {
    const opened = await openChecklist(context, payload?.id);
    if ('error' in opened) return opened.error;
    return { success: true, data: { items: checklistOf(opened.project, opened.id, opened.state) } };
};

const STATES = new Set(['done', 'dismissed', 'open']);

/** What a check concluded: set up, not set up, or it could not tell. */
export function outcomeOf(done: boolean | undefined): SetupCheckOutcome {
    if (done === undefined) return 'unknown';
    return done ? 'passed' : 'failed';
}

/** A passing check marks the step done, a failing one opens it, one that could not tell leaves it. */
export function stateAfterCheck(previous: SetupStepRecord['state'], done: boolean | undefined): SetupStepRecord['state'] {
    if (done === undefined) return previous;
    return done ? 'done' : undefined;
}

/** Handle 'setSetupStep' — mark one step done or dismissed, or open it again. */
export const handleSetSetupStep: MessageHandler<{ id?: string; stepId?: string; state?: string }> = async (
    context,
    payload,
) => {
    const opened = await openChecklist(context, payload?.id);
    if ('error' in opened) return opened.error;
    const step = opened.steps.find((candidate) => candidate.id === payload?.stepId);
    if (!step) {
        return { success: false, error: `There is no setup step "${payload?.stepId}".`, code: ErrorCode.CONFIG_INVALID };
    }
    if (!payload?.state || !STATES.has(payload.state)) {
        return { success: false, error: 'A step is marked done, dismissed or open.', code: ErrorCode.CONFIG_INVALID };
    }
    const { state: _previous, ...kept } = opened.state.setupSteps?.[step.id] ?? {};
    const record: SetupStepRecord = payload.state === 'open' ? kept : { ...kept, state: payload.state as 'done' | 'dismissed' };
    return saveSteps(context, opened, { ...opened.state.setupSteps, [step.id]: record });
};

/** The steps a check request covers: the one asked for, or every checkable one not dismissed. */
function stepsToCheck(
    opened: Extract<Opened, { project: Project }>,
    stepId: unknown,
): SetupStep[] | HandlerResponse {
    if (stepId === undefined) {
        return opened.steps.filter((step) => step.check && opened.state.setupSteps?.[step.id]?.state !== 'dismissed');
    }
    const step = opened.steps.find((candidate) => candidate.id === stepId);
    if (!step?.check) {
        return {
            success: false,
            error: `There is no setup step "${String(stepId)}" Demo Builder can check.`,
            code: ErrorCode.CONFIG_INVALID,
        };
    }
    return [step];
}

/**
 * The signed Commerce GET a check reads with, and the project's store scope. Shared with
 * "Prepare this store" (`storePreparationHandlers.ts`), which checks a step before it writes it.
 *
 * UNCUT and unbounded, unlike the agent tool's `sendRest`: that one cuts an answer at
 * 30,000 characters and pages a search at 20, which is right for a chat answer and fatal
 * for a check that parses the body (Justrite 2026-10-10: `products/attribute-sets/<id>/attributes`
 * answers more than that, and the attribute-set check died mid-JSON). The error lines keep
 * `sendRest`'s words, which the checks match on.
 */
export async function setupCheckReader(
    context: HandlerContext,
    project: Project,
    fetchImpl: typeof fetch = fetch,
): Promise<{ read: CommerceRead; scope: SetupCheckScope }> {
    const target = await resolveRestTarget(context, undefined, fetchImpl);
    const read = async (path: string): Promise<string> => {
        if ('refusal' in target) return target.refusal;
        const answer = await requestRest('GET', target, path, undefined, fetchImpl);
        if ('failed' in answer) return `Error: the request failed — ${answer.failed}`;
        return answer.ok
            ? answer.text
            : explainStatus(answer.status, answer.text, !target.clientId);
    };
    // The project's store, for a check of one website's own setting (Payment on Account).
    return { read, scope: { websiteCode: buildCommerceEndpoints(project).scope.websiteCode } };
}

/**
 * Handle 'checkSetupSteps' — run the checks the steps declare (a dismissed step is skipped),
 * save what each found, and answer the checklist. A check that passes marks its step done;
 * one that fails opens it again; one that cannot tell leaves the state alone. With a
 * `stepId`, only that step is checked: the setup guide asks one step at a time so the SC
 * watches each one land (owner, 2026-10-01); the agent tool asks for all at once.
 */
export const handleCheckSetupSteps: MessageHandler<{ id?: string; stepId?: string }> = async (context, payload) => {
    const opened = await openChecklist(context, payload?.id);
    if ('error' in opened) return opened.error;
    const steps = stepsToCheck(opened, payload?.stepId);
    if (!Array.isArray(steps)) return steps;
    const { read, scope } = await setupCheckReader(context, opened.project);
    const records = await checkedRecords(steps, opened.state.setupSteps, (check) => runSetupCheck(check, read, scope));
    return saveSteps(context, opened, records);
};

/**
 * The step records after the given steps are checked: a passing check marks its step done,
 * a failing one opens it, one that cannot tell leaves the state. Shared with "Prepare this
 * store", which rechecks the steps it applied or undid.
 */
export async function checkedRecords(
    steps: readonly SetupStep[],
    saved: Record<string, SetupStepRecord> | undefined,
    runCheck: (check: SetupCheck) => Promise<SetupCheckResult>,
): Promise<Record<string, SetupStepRecord>> {
    const records: Record<string, SetupStepRecord> = { ...saved };
    const checkedAt = new Date().toISOString();
    for (const step of steps) {
        if (!step.check) continue;
        const result = await runCheck(step.check);
        const { state: previous, ...kept } = records[step.id] ?? {};
        const state = stateAfterCheck(previous, result.done);
        records[step.id] = {
            ...kept,
            ...(state ? { state } : {}),
            note: result.note,
            lastCheck: outcomeOf(result.done),
            checkedAt,
        };
    }
    return records;
}

/**
 * Handle 'prepareSetupChecks' — sign in to Commerce ahead of a check, so the slow part (the
 * workspace credential, read from Adobe Console) is done before the SC presses Check all
 * steps. The setup guide sends it when it opens; a check pressed meanwhile joins the same
 * sign-in rather than starting another (`commerceRestClient`). Reads nothing from Commerce
 * and saves nothing. Answers whether a check could sign in now.
 */
export const handlePrepareSetupChecks: MessageHandler<{ id?: string }> = async (context, payload) => {
    const opened = await openChecklist(context, payload?.id);
    if ('error' in opened) return opened.error;
    const target = await resolveRestTarget(context, undefined, fetch);
    return { success: true, data: { ready: !('refusal' in target) } };
};
