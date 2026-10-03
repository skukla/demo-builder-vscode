/**
 * `addErp` — "Add another ERP" on the ERP integration's card (AB-16, design v1 "Adding an ERP
 * in Demo Builder").
 *
 * The integration is added once; more ERPs are added beside it. Each is a demo-erp system of
 * its own (`demo-erp-2`, …) in a workspace of its own, named as the SC typed it, and deployed
 * with its id in the integration's list (`ERP_ID`, `listIdOf`). Once deployed it is linked to
 * the integration, the integration is told the whole ERP list (`PUT erp/erps`), each added ERP
 * with its own workspace's credential (AB-16a), each ERP's ownership rule is saved on its entry
 * (AB-64: the one the SC chose in the dialog, or the default when the agent gave none), and the
 * new ERP is filled from Commerce, its key map rows carrying its id. The rule is saved BEFORE
 * the fill, which reads it; an existing ERP whose rule changed is not refilled here, and the
 * answer says its products change at its next reset or Load demo data.
 *
 * Adding again with the name of an ERP whose add stopped partway finishes it: a failed deploy
 * is retried, and a deployed one that the list or the fill missed is listed and filled. The
 * list sent then carries every added ERP's credential, which is also how an ERP added before
 * AB-16a gets its credential to the integration.
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
import type { AppManagementAuth } from '@/features/app-builder/services/appManagementClient';
import { catalogEntryFor } from '@/features/app-builder/services/componentEntry';
import { erpCredentialReader } from '@/features/app-builder/services/erpCredential';
import type { ErpMappingReport } from '@/features/app-builder/services/erpFillMapping';
import { ErpIntegrationClient } from '@/features/app-builder/services/erpIntegrationClient';
import { erpListIdOf, erpNameProblem, nextListedSystemId } from '@/features/app-builder/services/erpList';
import {
    defaultOwnsRule,
    describeOwns,
    existingRulesToChange,
    ownsProblem,
} from '@/features/app-builder/services/erpOwnership';
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
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
import {
    readErpOwnershipOptionsForProject,
    saveErpOwnership,
} from '@/features/project-creation/services/erpOwnershipSync';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { Project } from '@/types/base';
import type { ErpOwnsEntry, ErpOwnsRule } from '@/types/erpOwnership';
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
    /** The rule the SC chose (AB-64); absent = the default, derived from the store at add time. */
    owns?: ErpOwnsRule;
    /** Existing ERPs' rules sent with it (the first ERP's, once it stops owning everything). */
    existingOwns: ErpOwnsEntry[];
}

/** One ERP's rule as the answer says it: its list id, the rule, and the rule in words. */
interface OwnsSaid {
    erp: string;
    rule: ErpOwnsRule;
    describe: string;
}

type AddOutcome = GuardableResult & {
    listed?: string[];
    filled?: boolean;
    /** What the add could not do though it stood: the answer's warning, and the progress window's. */
    warning?: string;
    /** The website mappings the new ERP's fill filled and kept (AB-26y). */
    mapping?: ErpMappingReport;
    owns?: OwnsSaid;
    existingOwns?: OwnsSaid[];
};

/**
 * An ADDED ERP of this name whose add can be finished: one the integration uses (its list or
 * fill may have been missed), or one of the ERP's kind that was never linked, whether its deploy
 * failed or landed (an add that stopped between the deploy and the link, as one did on Bodea on
 * 2026-09-28). Only an added ERP carries `catalogId`, so the integration's own ERP is never
 * one: its name is simply taken.
 */
function unfinishedNamed(project: Project, integrationId: string, system: AppBuilderComponentCatalogEntry, name: string): string | undefined {
    const lower = name.toLowerCase();
    const named = (id: string) => project.appBuilderComponents?.[id]?.name?.trim().toLowerCase() === lower;
    const linked = systemsUsedBy(project, integrationId, getAppBuilderComponentCatalog()).find(
        (id) => named(id) && isAddedSystem(project, id, integrationId),
    );
    if (linked) return linked;
    return Object.entries(project.appBuilderComponents ?? {}).find(
        ([id, state]) =>
            state.catalogId === system.id && (state.status === 'error' || state.status === 'deployed') && named(id),
    )?.[0];
}

/** Why a rule in the payload cannot be saved (AB-64), the new ERP's or an existing one's. */
function ownsPayloadProblem(payload: AddErpRequestPayload | undefined): string | undefined {
    const rules = [payload?.owns, ...(payload?.existingOwns ?? []).map((entry) => entry.owns)];
    for (const rule of rules) {
        const problem = rule && ownsProblem(rule);
        if (problem) return problem;
    }
    return undefined;
}

/** The integration an ERP can be added to: one that serves several ERPs, and is deployed. */
function servingIntegration(
    project: Project,
    integrationId: string,
    catalog: readonly AppBuilderComponentCatalogEntry[],
): { system: AppBuilderComponentCatalogEntry } | { error: HandlerResponse } {
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
    return { system };
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
    const served = servingIntegration(project, integrationId, catalog);
    if ('error' in served) return served;
    const { system } = served;
    const name = payload?.name?.trim() ?? '';
    const retryId = name ? unfinishedNamed(project, integrationId, system, name) : undefined;
    // The name, then the rules (AB-64): both are the SC's input, refused the same way.
    const problem = erpNameProblem(project, name, retryId) ?? ownsPayloadProblem(payload);
    if (problem) return { error: { success: false, error: problem, code: ErrorCode.CONFIG_INVALID } };
    const id = retryId ?? nextListedSystemId(project, system);
    const entry = catalogEntryFor(project, id, catalog) ?? { ...system, id, catalogId: system.id };
    const deployed = project.appBuilderComponents?.[id]?.status === 'deployed';
    return {
        integrationId,
        project,
        entry: { ...entry, id, catalogId: system.id },
        name,
        deployed,
        owns: payload?.owns,
        existingOwns: payload?.existingOwns ?? [],
    };
}

