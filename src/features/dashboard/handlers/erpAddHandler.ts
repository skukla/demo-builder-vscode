/**
 * `addErp` — "Add another ERP" on the ERP integration's card (AB-16, design v1 "Adding an ERP
 * in Demo Builder").
 *
 * The integration is added once; more ERPs are added beside it. Each is a demo-erp system of
 * its own (`demo-erp-2`, …) in a workspace of its own, named as the SC typed it, and deployed
 * with its id in the integration's list (`ERP_ID`, `listIdOf`). Once deployed it is linked to
 * the integration, the integration is told the whole ERP list (`PUT erp/erps`), and the new
 * ERP is filled from Commerce, its key map rows carrying its id.
 *
 * Adding again with the name of an ERP whose add stopped partway finishes it: a failed deploy
 * is retried, and a deployed one that the list or the fill missed is listed and filled.
 * Removing is the ordinary Remove on the ERP's own card (`removeAppBuilderComponent` takes an
 * added ERP out of the list first); removing the integration removes every ERP.
 *
 * @module features/dashboard/handlers/erpAddHandler
 */

import {
    buildToolchainConsent,
    guardOrBlock,
    postComponentsSnapshot,
    refreshProjectStatus,
    resolveComponentTarget,
    type GuardableResult,
} from './appBuilderComponentHandlers';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import { narrateOutcomeToModal, progressSurfaceOf } from '@/core/vscode/operationProgress';
import { withOperationProgress } from '@/core/vscode/withOperationProgress';
import { addAppBuilderComponent } from '@/features/app-builder/services/appBuilderComponentRunner';
import { catalogEntryFor } from '@/features/app-builder/services/componentEntry';
import { erpNameProblem, nextListedSystemId } from '@/features/app-builder/services/erpList';
import { getAppBuilderComponentCatalog } from '@/features/components/services/appBuilderComponentCatalogLoader';
import {
    isAddedSystem,
    linkComponents,
    listedSystemOf,
    systemsUsedBy,
} from '@/features/components/services/appBuilderComponentLinks';
import {
    buildDefaultRunnerDeps,
    buildRunnerDepsContext,
    resolveAppManagementAuth,
} from '@/features/project-creation/services/appBuilderComponentRunnerDeps';
import { fillErpForProject } from '@/features/project-creation/services/erpFillForProject';
import { syncErpList } from '@/features/project-creation/services/erpListSync';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { Project } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext, HandlerResponse, MessageHandler } from '@/types/handlers';
import type { AddErpRequestPayload } from '@/types/webviewRequests';

/** The add, resolved: the integration, the new ERP's entry, and whether it is already deployed. */
interface ErpAddPlan {
    integrationId: string;
    project: Project;
    entry: AppBuilderComponentCatalogEntry;
    name: string;
    /** Deployed by an earlier add that stopped after its deploy: list and fill only. */
    deployed: boolean;
}

type AddOutcome = GuardableResult & { listed?: string[]; filled?: boolean; fillNote?: string };

/**
 * An ADDED ERP of this name whose add can be finished: one the integration uses (its list or
 * fill may have been missed), or one whose deploy failed before it was linked. The
 * integration's own ERP is never one: its name is simply taken.
 */
function unfinishedNamed(project: Project, integrationId: string, system: AppBuilderComponentCatalogEntry, name: string): string | undefined {
    const lower = name.toLowerCase();
    const named = (id: string) => project.appBuilderComponents?.[id]?.name?.trim().toLowerCase() === lower;
    const linked = systemsUsedBy(project, integrationId, getAppBuilderComponentCatalog()).find(
        (id) => named(id) && isAddedSystem(project, id, integrationId),
    );
    if (linked) return linked;
    return Object.entries(project.appBuilderComponents ?? {}).find(
        ([id, state]) => state.catalogId === system.id && state.status === 'error' && named(id),
    )?.[0];
}

/** Resolve what the add will do, or the refusal that stops it before anything runs. */
async function planErpAdd(
    context: HandlerContext,
    payload: AddErpRequestPayload | undefined,
): Promise<ErpAddPlan | { error: HandlerResponse }> {
    const target = await resolveComponentTarget(context, payload?.id);
    if (!target.ok) return { error: target.error };
    const { id: integrationId, project } = target;
    const catalog = getAppBuilderComponentCatalog();
    const integration = project.appBuilderComponents?.[integrationId];
    const system = integration ? listedSystemOf(integration.catalogId ?? integrationId, catalog) : undefined;
    if (!integration || integration.kind !== 'integration' || !system) {
        const error = `"${integration?.name ?? integrationId}" does not serve several ERPs.`;
        return { error: { success: false, error, code: ErrorCode.INVALID_OPERATION } };
    }
    if (integration.status !== 'deployed') {
        const error = `"${integration.name ?? integrationId}" must be deployed before another ERP is added to it.`;
        return { error: { success: false, error, code: ErrorCode.INVALID_OPERATION } };
    }
    const name = payload?.name?.trim() ?? '';
    const retryId = name ? unfinishedNamed(project, integrationId, system, name) : undefined;
    const problem = erpNameProblem(project, name, retryId);
    if (problem) return { error: { success: false, error: problem, code: ErrorCode.CONFIG_INVALID } };
    const id = retryId ?? nextListedSystemId(project, system);
    const entry = catalogEntryFor(project, id, catalog) ?? { ...system, id, catalogId: system.id };
    const deployed = project.appBuilderComponents?.[id]?.status === 'deployed';
    return { integrationId, project, entry: { ...entry, id, catalogId: system.id }, name, deployed };
}

