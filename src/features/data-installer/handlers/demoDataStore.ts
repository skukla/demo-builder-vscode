/**
 * What the Clear Demo Data handlers share (datapack-simplification step 06): their deps, the plans
 * shown by token, opening the project's store, and the failure the screen and the agent read. The
 * check and Open Commerce Admin live in `demoDataHandlers.ts`, the clearing in `demoDataClear.ts`.
 *
 * @module features/data-installer/handlers/demoDataStore
 */

import type { DatapackRemovalChanges } from '../removalChanges';
import type { RecordFiles } from '../services/demoBuilderEngine/installRecord';
import type { RemovalAccess } from '../services/demoBuilderEngine/removers';
import {
    type ClaimsOptions,
    type WipeClaims,
    readWipeClaims,
} from '../services/demoDataWipe/wipeClaims';
import type { WipeErp } from '../services/demoDataWipe/wipeErp';
import type { WipePlan } from '../services/demoDataWipe/wipePlan';
import { WipeScopeError, readWipeStructure } from '../services/demoDataWipe/wipeReads';
import { classifyTransience } from '@/core/errors';
import type { AdminOpening } from '@/core/utils/commerceAdmin';
import type { ReportStage } from '@/core/vscode/withOperationProgress';
import type { SaveAsAnswer } from '@/features/eds/services/reset/edsResetSampleData';
import type { DatapackRemoval } from '@/features/eds/services/reset/resetDatapackStep';
import type { Project } from '@/types/base';
import type { CommerceStoreStructure } from '@/types/commerceStore';
import type { ProjectDatapack } from '@/types/datapack';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';

export const LOG_PREFIX = '[Data Installer]';

/** What the handlers need, handed in so a test drives them against a fake store. */
export interface DemoDataDeps {
    commerce: (
        context: HandlerContext,
        project: Project
    ) => Promise<RemovalAccess | { refusal: string }>;
    guard: (context: HandlerContext, project: Project) => Promise<string | undefined>;
    files: RecordFiles;
    /** Every other project on this machine, as the projects list reads them. */
    others: (context: HandlerContext, project: Project) => Promise<Project[]>;
    /** The ERP integration serving the project's Commerce instance, from any of those projects. */
    erp: (
        context: HandlerContext,
        project: Project,
        others: readonly Project[]
    ) => WipeErp | undefined;
    /** Opens the project's Commerce Admin: a type Commerce refused to read is looked at there. */
    openAdmin: (project: Project) => Promise<AdminOpening>;
    /**
     * Uninstalls the project's datapack through the engine's own removal, its changes settled with
     * the answer given (`removeProjectSampleDataOutcome`), clearing the pack on the project object it
     * is handed when everything came out (step-05 R1).
     */
    remove: (
        project: Project,
        context: HandlerContext,
        report: ReportStage,
        given: SaveAsAnswer,
        /** Products the wipe deletes right after (the shown list's): what they hold counts as going. */
        leaving: readonly string[]
    ) => Promise<DatapackRemoval>;
    /** What the project's datapack changed since it was installed (`readRemovalChangesOf`): asked about before a clearing with no answer. */
    changes: (context: HandlerContext, project: Project) => Promise<DatapackRemovalChanges | undefined>;
}

/** A plan shown, with the datapack the clearing uninstalls first and its name as the SC knows it. */
export interface ShownPlan {
    plan: WipePlan;
    removing?: { pack: ProjectDatapack; name: string };
}

/** The plans shown, by token, newest last; a few is plenty, since one is shown per question. */
export type ShownPlans = Map<string, ShownPlan>;

const PLANS_KEPT = 10;

export function keep(plans: ShownPlans, shown: ShownPlan): void {
    plans.set(shown.plan.check.token, shown);
    while (plans.size > PLANS_KEPT) plans.delete(plans.keys().next().value as string);
}

export const NO_PROJECT: HandlerResponse = { success: false, error: 'No project is open.' };

/** The project's store, read, with every other local project. */
export interface Opened {
    project: Project;
    commerce: RemovalAccess;
    structure: CommerceStoreStructure;
    others: Project[];
    erp?: WipeErp;
}

/** The failure code the Datapacks failure treatment reads, from what went wrong: signed out is Sign In, never Retry. */
export function codeOf(error: unknown): ErrorCode {
    const { kind } = classifyTransience(error);
    if (kind === 'auth') return ErrorCode.AUTH_REQUIRED;
    if (kind === 'timeout') return ErrorCode.TIMEOUT;
    return kind === 'network' ? ErrorCode.NETWORK : ErrorCode.UNKNOWN;
}

/** The open project's store, its structure and the other projects, or the response to answer instead. */
export async function openStore(
    deps: DemoDataDeps,
    context: HandlerContext,
): Promise<Opened | { response: HandlerResponse }> {
    const project = await context.stateManager.getCurrentProject();
    if (!project) return { response: NO_PROJECT };
    const mismatch = await deps.guard(context, project);
    if (mismatch)
        return { response: { success: false, error: mismatch, code: ErrorCode.ORG_MISMATCH } };
    const others = await deps.others(context, project);
    const commerce = await deps.commerce(context, project);
    if ('refusal' in commerce)
        return {
            response: { success: false, error: commerce.refusal, code: codeOf(commerce.refusal) },
        };
    const erp = deps.erp(context, project, others);
    return {
        project,
        commerce,
        others,
        structure: await readWipeStructure(commerce.get),
        ...(erp ? { erp } : {}),
    };
}

export function failure(
    context: HandlerContext,
    error: unknown,
    fallback: string,
): HandlerResponse {
    if (error instanceof WipeScopeError) return { success: false, error: error.message };
    context.logger.warn(
        `${LOG_PREFIX} ${fallback} ${error instanceof Error ? error.message : String(error)}`,
    );
    return { success: false, error: `${fallback} Details are in Debug Logs.`, code: codeOf(error) };
}

/** Which websites the project uses, and what to respect, read for this project. */
export const claimsOf = (
    deps: DemoDataDeps,
    opened: Opened,
    options: ClaimsOptions = {},
): Promise<WipeClaims> =>
    readWipeClaims(
        deps.files,
        opened.project,
        opened.others,
        opened.structure,
        { kind: 'project' },
        options,
    );
