/**
 * Adding an App Builder component from the dashboard: resolve the entry (catalog
 * id or custom source), refuse what must not be added, then run the add inside
 * its progress — guards → assemble deps → the runner's addAppBuilderComponent.
 *
 * Split from `appBuilderComponentHandlers.ts` (EDS-8, 2026-10-04), which still
 * re-exports the handler and its two exported helpers, so the dashboard handler
 * map and every importer keep working.
 *
 * @module features/dashboard/handlers/appBuilderComponentAdd
 */

import { withGuardedComponentProgress } from './appBuilderComponentGuards';
import {
    answerWithWarnings,
    buildToolchainConsent,
    kindNoun,
    type GuardableResult,
} from './appBuilderComponentOperation';
import { postComponentsSnapshot, refreshProjectStatus } from './appBuilderComponentPush';
import { replaceDeployedElsewhere } from './replaceDeployedElsewhere';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import { narrateOutcomeToModal, progressSurfaceOf } from '@/core/vscode/operationProgress';
import { addAppBuilderComponent } from '@/features/app-builder/services/appBuilderAddRun';
import { resolveDeployInputs, resolveDisplayName } from '@/features/app-builder/services/deployInputs';
import { pairNameInputs } from '@/features/app-builder/services/pairNames';
import {
    buildCustomIntegrationEntry,
    entryFitsProjectAxes,
    getAppBuilderComponentCatalog,
    getAppBuilderComponentEntry,
} from '@/features/components/services/appBuilderComponentCatalogLoader';
import {
    addAnotherLabel,
    copyForAdd,
    listedSystemOf,
} from '@/features/components/services/appBuilderComponentLinks';
import {
    sendAppBuilderComponentStatusUpdate,
} from '@/features/dashboard/services/projectPanelPushes';
import {
    buildDefaultRunnerDeps,
    buildRunnerDepsContext,
} from '@/features/project-creation/services/appBuilderComponentRunnerDeps';
import { classifyEnvSchema } from '@/features/project-creation/services/envVarClassifier';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { Project } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';
import type { MessageHandler, HandlerContext, HandlerResponse } from '@/types/handlers';
import type { AddAppBuilderComponentRequestPayload } from '@/types/webviewRequests';

/**
 * Resolve the catalog entry from an add payload (catalog id OR custom source).
 *
 * Exported so its tests can pin both doors (catalog id and custom source).
 */
export function resolveAddEntry(payload: {
    id?: string;
    source?: { owner: string; repo: string };
    name?: string;
    instanceId?: string;
}): AppBuilderComponentCatalogEntry | undefined {
    if (payload.source?.owner && payload.source?.repo) {
        // Carry the user's NAME and instance id through. Dropping them meant a
        // named blank starter came back as its owner-repo slug
        // ("skukla-app-builder-shell") — the name the user typed was discarded at
        // this boundary (reported 2026-07-31).
        return buildCustomIntegrationEntry(
            { ...payload.source, name: payload.name },
            payload.instanceId,
        );
    }
    if (payload.id) {
        return getAppBuilderComponentEntry(payload.id);
    }
    return undefined;
}

/** The bucket-3 vars an entry needs a PERSON to supply — text and secret alike. */
export interface UserSuppliedEnvVars {
    /** Every var name the user must type. Empty when the entry needs none. */
    names: string[];
    /** True when at least one is a SECRET, which must never ride a tool argument. */
    hasSecret: boolean;
}

/**
 * Classify an entry's `envSchema` into what a PERSON must supply.
 *
 * Auto-wired (`providedBy`) and auto-provisioned (`derivedFrom`) vars are
 * excluded — naming one would send the user hunting for a value another
 * component supplies.
 *
 * Exported so its tests can pin the classification directly.
 */
export function userSuppliedEnvVars(entry: AppBuilderComponentCatalogEntry): UserSuppliedEnvVars {
    const { userText, userSecret } = classifyEnvSchema(entry.envSchema ?? []);
    // A text var WITH a default needs nobody: the deploy uses the default and
    // the integration's Settings let the SC change it later (the ERP's name).
    const mustType = userText.filter((envVar) => envVar.default === undefined);
    return {
        names: [...mustType, ...userSecret].map((envVar) => envVar.name),
        hasSecret: userSecret.length > 0,
    };
}