/** Record the typed name where the ERP's deploy reads it, so its workspace and card carry it. */
async function recordName(context: HandlerContext, plan: ErpAddPlan): Promise<void> {
    const key = plan.entry.nameFromEnvVar;
    if (!key) return;
    const { project, entry } = plan;
    project.componentConfigs = {
        ...(project.componentConfigs ?? {}),
        [entry.id]: { ...(project.componentConfigs?.[entry.id] ?? {}), [key]: plan.name },
    };
    await context.stateManager.saveProject(project);
}

/**
 * After the ERP is deployed: link it, list every ERP with the integration, fill the new one.
 * A list that could not be sent fails the add (the integration would not route to the ERP);
 * a fill that did not finish is said, and Load demo data on the ERP's card runs it again.
 */
async function listAndFill(
    context: HandlerContext,
    plan: ErpAddPlan,
    report: (stage: string, step?: string) => void,
): Promise<AddOutcome> {
    const { project, integrationId, entry } = plan;
    linkComponents(project, integrationId, entry.id, getAppBuilderComponentCatalog());
    await context.stateManager.saveProject(project);
    const authManager = ServiceLocator.getAuthenticationService();
    const auth = await resolveAppManagementAuth(project, authManager);
    report(OPERATION_STAGES.adding.label, 'Telling the integration about its ERPs');
    const listed = await syncErpList(project, integrationId, auth);
    if (listed.status === 'failed') {
        return {
            success: false,
            error: `${plan.name} is deployed, but the integration was not told about it: ${sentence(listed.detail)} Add it again with the same name to finish.`,
        };
    }
    const filled = await fillErpForProject(
        project,
        integrationId,
        { authManager, getAuth: async () => auth, onProgress: (step) => report(OPERATION_STAGES.loadingErpDemoData.label, step) },
        entry.id,
    );
    return filled.status === 'filled'
        ? { success: true, listed: listed.ids, filled: true }
        : { success: true, listed: listed.ids, filled: false, fillNote: `Demo data did not load: ${sentence(filled.detail)} Use Load demo data on its card.` };
}

/** A reason as a sentence: ending in a full stop, whether or not it came with one. */
function sentence(text: string): string {
    return /[.!?]$/u.test(text) ? text : `${text}.`;
}

/** Deploy the new ERP in its own workspace, unless an earlier add already did. */
async function deployUnlessDone(
    context: HandlerContext,
    plan: ErpAddPlan,
    report: (stage: string, step?: string) => void,
): Promise<GuardableResult> {
    if (plan.deployed) return { success: true };
    await recordName(context, plan);
    report(OPERATION_STAGES.addingSystem.label, `Adding ${plan.name}`);
    const deps = buildDefaultRunnerDeps(
        await buildRunnerDepsContext(context, plan.project, {
            authManager: ServiceLocator.getAuthenticationService(),
            commandManager: ServiceLocator.getCommandExecutor(),
        }),
        (message, subMessage) => report(message, subMessage),
        buildToolchainConsent(context, false),
    );
    return addAppBuilderComponent(plan.project, plan.entry, deps);
}

/**
 * Handle 'addErp' — add another ERP to the ERP integration, by the name the SC typed.
 */
export const handleAddErp: MessageHandler<AddErpRequestPayload> = narrateOutcomeToModal(
    async (context, payload): Promise<HandlerResponse> => {
        const plan = await planErpAdd(context, payload);
        if ('error' in plan) return plan.error;
        const outcome = await withOperationProgress(
            {
                id: plan.integrationId,
                title: `Adding ${plan.name}`,
                inModal: progressSurfaceOf(payload) === 'modal',
                cardLabel: `Adding ${plan.name}`,
            },
            async (report): Promise<AddOutcome> => {
                const refused = await guardOrBlock(context, plan.project, (message) => report(message), progressSurfaceOf(payload));
                if (refused) return refused;
                const deployed = await deployUnlessDone(context, plan, report);
                if (!deployed.success) return deployed;
                return listAndFill(context, plan, report);
            },
        );
        await postComponentsSnapshot(context);
        await refreshProjectStatus(context);
        if (outcome.blocked || !outcome.success) return { success: false, error: outcome.error, code: outcome.code };
        return {
            success: true,
            data: {
                added: { id: plan.entry.id, name: plan.name, kind: 'system' },
                integration: plan.integrationId,
                erpList: outcome.listed,
                ...(outcome.fillNote ? { warning: outcome.fillNote } : {}),
            },
        };
    },
    (payload) => payload?.id ?? '',
);