/** The new ERP's rule and the existing ERPs' to save with it; a refusal when the store could not be read. */
async function ownershipToSave(
    plan: ErpAddPlan,
    listId: string,
    auth: AppManagementAuth,
    authManager: AuthenticationService,
): Promise<ErpOwnsEntry[] | { refusal: string }> {
    if (plan.owns) return [{ erp: listId, owns: plan.owns }, ...plan.existingOwns];
    // No rule given (the agent surface): the default, from the store as it stands (AB-64).
    const options = await readErpOwnershipOptionsForProject(plan.project, plan.integrationId, auth, authManager);
    if ('refusal' in options) return options;
    const erps = options.erps.filter((erp) => erp.erp !== listId);
    const owns = defaultOwnsRule({ websites: options.websites, erps, listId });
    return [{ erp: listId, owns }, ...existingRulesToChange({ websites: options.websites, erps }, owns)];
}

/** Save each rule onto its ERP's list entry; the reason when the integration refused one. */
async function saveOwnership(
    plan: ErpAddPlan,
    entries: ErpOwnsEntry[],
    auth: AppManagementAuth,
): Promise<string | undefined> {
    const integration = plan.project.appBuilderComponents?.[plan.integrationId];
    try {
        await saveErpOwnership(new ErpIntegrationClient(integration?.deployedUrls, auth), entries);
        return undefined;
    } catch (error) {
        return error instanceof Error ? error.message : String(error);
    }
}

/**
 * The ownership step of an add: the rules to save (the SC's, or the default read from the
 * store), saved onto each ERP's list entry. The reason when either did not go through. The
 * sign-in is in hand: the list sync before this step has already failed without one.
 */
async function saveOwnershipStep(
    plan: ErpAddPlan,
    auth: AppManagementAuth | undefined,
    authManager: AuthenticationService,
): Promise<{ entries: ErpOwnsEntry[] } | { notSaved: string }> {
    if (!auth) return { notSaved: 'Adobe sign-in required.' };
    const { project, entry } = plan;
    const listId = erpListIdOf(project, entry.id, getAppBuilderComponentCatalog()) ?? entry.id;
    const entries = await ownershipToSave(plan, listId, auth, authManager);
    if ('refusal' in entries) return { notSaved: entries.refusal };
    const notSaved = await saveOwnership(plan, entries, auth);
    return notSaved ? { notSaved } : { entries };
}

/** The name an existing ERP goes by in the answer's warning, found by its list id. */
function erpNameOf(project: Project, listId: string): string {
    const catalog = getAppBuilderComponentCatalog();
    const found = Object.entries(project.appBuilderComponents ?? {}).find(
        ([id]) => erpListIdOf(project, id, catalog) === listId,
    );
    return found?.[1].name ?? listId;
}

/** What the answer says about the rules saved: each in words, and the warning for the existing ERPs. */
function ownsSaid(plan: ErpAddPlan, entries: ErpOwnsEntry[]): Pick<AddOutcome, 'owns' | 'existingOwns'> & { notes: string[] } {
    const said = entries.map((entry): OwnsSaid => ({ erp: entry.erp, rule: entry.owns, describe: describeOwns(entry.owns) }));
    const [owns, ...existingOwns] = said;
    const notes = existingOwns.map(
        (entry) => `${erpNameOf(plan.project, entry.erp)}'s products change at its next Reset ERPs or Load demo data.`,
    );
    return { owns, existingOwns, notes };
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
    const readCredential = erpCredentialReader(ServiceLocator.getCommandExecutor(), project, authManager.getCachedOrganization());
    const listed = await syncErpList(project, integrationId, auth, { readCredential });
    if (listed.status === 'failed') {
        return {
            success: false,
            error: `${plan.name} is deployed, but the integration was not told about it: ${sentence(listed.detail)} Add it again with the same name to finish.`,
        };
    }
    // Which products it owns, saved before the fill reads it (AB-64).
    report(OPERATION_STAGES.adding.label, 'Saving which products each ERP owns');
    const saved = await saveOwnershipStep(plan, auth, authManager);
    if ('notSaved' in saved) {
        return {
            success: false,
            error: `${plan.name} is deployed and listed, but ${sentence(saved.notSaved)} Add it again with the same name to finish.`,
        };
    }
    const { owns, existingOwns, notes: ownsNotes } = ownsSaid(plan, saved.entries);
    const filled = await fillErpForProject(
        project,
        integrationId,
        { authManager, getAuth: async () => auth, onProgress: (step) => report(OPERATION_STAGES.loadingErpDemoData.label, step) },
        entry.id,
    );
    // A credential the list could not carry (AB-16a) and a fill that did not finish are
    // both said, and the add stands.
    const notes = [...listed.warnings, ...ownsNotes];
    // Prices not published after the fill (AB-26z).
    if (filled.status === 'filled' && filled.note) notes.push(filled.note);
    if (filled.status !== 'filled') notes.push(`Demo data did not load: ${sentence(filled.detail)} Use Load demo data on its card.`);
    const warning = notes.length ? { warning: notes.join(' ') } : {};
    const mapping = filled.status === 'filled' && filled.mapping ? { mapping: filled.mapping } : {};
    return { success: true, listed: listed.ids, filled: filled.status === 'filled', owns, existingOwns, ...mapping, ...warning };
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
                owns: outcome.owns,
                existingOwns: outcome.existingOwns,
                ...(outcome.mapping ? { mapping: outcome.mapping } : {}),
                ...(outcome.warning ? { warning: outcome.warning } : {}),
            },
        };
    },
    (payload) => payload?.id ?? '',
);