/**
 * The id an add will give its integration, as the webview named it for the modal:
 * the instance the SC named, a catalog id, or a custom repo's `owner-repo`
 * (`buildCustomIntegrationEntry`).
 */
function addedIdOf(payload: AddAppBuilderComponentRequestPayload): string | undefined {
    if (payload?.instanceId) return payload.instanceId;
    if (payload?.id) return payload.id;
    return payload?.source ? `${payload.source.owner}-${payload.source.repo}` : undefined;
}

/**
 * Why this add must not go ahead, or `undefined` when it may. Two refusals, each
 * answered before any progress opens because neither costs a cloud call.
 *
 * A third refused a second extension-layout app from the same source: those ship
 * fixed Runtime package names, so two in one workspace overwrite each other. It was
 * removed once every add got a workspace of its own (AB-23).
 */
function refuseAdd(
    project: Project,
    entry: AppBuilderComponentCatalogEntry,
): HandlerResponse | undefined {
    return stackRefusal(project, entry) ?? alreadyAddedRefusal(project, entry);
}

/**
 * Stack gate: galleries filter by the project's axes, but this add-by-id door
 * resolves from the RAW catalog — without this check a Commerce-only entry (the
 * starter kit) could be added to a project with no Commerce backend, then fail at
 * install/association where nothing explains why.
 */
function stackRefusal(
    project: Project,
    entry: AppBuilderComponentCatalogEntry,
): HandlerResponse | undefined {
    const fits = entryFitsProjectAxes(
        entry,
        project.componentSelections?.backend ?? '',
        project.componentSelections?.frontend ?? '',
    );
    if (fits) return undefined;
    const backends = entry.compatibleBackends?.length
        ? ` — it requires one of these backends: ${entry.compatibleBackends.join(', ')}.`
        : '.';
    return {
        success: false,
        error: `"${entry.name ?? entry.id}" isn't compatible with this project's stack${backends}`,
        code: ErrorCode.CONFIG_INVALID,
    };
}

/**
 * An id already in the keyed map means this add would REPLACE that component, not
 * sit beside it: the id is simultaneously the `appBuilderComponents` slot, the clone
 * folder, and — through `deriveOwPackage` — the OpenWhisk package, so the second
 * deploy overwrites the first on Runtime too. Neither route into here mints a fresh
 * id (`resolveAddEntry` returns a catalog entry unchanged, and a custom source with no
 * instance falls back to `${owner}-${repo}`), so this is the one place that can catch
 * it. Blank instances never reach it — they carry a collision-checked id derived from
 * the user's name.
 *
 * `status: 'error'` is exempt: the runner persists that when a clone succeeded but
 * the deploy failed, keeping the folder so the user can retry by adding again.
 * Refusing there would block the documented recovery path.
 */
function alreadyAddedRefusal(
    project: Project,
    entry: AppBuilderComponentCatalogEntry,
): HandlerResponse | undefined {
    const existing = project.appBuilderComponents?.[entry.id];
    if (!existing || existing.status === 'error') return undefined;
    return {
        success: false,
        error: `"${entry.name ?? entry.id}" is already added to this project.${addAnotherPointer(entry)}`,
        code: ErrorCode.CONFIG_INVALID,
    };
}

/**
 * For an add-once integration, where the SC adds more of what it serves instead: its
 * card's "Add another ERP" (AB-16). Empty for every other entry.
 */
function addAnotherPointer(entry: AppBuilderComponentCatalogEntry): string {
    if (!entry.addOnce) return '';
    const system = listedSystemOf(entry.catalogId ?? entry.id, getAppBuilderComponentCatalog());
    if (!system) return '';
    const label = addAnotherLabel(system);
    return ` To add another ${system.systemType ?? 'system'}, use "${label}" on its card (add_erp for an agent).`;
}

