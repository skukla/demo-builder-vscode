/**
 * `addErp` — "Add another ERP" on the ERP integration's card (AB-16, design v1 "Adding an ERP
 * in Demo Builder").
 *
 * The integration is added once; more ERPs are added beside it. Each is a demo-erp system of
 * its own (`demo-erp-2`, …) in a workspace of its own, named as the SC typed it, and deployed
 * with its id in the integration's list (`ERP_ID`, `listIdOf`). Once deployed it is linked to
 * the integration, the integration is told the whole ERP list (`PUT erp/erps`), each added ERP
 * with its own workspace's credential (AB-16a), each ERP's ownership rule is saved on its entry
 * (AB-64: the one the SC chose in the dialog, or the default when the agent gave none), and
 * ownership is applied across every ERP (AB-70, `applyErpOwnership`): each filled with what it
 * now owns, what an ERP no longer owns marked discontinued there, and what the SC still has to
 * do said in the answer's warning. The rules are saved BEFORE the pass, which reads them. Once linked, an ERP this
 * add deployed is given a theme no other ERP shows when its own starting theme is another's
 * (AB-51, `erpAddTheme.ts`); the answer's `theme` says which.
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
import { giveAddedErpItsOwnTheme, type ErpAddTheme } from './erpAddTheme';
import { sentence } from './erpCall';
import { replaceDeployedElsewhere } from './replaceDeployedElsewhere';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import { narrateOutcomeToModal, progressSurfaceOf } from '@/core/vscode/operationProgress';
import { withOperationProgress } from '@/core/vscode/withOperationProgress';
import { addAppBuilderComponent } from '@/features/app-builder/services/appBuilderComponentRunner';
import type { AppManagementAuth } from '@/features/app-builder/services/appManagementClient';
import { catalogEntryFor } from '@/features/app-builder/services/componentEntry';
import { erpCredentialReader } from '@/features/app-builder/services/erpCredential';
import { mergeMappings, type ErpMappingReport } from '@/features/app-builder/services/erpFillMapping';
import { ErpIntegrationClient } from '@/features/app-builder/services/erpIntegrationClient';
import { erpListIdOf, nextListedSystemId, takenSystemNames } from '@/features/app-builder/services/erpList';
import {
    defaultOwnsRule,
    describeOwns,
    existingRulesToChange,
    ownsProblem,
} from '@/features/app-builder/services/erpOwnership';
import { erpNameProblem, systemWordOf, withSystemWord } from '@/features/app-builder/services/pairNames';
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
import type { ErpFillOutcomes } from '@/features/project-creation/services/erpFillForProject';
import { syncErpList } from '@/features/project-creation/services/erpListSync';
import { applyErpOwnership, type ApplyOwnershipOutcome } from '@/features/project-creation/services/erpOwnershipReconcile';
import {
    readErpOwnershipOptionsForProject,
    saveErpOwnership,
} from '@/features/project-creation/services/erpOwnershipSync';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { Project } from '@/types/base';
import type { ErpThemeId } from '@/types/erpDemoControls';
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
    /** The theme Demo Builder gave the new ERP, when it looked like another (AB-51). */
    theme?: ErpThemeId;
    /** What the ownership pass did per ERP (AB-70): what each owns now, what was marked, what nobody owns. */
    ownership?: { erps: Array<{ erp: string; name: string; owns: number; discontinued: number }>; unowned: number };
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
    // Not in THIS project is its own answer: on 2026-10-09 an agent's create_project made a
    // new project current under an open Integrations screen, and "Add another ERP" there was
    // told the integration "does not serve several ERPs", which sent the owner looking at the
    // wrong thing.
    if (!integration) {
        const error = `"${integrationId}" is not in the current project (${project.name}). Open the project that has it.`;
        return { error: { success: false, error, code: ErrorCode.PROJECT_NOT_FOUND } };
    }
    const system = listedSystemOf(integration.catalogId ?? integrationId, catalog);
    if (integration.kind !== 'integration' || !system) {
        const error = `"${integration.name ?? integrationId}" does not serve several ERPs.`;
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
    // An ERP's name ends in what it is, as the pair's does (pairNames): "Accuform" → "Accuform ERP".
    const name = withSystemWord(payload?.name?.trim() ?? '', systemWordOf(system));
    const retryId = name ? unfinishedNamed(project, integrationId, system, name) : undefined;
    // The name, then the rules (AB-64): both are the SC's input, refused the same way.
    const problem = erpNameProblem(name, takenSystemNames(project, retryId)) ?? ownsPayloadProblem(payload);
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
    const owns = defaultOwnsRule({ listId });
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

/** What the answer says about the rules saved: each in words. */
function ownsSaid(_plan: ErpAddPlan, entries: ErpOwnsEntry[]): Pick<AddOutcome, 'owns' | 'existingOwns'> {
    const said = entries.map((entry): OwnsSaid => ({ erp: entry.erp, rule: entry.owns, describe: describeOwns(entry.owns) }));
    const [owns, ...existingOwns] = said;
    return { owns, existingOwns };
}

/** A fill that did not finish, named by its ERP; Load demo data on its card runs it again. */
function fillFailures(fills: ErpFillOutcomes): string[] {
    return fills.flatMap((fill) =>
        fill.status === 'failed' ? [`Demo data did not load into ${fill.name}: ${sentence(fill.detail)} Use Load demo data on its card.`] : [],
    );
}

/** What the pass did per ERP, as the answer carries it (data.ownership). */
function ownershipSaid(applied: Extract<ApplyOwnershipOutcome, { status: 'applied' }>): AddOutcome['ownership'] {
    return {
        erps: applied.erps.map((erp) => ({ erp: erp.erp, name: erp.name, owns: erp.ownsNow, discontinued: erp.discontinued })),
        unowned: applied.unowned,
    };
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
 * Link the deployed ERP to the integration; then, when THIS add deployed it, give it a look no
 * other ERP has (AB-51). It runs here, as soon as the ERP answers its health, so its screen has
 * its own look before the list and the fill, and a later retry (deployed already) never
 * replaces a look someone has set since.
 */
async function linkNewErp(
    context: HandlerContext,
    plan: ErpAddPlan,
    report: (stage: string, step?: string) => void,
): Promise<ErpAddTheme> {
    const { project, integrationId, entry } = plan;
    linkComponents(project, integrationId, entry.id, getAppBuilderComponentCatalog());
    await context.stateManager.saveProject(project);
    if (plan.deployed) return {};
    report(OPERATION_STAGES.adding.label, `Giving ${plan.name} a look of its own`);
    return giveAddedErpItsOwnTheme(context, project, integrationId, entry.id);
}

/**
 * After the ERP is deployed: link it, list every ERP with the integration, fill the new one.
 * A list that could not be sent fails the add (the integration would not route to the ERP);
 * a fill that did not finish is said, and Load demo data on the ERP's card runs it again; a look
 * that could not be checked or changed is said too.
 */
async function listAndFill(
    context: HandlerContext,
    plan: ErpAddPlan,
    report: (stage: string, step?: string) => void,
): Promise<AddOutcome> {
    const { project, integrationId, entry } = plan;
    const themed = await linkNewErp(context, plan, report);
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
    const { owns, existingOwns } = ownsSaid(plan, saved.entries);
    // Ownership applied across every ERP (AB-70): each filled with what it now owns, what an
    // ERP no longer owns marked discontinued there, and what the SC still has to do said.
    const applied = await applyErpOwnership(
        project,
        integrationId,
        { authManager, getAuth: async () => auth, onProgress: (step) => report(OPERATION_STAGES.loadingErpDemoData.label, step) },
        'add',
    );
    // A credential the list could not carry (AB-16a) and a pass that did not finish are
    // both said, and the add stands.
    const notes = [...(themed.warning ? [themed.warning] : []), ...listed.warnings];
    if (applied.status === 'applied') {
        notes.push(...fillFailures(applied.fills), ...applied.notes);
        // Prices not published after a fill (AB-26z).
        notes.push(...applied.fills.flatMap((fill) => (fill.status === 'filled' && fill.note ? [fill.note] : [])));
    } else {
        notes.push(`Demo data did not load: ${sentence(applied.detail)} Use Load demo data on its card.`);
    }
    const filled = applied.status === 'applied' && applied.fills.some((fill) => fill.erp === entry.id && fill.status === 'filled');
    const warning = notes.length ? { warning: notes.join(' ') } : {};
    const merged = applied.status === 'applied' ? mergeMappings(applied.fills.map((fill) => (fill.status === 'filled' ? fill.mapping : undefined))) : undefined;
    const mapping = merged ? { mapping: merged } : {};
    const theme = themed.theme ? { theme: themed.theme } : {};
    const ownership = applied.status === 'applied' ? { ownership: ownershipSaid(applied) } : {};
    return { success: true, listed: listed.ids, filled, owns, existingOwns, ...mapping, ...theme, ...ownership, ...warning };
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
    const services = {
        authManager: ServiceLocator.getAuthenticationService(),
        commandManager: ServiceLocator.getCommandExecutor(),
    };
    // One Adobe project holds one ERP of this name (2026-10-08): another local project's
    // goes first, or this add does not run.
    const replaced = await replaceDeployedElsewhere(context, plan.project, plan.entry, services, report);
    if (replaced) return { success: false, error: replaced.error };
    const deps = buildDefaultRunnerDeps(
        await buildRunnerDepsContext(context, plan.project, services),
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
                ...(outcome.theme ? { theme: outcome.theme } : {}),
                ...(outcome.ownership ? { ownership: outcome.ownership } : {}),
                ...(outcome.warning ? { warning: outcome.warning } : {}),
            },
        };
    },
    (payload) => payload?.id ?? '',
);
