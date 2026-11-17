/**
 * The project's Finish Setup steps (PL-101): what a run left for the SC, listed, marked (Skip,
 * Undo Skip, Mark as Done) and checked. The steps come from `finishSetupOf` (the project's record
 * and the datapack's install record); the guide that shows them is the integrations' own
 * (`SetupGuide`, `useSetupChecklist`), so these answer exactly as the integration checklist's
 * handlers do (`setupChecklistHandlers.ts`): `{ success: true, data: { items } }`, or a refusal.
 *
 * Checks read only. Republish the Code compares the live site with the repository
 * (`checkCodeStep`, never the publishing `confirmStorefrontCodeServed`); Set the Root Category
 * runs the datapack's own read-only check (`checkRecordedRootStep`), opening the store as every
 * datapack action does (`openProjectStore`: org guard first).
 *
 * Answers with its result (Pattern B).
 *
 * @module features/dashboard/handlers/finishSetupHandlers
 */

import { finishSetupOf } from '@/features/dashboard/services/finishSetup';
import { type CodeStepReads, checkCodeStep } from '@/features/dashboard/services/finishSetupChecks';
import { failure } from '@/features/data-installer/handlers/packSave';
import { openProjectStore } from '@/features/data-installer/handlers/storeChangesHandlers';
import { nodeRecordFiles } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import {
    checkRecordedRootStep,
    recordedRootStep,
} from '@/features/data-installer/services/demoBuilderEngine/packRootCheck';
import {
    PACK_ROOT_STEP_ID,
    type PackRootStep,
} from '@/features/data-installer/services/demoBuilderEngine/packRootStep';
import { getGitHubServices } from '@/features/eds/handlers/edsServiceCache';
import { REPUBLISH_CODE_STEP } from '@/features/eds/services/storefront/codeStepRecord';
import type { SetupChecklistItem } from '@/types/appBuilderComponents';
import type { FinishSetupRecord, Project } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext, HandlerResponse, MessageHandler } from '@/types/handlers';
import type {
    CheckFinishSetupStepsRequest,
    SetFinishSetupStepRequest,
} from '@/types/webviewRequests';

/** The open project and the step its datapack's install record holds. */
interface Opened {
    project: Project;
    packRoot?: PackRootStep;
}

type Refusal = { error: HandlerResponse };

const NO_PROJECT: HandlerResponse = {
    success: false,
    error: 'No project is open.',
    code: ErrorCode.PROJECT_NOT_FOUND,
};

/** The open project and its datapack's root step, or the refusal. Reads no store. */
async function openFinishSetup(context: HandlerContext): Promise<Opened | Refusal> {
    const project = await context.stateManager.getCurrentProject();
    if (!project) return { error: NO_PROJECT };
    const held = project.datapack;
    const packRoot = held
        ? await recordedRootStep(nodeRecordFiles, project.path, {
              name: held.name,
              version: held.version,
          })
        : undefined;
    return { project, ...(packRoot ? { packRoot } : {}) };
}

/** The steps as the guide lists them. */
function answer(opened: Opened): HandlerResponse {
    return { success: true, data: { items: finishSetupOf(opened.project, opened.packRoot) } };
}

/** Save the project with one step's record replaced (removed when empty, the map too). */
async function saveRecord(
    context: HandlerContext,
    opened: Opened,
    stepId: string,
    record: FinishSetupRecord,
): Promise<Opened> {
    const { [stepId]: _old, ...rest } = opened.project.finishSetup ?? {};
    const records = Object.keys(record).length > 0 ? { ...rest, [stepId]: record } : rest;
    const { finishSetup: _was, ...base } = opened.project;
    const project: Project =
        Object.keys(records).length > 0 ? { ...base, finishSetup: records } : base;
    await context.stateManager.saveProject(project);
    return { ...opened, project };
}

/** The step named, among the ones the project lists, or the refusal. */
function stepNamed(
    opened: Opened,
    stepId: unknown,
    which: string,
): SetupChecklistItem | HandlerResponse {
    const step = finishSetupOf(opened.project, opened.packRoot).find((item) => item.id === stepId);
    return (
        step ?? {
            success: false,
            error: `There is no step "${String(stepId)}" ${which}.`,
            code: ErrorCode.CONFIG_INVALID,
        }
    );
}

/** Handle 'getFinishSetup' — the steps and where the SC is on each, as saved. Runs no check. */
export const handleGetFinishSetup: MessageHandler = async (context) => {
    const opened = await openFinishSetup(context);
    return 'error' in opened ? opened.error : answer(opened);
};

const STATES = new Set(['done', 'dismissed', 'open']);