/**
 * Run the add inside its progress. The guards run INSIDE it: runGuards does the auth
 * check, whose `aio config get` spawn costs seconds on a cold cache. Running it first
 * left the user clicking Add and staring at nothing until it returned.
 */
function runAdd(
    context: HandlerContext,
    project: Project,
    entry: AppBuilderComponentCatalogEntry,
    payload: AddAppBuilderComponentRequestPayload,
): Promise<GuardableResult> {
    const progress = progressSurfaceOf(payload);
    return withGuardedComponentProgress(
        context,
        project,
        {
            title: 'Adding',
            id: entry.id,
            label: addLabel(project, entry),
            noun: kindNoun(entry.kind),
            progress,
        },
        async (report): Promise<GuardableResult> => {
            // An entry with a setting nobody can default cannot deploy until someone
            // types it, and adding one is not supported yet: the add that puts it on
            // the grid undeployed and opens its Settings is AB-22. Refuse plainly
            // rather than deploy with blanks. No shipped catalog entry declares such
            // a setting. `blocked`, like a guard refusal: nothing ran and nothing
            // persisted, so the caller must not take the failed-op path. The agent
            // path (`add_integration`) dispatches straight here and gets this same
            // refusal.
            const userVars = userSuppliedEnvVars(entry);
            if (userVars.names.length > 0) {
                return {
                    success: false,
                    error:
                        `"${entry.name ?? entry.id}" needs ${userVars.names.join(', ')} before it ` +
                        'can deploy, and adding an integration that needs values is not ' +
                        'supported yet. Nothing was added.',
                    blocked: true,
                };
            }

            await recordApiPicks(context, project, entry.id, payload.apis);

            report(OPERATION_STAGES.adding.label);
            // The deploy tails report every step; hand them the reporter so a slow add
            // narrates itself instead of sitting on one static title for the ~70s of
            // subscribe + install + build + deploy.
            const services = {
                authManager: ServiceLocator.getAuthenticationService(),
                commandManager: ServiceLocator.getCommandExecutor(),
            };
            // One Adobe project holds one deployment of this name (2026-10-08): the one
            // another local project put there goes first, or this add does not run.
            const replaced = await replaceDeployedElsewhere(context, project, entry, services, report);
            if (replaced) return { success: false, error: replaced.error };
            const deps = buildDefaultRunnerDeps(
                await buildRunnerDepsContext(context, project, services),
                (message, subMessage, position) => report(message, subMessage, position),
                buildToolchainConsent(context, payload.refreshCli),
            );
            return addAppBuilderComponent(project, entry, deps);
        },
    );
}

/**
 * What the add is called while it runs: the name its inputs give it. For the ERP
 * integration that is its own name, which `recordPairNames` has just recorded.
 */
function addLabel(project: Project, entry: AppBuilderComponentCatalogEntry): string {
    return resolveDisplayName(entry, resolveDeployInputs(project, entry));
}

/**
 * Name a PAIRED entry and the system it brings: the system from the name the SC
 * typed ("Justrite" → "Justrite ERP"), the integration by its catalog name ("ERP
 * Integration"; `pairNames`). Every add records both, so an untyped add is "ERP
 * Integration" and "Acme ERP" rather than whatever each default happens to be.
 *
 * Recorded against the INTEGRATION's id because that is the owner
 * `resolveDeployInputs` reads first for a bound pair, so the system picks it up
 * when it deploys — and the pair keeps arriving together, which forking the entry
 * under a minted id had broken (owner, 2026-09-20).
 *
 * A retry with nothing typed keeps the names the first attempt recorded.
 *
 * @param context - the handler context, for saving
 * @param project - the project being added to
 * @param entry - the entry being added
 * @param name - what the SC typed, if anything
 */
async function recordPairNames(
    context: HandlerContext,
    project: Project,
    entry: AppBuilderComponentCatalogEntry,
    name: string | undefined,
): Promise<void> {
    const inputs = pairNameInputs(entry, getAppBuilderComponentCatalog(), name);
    if (!inputs) return;
    const current = project.componentConfigs?.[entry.id] ?? {};
    const kept = !name?.trim() && Object.keys(inputs).every((key) => String(current[key] ?? '').trim());
    if (kept) return;

    project.componentConfigs = {
        ...(project.componentConfigs ?? {}),
        [entry.id]: { ...current, ...inputs },
    };
    await context.stateManager.saveProject(project);
}

