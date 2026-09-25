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
import { resolveRestTarget, sendRest } from '@/features/ai/server/commerceRestClient';
import { setupChecklistOf } from '@/features/app-builder/services/setupChecklist';
import { runSetupCheck } from '@/features/app-builder/services/setupChecks';
import { getAppBuilderComponentEntry } from '@/features/components/services/appBuilderComponentCatalogLoader';
import type { SetupStep } from '@/types/appBuilderComponents';
import type { AppBuilderComponentState, Project, SetupStepRecord } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext, HandlerResponse, MessageHandler } from '@/types/handlers';

type Opened =
    | { project: Project; id: string; state: AppBuilderComponentState; steps: SetupStep[] }
    | { error: HandlerResponse };

/** The component and the steps its entry declares, or the refusal. */
async function openChecklist(context: HandlerContext, idArg: unknown): Promise<Opened> {
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

/** Save the component's step records and push the grid's snapshot. */
async function saveSteps(
    context: HandlerContext,
    opened: Extract<Opened, { project: Project }>,
    setupSteps: Record<string, SetupStepRecord>,
): Promise<HandlerResponse> {
    const next = { ...opened.state, setupSteps };
    await context.stateManager.saveProject(setAppBuilderComponent(opened.project, opened.id, next));
    await postComponentsSnapshot(context);
    return { success: true, data: { items: setupChecklistOf(opened.id, next) } };
}

/**
 * Handle 'getSetupChecklist' — the steps and where the SC is on each, as saved. Runs no
 * check (that is 'checkSetupSteps', which saves what it finds).
 */
export const handleGetSetupChecklist: MessageHandler<{ id?: string }> = async (context, payload) => {
    const opened = await openChecklist(context, payload?.id);
    if ('error' in opened) return opened.error;
    return { success: true, data: { items: setupChecklistOf(opened.id, opened.state) } };
};

const STATES = new Set(['done', 'dismissed', 'open']);

/** A passing check marks the step done, a failing one opens it, one that could not tell leaves it. */
function stateAfterCheck(previous: SetupStepRecord['state'], done: boolean | undefined): SetupStepRecord['state'] {
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

/**
 * Handle 'checkSetupSteps' — run every check the steps declare (a dismissed step is
 * skipped), save what each found, and answer the checklist. A check that passes marks its
 * step done; one that fails opens it again; one that cannot tell leaves the state alone.
 */
export const handleCheckSetupSteps: MessageHandler<{ id?: string }> = async (context, payload) => {
    const opened = await openChecklist(context, payload?.id);
    if ('error' in opened) return opened.error;
    const target = await resolveRestTarget(context, undefined, fetch);
    const read = (path: string): Promise<string> =>
        'refusal' in target ? Promise.resolve(target.refusal) : sendRest('GET', target, path, undefined, fetch);
    const records: Record<string, SetupStepRecord> = { ...opened.state.setupSteps };
    const checkedAt = new Date().toISOString();
    for (const step of opened.steps) {
        const saved = records[step.id] ?? {};
        if (!step.check || saved.state === 'dismissed') continue;
        const result = await runSetupCheck(step.check, read);
        const { state: previous, ...kept } = saved;
        const state = stateAfterCheck(previous, result.done);
        records[step.id] = { ...kept, ...(state ? { state } : {}), note: result.note, checkedAt };
    }
    return saveSteps(context, opened, records);
};