/** Handle 'setFinishSetupStep' — Mark as Done (done), Skip (dismissed), or Undo Skip (open). */
export const handleSetFinishSetupStep: MessageHandler<SetFinishSetupStepRequest> = async (
    context,
    payload,
) => {
    const opened = await openFinishSetup(context);
    if ('error' in opened) return opened.error;
    const step = stepNamed(opened, payload?.stepId, 'to finish');
    if ('success' in step) return step;
    if (!payload?.state || !STATES.has(payload.state)) {
        return {
            success: false,
            error: 'A step is marked done, dismissed or open.',
            code: ErrorCode.CONFIG_INVALID,
        };
    }
    const { state: _previous, ...kept } = opened.project.finishSetup?.[step.id] ?? {};
    const record: FinishSetupRecord =
        payload.state === 'open' ? kept : { ...kept, state: payload.state as 'done' | 'dismissed' };
    return answer(await saveRecord(context, opened, step.id, record));
};

/**
 * The root step's check. Its install record says where it stands, so a check that could tell
 * clears the Skip or Mark as Done the SC gave it on the project.
 */
async function checkRoot(context: HandlerContext, opened: Opened): Promise<Opened | Refusal> {
    const held = opened.project.datapack;
    if (!held) return opened;
    const store = await openProjectStore(context);
    if ('response' in store) return { error: store.response };
    try {
        const deps = { commerce: store.deps.commerce, projectPath: opened.project.path };
        const packRoot = await checkRecordedRootStep(deps, {
            name: held.name,
            version: held.version,
        });
        const next: Opened = { ...opened, ...(packRoot ? { packRoot } : {}) };
        const given = opened.project.finishSetup?.[PACK_ROOT_STEP_ID];
        if (!given?.state || packRoot?.lastCheck === 'unknown') return next;
        const { state: _given, ...kept } = given;
        return await saveRecord(context, next, PACK_ROOT_STEP_ID, kept);
    } catch (error) {
        return { error: failure(context, error, 'The step could not be checked.') };
    }
}

/** The code step's check, saved. */
async function checkCode(
    context: HandlerContext,
    opened: Opened,
    reads: CodeStepReads,
): Promise<Opened> {
    const project = await checkCodeStep(opened.project, reads);
    if (!project) return opened;
    await context.stateManager.saveProject(project);
    return { ...opened, project };
}

/** The steps a check request covers: the one asked for, or every checkable one not skipped. */
function stepsToCheck(opened: Opened, stepId: unknown): SetupChecklistItem[] | HandlerResponse {
    if (stepId === undefined) {
        return finishSetupOf(opened.project, opened.packRoot).filter(
            (item) => item.checkable && item.state !== 'dismissed',
        );
    }
    const step = stepNamed(opened, stepId, 'Demo Builder can check');
    return 'success' in step ? step : [step];
}

/**
 * Handle 'checkFinishSetupSteps' — run the checks (one step when `stepId` is sent, as the guide
 * asks; else every one not skipped), save what each found, and answer the steps. A check that
 * passes marks its step done; one that fails opens it; one that cannot tell leaves it.
 */
export const handleCheckFinishSetupSteps: MessageHandler<CheckFinishSetupStepsRequest> = async (
    context,
    payload,
) => {
    const first = await openFinishSetup(context);
    if ('error' in first) return first.error;
    const steps = stepsToCheck(first, payload?.stepId);
    if (!Array.isArray(steps)) return steps;
    let opened: Opened = first;
    for (const step of steps) {
        const next: Opened | Refusal =
            step.id === REPUBLISH_CODE_STEP
                ? await checkCode(
                      context,
                      opened,
                      getGitHubServices(context.context.secrets).fileOperations,
                  )
                : await checkRoot(context, opened);
        if ('error' in next) return next.error;
        opened = next;
    }
    return answer(opened);
};

/**
 * Handle 'prepareFinishSetupChecks' — what the guide sends as it opens. The integrations' sign in
 * to Commerce ahead (`handlePrepareSetupChecks`); these have nothing to warm: the code check reads
 * GitHub and the site, and the root check opens the store as every datapack action does. Answers
 * the steps, as 'getFinishSetup' does.
 */
export const handlePrepareFinishSetupChecks: MessageHandler = async (context) =>
    handleGetFinishSetup(context, undefined);

/**
 * After a Republish: check the project's Republish the Code step, so it turns done when the site
 * now serves its files. Nothing when the project has no such step. Never throws: the Republish
 * has succeeded whatever this finds.
 *
 * @param reads - the repository reads the Republish already holds
 */
export async function recheckCodeStep(
    context: HandlerContext,
    reads: CodeStepReads,
): Promise<void> {
    try {
        const project = await context.stateManager.getCurrentProject();
        if (project?.finishSetup?.[REPUBLISH_CODE_STEP])
            await checkCode(context, { project }, reads);
    } catch (error) {
        context.logger.warn(
            `[Finish Setup] Could not check the code step after Republish: ${(error as Error).message}`,
        );
    }
}