/**
 * Attribute the picked APIs to THIS integration before anything subscribes. Keyed by
 * `entry.id`, which for a named blank instance is the collision-checked instanceId
 * that resolveAddEntry already applied — the same key Manage APIs and the reconcile
 * union read back.
 */
async function recordApiPicks(
    context: HandlerContext,
    project: Project,
    id: string,
    apis: string[] | undefined,
): Promise<void> {
    if (!apis || apis.length === 0) return;
    project.componentApiPicks = {
        ...(project.componentApiPicks ?? {}),
        [id]: [...new Set(apis)],
    };
    await context.stateManager.saveProject(project);
}

/**
 * Tell the grid how the add ended, and answer the caller.
 *
 * A success names what was added rather than answering a bare `{success: true}`. The
 * webview ignores the response, but `add_integration` does not: `defaultShape`
 * renders a bare success as the literal string "{}", and the id is the one thing the
 * agent needs next — to deploy, remove, or ask the status of what it just added. For
 * a CUSTOM source it never supplied that id; `resolveAddEntry` derived it.
 */
async function reportAddOutcome(
    context: HandlerContext,
    entry: AppBuilderComponentCatalogEntry,
    result: GuardableResult,
    label: string,
    progress: 'modal' | undefined,
): Promise<HandlerResponse> {
    if (result.blocked) {
        return { success: false, error: result.error };
    }
    await sendAppBuilderComponentStatusUpdate(
        entry.id,
        result.success ? 'deployed' : 'error',
        result.success ? undefined : result.error || 'Deployment failed',
    );
    // Even a failed add may have persisted the entry (clone/deploy died mid-flight) —
    // the grid needs the fresh map either way.
    await postComponentsSnapshot(context);
    await refreshProjectStatus(context);
    if (!result.success) {
        return { success: false, error: result.error };
    }
    return {
        ...answerWithWarnings({}, result.warnings ?? [], progress),
        // The name the progress title used, so an agent relays what the SC typed.
        added: { id: entry.id, name: label, kind: entry.kind },
    };
}

/**
 * Handle 'addAppBuilderComponent' — guards → (needs values → refuse) → assemble deps →
 * D1 addAppBuilderComponent. The FIRST live UI-driven full add.
 */
export const handleAddAppBuilderComponent: MessageHandler<
    AddAppBuilderComponentRequestPayload
> = narrateOutcomeToModal(async (context, payload) => {
    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { success: false, error: 'No project found', code: ErrorCode.PROJECT_NOT_FOUND };
    }
    const resolved = resolveAddEntry(payload ?? {});
    if (!resolved) {
        return { success: false, error: 'Unknown appBuilderComponent', code: ErrorCode.CONFIG_INVALID };
    }
    const entry = copyWhenTaken(project, resolved, payload ?? {});
    const refusal = refuseAdd(project, entry);
    if (refusal) return refusal;

    await recordPairNames(context, project, entry, payload?.name);
    const label = addLabel(project, entry);
    const result = await runAdd(context, project, entry, payload ?? {});
    return reportAddOutcome(context, entry, result, label, progressSurfaceOf(payload));
}, addedIdOf);

/**
 * A catalog entry the project already holds is added again as a numbered copy
 * (`commerce-integration-starter-kit-2`), in a workspace of its own (AB-23). Not for a
 * mesh — a project has one — nor an add-once integration (the ERP integration, whose card
 * adds another ERP instead), nor a custom source, whose id is its repo; those still meet
 * the same-id refusal. A copy whose add failed keeps its id, so
 * adding again retries it.
 */
function copyWhenTaken(
    project: Project,
    entry: AppBuilderComponentCatalogEntry,
    payload: AddAppBuilderComponentRequestPayload,
): AppBuilderComponentCatalogEntry {
    if (payload.source) return entry;
    return copyForAdd(project, entry, getAppBuilderComponentCatalog()) ?? entry;
}
