/**
 * AppBuilderComponent Handlers (D2 Track B — Step 05)
 *
 * The dashboard message handlers that drive the live D1 deploy-contract runner
 * from the integrations list. THIS is the first UI-driven `addAppBuilderComponent`
 * (clone + install + subscribe + deploy), distinct from Track A's bounded mesh
 * subscribe.
 *
 * Guard order: auth → org-mismatch → App Builder permission (inherited from
 * the retired singular DeployAppCommand),
 * permission), then assembles a RunnerDepsContext via buildDefaultRunnerDeps —
 * supplying the Track A `subscriberClient` adapter, the stack-filtered `catalog`,
 * and the extension `secrets` — before invoking the runner. A failing guard
 * surfaces the message and NEVER calls the runner. Runner failures post a typed
 * `error` row status (no throw to the webview, P2).
 *
 * Add routes a bucket-3 entry (envSchema with userText/userSecret) to Configure
 * FIRST, so an App Builder component that needs user inputs is never silently deployed with
 * missing values.
 *
 * Reuse, not fork: the runner, the deps factory, the adapter, the catalog
 * loader, the env classifier, and the guard helpers are all consumed as-is.
 *
 * @module features/dashboard/handlers/appBuilderComponentHandlers
 */

import * as vscode from 'vscode';
import { ensureAdobeIOAuth } from '@/core/auth/adobeAuthGuard';
import { ServiceLocator } from '@/core/di/serviceLocator';
import {
    getAppBuilderComponent,
    listAppBuilderComponents,
    setAppBuilderComponent,
} from '@/core/state/appBuilderComponentState';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import { stageLine } from '@/core/utils/stageLine';
import { narrateOutcomeToModal, progressSurfaceOf } from '@/core/vscode/operationProgress';
import { cardInFlightLabel, timedSteps } from '@/core/vscode/progressRegister';
import { withOperationProgress } from '@/core/vscode/withOperationProgress';
import {
    addAppBuilderComponent,
    deployAppBuilderComponent,
    removeAppBuilderComponent,
    type RuntimeCleanupSummary,
} from '@/features/app-builder/services/appBuilderComponentRunner';
import { resolveDeployInputs, resolveDisplayName } from '@/features/app-builder/services/deployInputs';
import type { CommerceDetachResult } from '@/features/app-builder/services/erpDetach';
import {
    buildCustomIntegrationEntry,
    entryFitsProjectAxes,
    getAppBuilderComponentCatalog,
    getAppBuilderComponentEntry,
} from '@/features/components/services/appBuilderComponentCatalogLoader';
import { copyForAdd } from '@/features/components/services/appBuilderComponentLinks';
import {
    buildDefaultRunnerDeps,
    buildRunnerDepsContext,
} from '@/features/project-creation/services/appBuilderComponentRunnerDeps';
import { classifyEnvSchema } from '@/features/project-creation/services/envVarClassifier';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { Project , AppBuilderComponentKind } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';
import { MessageHandler, HandlerContext, HandlerResponse } from '@/types/handlers';
import type { AppBuilderComponentRowStatus, OperationPosition } from '@/types/webviewPayloads';
import type { AddAppBuilderComponentRequestPayload } from '@/types/webviewRequests';

/**
 * Run the deploy guard order (auth → org-mismatch → App Builder permission).
 * Returns an error string on the first failure (caller aborts
 * WITHOUT calling the runner); undefined when all guards pass.
 *
 * Exported for the console-API handlers (consoleApiHandlers.ts), which need
 * the identical chain before touching Developer Console credentials.
 */
/** A guard refusal: the message to show, plus a code when the UI can act on it. */
export interface GuardFailure {
    error: string;
    /** AUTH_REQUIRED lets a picker offer "Sign In with Adobe" instead of Retry. */
    code?: ErrorCode;
}

/**
 * The guard step every per-component operation opens with: report the check,
 * run the chain, and on a refusal surface the warning and build the `blocked`
 * result — `blocked`, not merely failed, because nothing ran, so callers must
 * NOT take the failed-op path (error row status + snapshot).
 *
 * Returns undefined when all guards pass. One home for what was the same
 * four-line block in add/deploy/remove/install (2026-08-27 sweep — the fourth
 * copy is what tripped Rule of Three).
 */
export async function guardOrBlock(
    context: HandlerContext,
    project: Project,
    report: (message: string) => void,
    progress?: 'modal',
): Promise<GuardableResult | undefined> {
    report(OPERATION_STAGES.checkingRequirements.label);
    const guardError = await runGuards(context, project);
    if (!guardError) {
        return undefined;
    }
    // A modal-hosted operation shows the refusal in its modal; a warning as well
    // would be a second surface saying the same thing.
    if (progress !== 'modal') vscode.window.showWarningMessage(guardError.error);
    return {
        success: false,
        error: guardError.error,
        code: guardError.code,
        blocked: true,
    };
}

export async function runGuards(
    context: HandlerContext,
    project: Project,
): Promise<GuardFailure | undefined> {
    const authManager = ServiceLocator.getAuthenticationService();

    // Per-step debug lines: a live deploy sat at "Checking requirements…" for
    // 9+ minutes (2026-08-27) and NOTHING here said which guard was holding it
    // — the same silent-multi-step shape as the teardown (AI-5). Each step
    // names itself BEFORE it runs so the last line in the log is the culprit.
    context.logger.debug('[Guards] 1/3 auth check…');
    const authResult = await ensureAdobeIOAuth({
        authManager,
        logger: context.logger,
        logPrefix: '[AppBuilderComponents]',
        projectContext: {
            organization: project.adobe?.organization,
            projectId: project.adobe?.projectId,
            workspace: project.adobe?.workspace,
        },
        // Every App Builder operation passes this guard, reads included — so it names
        // what is needed, not an action ("to manage…" read wrong for a list).
        warningMessage: 'Sign in to Adobe to continue.',
    });
    if (!authResult.authenticated) {
        // TYPED so UI surfaces can offer a SIGN-IN action; a Retry cannot fix this.
        return { error: 'Adobe sign-in required.', code: ErrorCode.AUTH_REQUIRED };
    }

    context.logger.debug('[Guards] 2/3 org-mismatch check…');
    const { detectProjectOrgMismatch } = await import(
        '@/features/authentication/services/detectProjectOrgMismatch'
    );
    const orgContext = await detectProjectOrgMismatch(authManager, project, context.logger);
    if (orgContext && !orgContext.reachable) {
        return {
            error: 'Project uses a different Adobe organization. Use "Switch IMS Org" to continue.',
        };
    }

    context.logger.debug('[Guards] 3/3 developer-permission check…');
    const permission = await authManager.testDeveloperPermissions();
    if (!permission.hasPermissions) {
        return {
            error: permission.error || 'Developer or System Admin role required for App Builder.',
        };
    }

    context.logger.debug('[Guards] all passed');
    return undefined;
}

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
 * Re-run the project status after the component SET changed.
 *
 * The status is derived from the set, so adding, deploying or removing a
 * component makes it stale. Same shape as rename / re-authenticate / forced org
 * switch, which already re-run `handleRequestStatus` after their mutations.
 *
 * REGRESSION (2026-08-04, live): removing a mesh left its card on the grid
 * reading "MESH DEPLOYED". The keyed entry was cleared and a fresh snapshot was
 * sent, but nothing refreshed `meshStatus`, so the derived mesh card outlived the
 * component it described.
 *
 * NOT called from `postComponentsSnapshot`, even though every one of these sites
 * pairs the two: RENAME also posts a snapshot, and rename is a local metadata
 * write that deliberately runs no Adobe guards so it works offline. This helper
 * reaches `ensureAdobeIOAuth` through `handleRequestStatus`, so folding it into
 * the snapshot would have put a guard on the offline path — a pinned property,
 * and the test that pins it is what caught the attempt. Rename does not need it
 * anyway: it changes a display name, not the set.
 *
 * LAZY import: `dashboardHandlers` imports FROM this module, so a static import
 * would close a cycle.
 */
export async function refreshProjectStatus(context: HandlerContext): Promise<void> {
    const { handleRequestStatus } = await import('@/features/dashboard/handlers/dashboardHandlers');
    await handleRequestStatus(context);
}

// The per-row status vocabulary moved to @/types/webviewPayloads
// (AppBuilderComponentRowStatus) — one declaration shared by this module,
// the channel's sender AND the webview receiver.

/**
 * Post a per-row status update via the dashboard command. Imported LAZILY so
 * this handler module never statically
 * pulls the webview-command class into the module-load graph (which would chain
 * BaseWebviewCommand into handler-only test contexts).
 *
 * `name` refreshes the row's display label on the same channel (rename path).
 *
 * Exported for the destination move, which walks every component and must
 * telegraph each one — the project-scoped progress notification has no owning
 * card, so without this the whole grid sits at DEPLOYED for the entire move.
 */
export async function postRowStatus(
    id: string,
    status: AppBuilderComponentRowStatus,
    message?: string,
    name?: string,
): Promise<void> {
    const { ProjectDashboardWebviewCommand } = await import(
        '@/features/dashboard/commands/showDashboard'
    );
    await ProjectDashboardWebviewCommand.sendAppBuilderComponentStatusUpdate(
        id,
        status,
        message,
        name,
    );
}

/**
 * Post the FULL fresh persisted `appBuilderComponents` map over the
 * `appBuilderComponentsSnapshot` channel. The webview's map is seeded once at
 * init, so per-row status pushes alone drop ADDED entries (no row to flip) and
 * leave REMOVED entries lingering. Sent after terminal ops: add (success AND
 * failure — the entry may have persisted), deploy/redeploy terminal, remove
 * success, rename success. Same lazy import as postRowStatus.
 */
/**
 * Push MESH status on the mesh's own channel.
 *
 * The mesh card is keyed `'mesh'` and derives its status from `meshStatusUpdate`;
 * the row channel is deliberately told to skip the mesh's component id so it does
 * not synthesize a second card beside it. A row push for a mesh therefore reaches
 * nothing — which is why a moving mesh sat at DEPLOYED while it deployed.
 *
 * @param status - the mesh card's status
 * @param message - the in-flight line, shown only while transient
 */
export async function postMeshStatus(
    status: 'deploying' | 'deployed' | 'error',
    message?: string,
): Promise<void> {
    const { ProjectDashboardWebviewCommand } = await import(
        '@/features/dashboard/commands/showDashboard'
    );
    await ProjectDashboardWebviewCommand.sendMeshStatusUpdate(status, message);
}

/**
 * Push the deploy destination to the header. Same lazy import as the two above,
 * for the same reason: keep the webview-command class out of this module's static
 * load graph.
 *
 * @param destination - the project/workspace titles the header renders
 */
export async function postDestination(destination: {
    projectTitle?: string;
    workspaceTitle?: string;
}): Promise<void> {
    const { ProjectDashboardWebviewCommand } = await import(
        '@/features/dashboard/commands/showDashboard'
    );
    await ProjectDashboardWebviewCommand.sendProjectDestinationUpdate(destination);
}

export async function postComponentsSnapshot(context: HandlerContext): Promise<void> {
    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return;
    }
    const { ProjectDashboardWebviewCommand } = await import(
        '@/features/dashboard/commands/showDashboard'
    );
    await ProjectDashboardWebviewCommand.sendAppBuilderComponentsSnapshot(
        project.appBuilderComponents ?? {},
    );
}

/**
 * Handle 'addAppBuilderComponent' — guards → (needs values → refuse) → assemble deps →
 * D1 addAppBuilderComponent. The FIRST live UI-driven full add.
 */
/**
 * Build the toolchain-refresh consent for this invocation (PL-6 bridge).
 *
 * With a webview panel the answer comes from the factory's notification
 * prompt (return undefined → the default applies). Headless — the MCP agent
 * surface, where `context.panel` is absent — the answer IS the request's
 * `refreshCli` flag: an agent is told by the failure hint to confirm with its
 * human and re-call with the flag, so a handler never parks it on a dialog.
 * Exported for its own test.
 */
export function buildToolchainConsent(
    context: HandlerContext,
    refreshCli: boolean | undefined,
): (() => Promise<boolean>) | undefined {
    if (context.panel) return undefined; // interactive: the factory prompt decides
    return async () => refreshCli === true;
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
        error: `"${entry.name ?? entry.id}" is already added to this project.`,
        code: ErrorCode.CONFIG_INVALID,
    };
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
    return withComponentProgress(
        {
            title: 'Adding',
            id: entry.id,
            label: addLabel(project, entry, payload.name),
            noun: kindNoun(entry.kind),
            logger: context.logger,
            progress,
        },
        async (report): Promise<GuardableResult> => {
            const refused = await guardOrBlock(context, project, report, progress);
            if (refused) {
                return refused;
            }

            // An entry with a setting nobody can default cannot deploy until someone
            // types it, and adding one is not supported yet: the add that puts it on
            // the grid undeployed and opens its Settings is AB-22. Refuse plainly
            // rather than deploy with blanks. No shipped catalog entry declares such
            // a setting. `blocked`, like a guard refusal: nothing ran and nothing
            // persisted, so the caller must not take the failed-op path. The AGENT
            // path never reaches here — `add_integration`'s preflight answers with
            // the handoff before dispatching.
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
            await recordPairedSystemName(context, project, entry, payload.name);

            report(OPERATION_STAGES.adding.label);
            // The deploy tails report every step; hand them the reporter so a slow add
            // narrates itself instead of sitting on one static title for the ~70s of
            // subscribe + install + build + deploy.
            const deps = buildDefaultRunnerDeps(
                await buildRunnerDepsContext(context, project, {
                    authManager: ServiceLocator.getAuthenticationService(),
                    commandManager: ServiceLocator.getCommandExecutor(),
                }),
                (message, subMessage, position) => report(message, subMessage, position),
                buildToolchainConsent(context, payload.refreshCli),
            );
            return addAppBuilderComponent(project, entry, deps);
        },
    );
}

/**
 * What the add is called while it runs: the name its inputs give it — for the ERP
 * integration, "<ERP name> Integration" — with the name the SC just typed for the
 * bound system applied BEFORE anything is recorded, because the title is fixed
 * when the progress starts and the recording happens inside it.
 */
function addLabel(
    project: Project,
    entry: AppBuilderComponentCatalogEntry,
    typedName: string | undefined,
): string {
    const inputs = resolveDeployInputs(project, entry);
    const key = pairedNameKey(entry);
    const typed = typedName?.trim();
    if (key && typed) inputs[key] = typed;
    return resolveDisplayName(entry, inputs);
}

/** The input the entry's bound system is NAMED from, when it has one. */
function pairedNameKey(entry: AppBuilderComponentCatalogEntry): string | undefined {
    const kind = entry.catalogId ?? entry.id;
    const bound = getAppBuilderComponentCatalog().find(
        (candidate) => candidate.kind === 'system' && candidate.boundTo === kind,
    );
    return bound?.nameFromEnvVar;
}

/**
 * A typed name on a PAIRED entry names its bound SYSTEM — and, through
 * `nameSuffix`, the integration too ("Northwind ERP Integration").
 *
 * The ERP it talks to is called whatever the SC typed. Recorded against the
 * INTEGRATION's id because
 * that is the owner `resolveDeployInputs` reads first for a bound pair, so the
 * system picks it up when it deploys — and the pair keeps arriving together,
 * which forking the entry under a minted id had broken (owner, 2026-09-20).
 *
 * @param context - the handler context, for saving
 * @param project - the project being added to
 * @param entry - the entry being added
 * @param name - what the SC typed, if anything
 */
async function recordPairedSystemName(
    context: HandlerContext,
    project: Project,
    entry: AppBuilderComponentCatalogEntry,
    name: string | undefined,
): Promise<void> {
    const typed = name?.trim();
    if (!typed) return;
    const key = pairedNameKey(entry);
    if (!key) return;

    project.componentConfigs = {
        ...(project.componentConfigs ?? {}),
        [entry.id]: {
            ...(project.componentConfigs?.[entry.id] ?? {}),
            [key]: typed,
        },
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
): Promise<HandlerResponse> {
    if (result.blocked) {
        return { success: false, error: result.error };
    }
    await postRowStatus(
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
        ...answerWithWarnings({}, result.warnings ?? []),
        added: { id: entry.id, name: entry.name ?? entry.id, kind: entry.kind },
    };
}

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

    const result = await runAdd(context, project, entry, payload ?? {});
    return reportAddOutcome(context, entry, result);
}, addedIdOf);

/**
 * A catalog entry the project already holds is added again as a numbered copy
 * (`erp-integration-2`), which brings its own ERP and gets its own workspace (AB-23).
 * Not for a mesh — a project has one — nor for a custom source, whose id is its repo;
 * those still meet the same-id refusal. A copy whose add failed keeps its id, so
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

/**
 * Resolve the two things every per-component handler needs first: a non-empty
 * `id` from the payload, and the current project.
 *
 * Returns a discriminated result rather than throwing: these are `MessageHandler`s
 * that answer with a `HandlerResponse`, so a throw would need a catch at every
 * site or a change to the handler contract. `if (!target.ok) return target.error;`
 * keeps the early-return style the handlers already use.
 *
 * Extracted at four identical copies (duplication scan, 2026-07-31).
 *
 * @param context - the handler context (supplies the state manager)
 * @param id - the payload's component id, possibly absent
 * @returns the id + project, or the error response to return as-is
 */
export async function resolveComponentTarget(
    context: HandlerContext,
    id: string | undefined,
): Promise<{ ok: true; id: string; project: Project } | { ok: false; error: HandlerResponse }> {
    if (!id) {
        return {
            ok: false,
            error: {
                success: false,
                error: 'AppBuilderComponent id is required',
                code: ErrorCode.CONFIG_INVALID,
            },
        };
    }
    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return {
            ok: false,
            error: { success: false, error: 'No project found', code: ErrorCode.PROJECT_NOT_FOUND },
        };
    }
    return { ok: true, id, project };
}

/**
 * A runner outcome, plus the one distinction the runner itself cannot make:
 * `blocked` means a GUARD stopped the operation before any work ran, so callers
 * must not take the failed-op path (error row status + snapshot) — nothing was
 * attempted and nothing persisted.
 */
export type GuardableResult = {
    success: boolean;
    error?: string;
    /** Set when the refusal is actionable (AUTH_REQUIRED → the UI offers sign-in). */
    code?: ErrorCode;
    blocked?: boolean;
    /**
     * Set by `removeAppBuilderComponent` — what the Runtime namespace looked like
     * after undeploy. THIS TYPE OMITTED IT UNTIL 2026-09-10, which is how AB-7's
     * fix came to be invisible: the runner produced the summary, this type erased
     * it on the way through `withComponentProgress`, and the handler answered a
     * bare success. A `failed` entry here means code is STILL DEPLOYED.
     */
    runtimeCleanup?: RuntimeCleanupSummary;
    /** Set by `removeAppBuilderComponent` for the ERP integration: its Commerce writes undone. */
    commerceDetach?: CommerceDetachResult;
    /**
     * What the operation could not finish, in plain words: a removal's leftovers,
     * or an add's/deploy's storefront republish whose CDN publish did not land.
     */
    warnings?: string[];
};

/**
 * Answer a finished operation, carrying its warnings to BOTH surfaces: a warning
 * notification for the SC, and `data.warning` for an agent, which cannot see a
 * toast. HandlerResponse already has `data?: unknown`, so the message contract
 * does not change. The durable signal is elsewhere — a republish that did not
 * land leaves the storefront stale, so the Republish tile stays amber after the
 * toast is gone (`storefrontRepublishService`).
 */
function answerWithWarnings(
    data: Record<string, unknown>,
    warnings: (string | undefined)[],
): HandlerResponse {
    const present = warnings.filter((warning): warning is string => Boolean(warning));
    if (present.length > 0) {
        const warning = present.join(' ');
        vscode.window.showWarningMessage(warning);
        return { success: true, data: { ...data, warning } };
    }
    return { success: true, data: Object.keys(data).length > 0 ? data : undefined };
}

/** What the card calls a component: its kind, title-cased for the status line. */
function kindNoun(kind: AppBuilderComponentKind | undefined): string {
    if (kind === 'mesh') return 'Mesh';
    if (kind === 'system') return 'System';
    return 'Integration';
}

/**
 * Run a slow per-integration operation with the telegraph the rest of the
 * extension already uses: a VS Code progress notification, a live row status on
 * the grid, and USER-log lines at start and finish.
 *
 * They carry DIFFERENT registers, and that split is the point. The question that
 * produced it was not "why do these two say the same words" — it was **why do we
 * run two notification systems at once, and what is each one worth?** Both used
 * to receive the identical string, which is what made the redundancy visible, but
 * sameness of wording was the symptom rather than the reason to change it.
 *
 * The rule: **no two surfaces narrate the same step.** The NOTIFICATION carries
 * the steps, under a static title naming the operation and its object ("Deploying
 * ERP Sync"). The CARD names the operation once ("Deploying…") and holds still.
 *
 * That assignment is reversed from the first attempt at this split, which gave
 * the steps to the card on the theory that the object being acted on should carry
 * them. Seen running (2026-08-04) it was backwards: the card's status line is
 * small, uppercase and inside a ~450px tile, so a two-part step wrapped to two
 * shouting lines in the middle of the object's own summary, while the
 * notification — transient, roomy, and where VS Code users already look for
 * progress — sat on one static line. The notification is also the only feedback
 * for someone who is NOT on the Integrations page, so the detail is wasted
 * anywhere else. A path with no card (the projects-list kebab redeploy) always
 * kept step text in its notification; that is now simply the general rule rather
 * than an exception to one.
 *
 * Before this, add/remove/deploy ran silently — the modal closed, `aio app
 * undeploy` ground away for tens of seconds, and nothing anywhere said so
 * (reported 2026-07-31: "no visual indication that anything is happening", "no
 * logging in the user log channel for any of these actions"). Mirrors
 * `DeployMeshCommand`'s withProgress + status-push shape rather than inventing a
 * second one.
 *
 * **Call this BEFORE the guards, not after.** `runGuards` performs the auth
 * check, whose `aio config get` spawn costs seconds on a cold cache — so a
 * handler that guards first shows nothing for those seconds and the notification
 * reads as laggy (reported 2026-07-31: "it's not as immediate as it should be").
 * Every slow step belongs inside `run`, with
 * `report(OPERATION_STAGES.checkingRequirements.label)` as its first line — the same
 * shape `deployMeshHeadless` uses.
 *
 * **Started from the integrations screen, it narrates to a modal instead**
 * (`progress: 'modal'`, PL-59): each stage, its step and the stage's expectation line
 * go to the SC's modal, and no notification opens — the modal is the one surface
 * narrating the steps. The card still gets its single line.
 *
 * @param options - the notification title, the row to telegraph, the user logger,
 *                  and where the steps go
 * @param run - the work; call its `report` with each stage, and the step under it
 * @returns whatever `run` resolves to
 */
export async function withComponentProgress<T extends GuardableResult>(
    options: {
        title: string;
        id: string;
        label: string;
        /** What the card calls the thing — its KIND ("Mesh" / "Integration"). */
        noun: string;
        logger: HandlerContext['logger'];
        /** `'modal'` when the SC started it from the integrations screen. */
        progress?: 'modal';
    },
    run: (report: (stage: string, step?: string, position?: OperationPosition) => void) => Promise<T>,
): Promise<T> {
    const { title, id, label, noun, logger } = options;
    const inModal = options.progress === 'modal';
    logger.info(`${title} ${label}...`);
    // Every step also reaches the Debug Logs with how long the step before it
    // took. The notification shows only the step in flight and is gone when it
    // closes, so an update that stalled left nothing to read (owner, 2026-09-18).
    const steps = timedSteps((line) => logger.debug(`[${title} ${label}] ${line}`));

    // Where it reports is decided in one place for every operation (PL-59 phase 2):
    // the modal when started from a button, else one notification whose message is
    // the stage name, else the agent's notification — and while the modal narrates,
    // nothing run inside the operation opens a notification of its own (R7).
    const result = await withOperationProgress(
        {
            id,
            title: `${title} ${label}`,
            inModal,
            cardLabel: cardInFlightLabel(title, noun),
            pushCardStatus: (cardLabel) => {
                void postRowStatus(id, 'deploying', cardLabel);
            },
        },
        (report) =>
            run((stage, step, position) => {
                steps.step(stageLine(step || stage, position));
                report(stage, step, position);
            }),
    );
    steps.finish();

    if (result.success) {
        logger.info(`${title} ${label} — done`);
    } else if (result.blocked) {
        // A guard stopped it before any work ran — not a failure to report as one.
        logger.info(`${title} ${label} — stopped: ${result.error ?? 'requirements not met'}`);
    } else {
        logger.error(`${title} ${label} — failed: ${result.error ?? 'unknown error'}`);
    }
    return result;
}

/** Shared deploy/redeploy: guards → D1 deployAppBuilderComponent {id}. */
async function deployById(
    context: HandlerContext,
    requestedId: string | undefined,
    refreshCli?: boolean,
    progress?: 'modal',
) {
    const target = await resolveComponentTarget(context, requestedId);
    if (!target.ok) return target.error;
    const { id, project } = target;

    // The display name, as Add and Remove already pass — the notification title is
    // now its whole content, so a raw slug is what a background user would read.
    const displayName = getAppBuilderComponent(project, id)?.name ?? id;
    const result = await withComponentProgress(
        {
            title: 'Deploying',
            id,
            label: displayName,
            noun: kindNoun(getAppBuilderComponent(project, id)?.kind),
            logger: context.logger,
            progress,
        },
        async (report): Promise<GuardableResult> => {
            const refused = await guardOrBlock(context, project, report, progress);
            if (refused) {
                return refused;
            }

            report(OPERATION_STAGES.deploying.label);
            // Same reuse as the add path: the deploy tail narrates its own steps.
            const deps = buildDefaultRunnerDeps(
                await buildRunnerDepsContext(context, project, {
                    authManager: ServiceLocator.getAuthenticationService(),
                    commandManager: ServiceLocator.getCommandExecutor(),
                }),
                // The notification title already names the operation and its object, so
                // the step line is the SUB-step alone when one exists — joining both
                // produced two-line cards ('Deploying custom integration... Running
                // aio app deploy'; owner screenshot, 2026-08-27).
                (message, subMessage, position) => report(message, subMessage, position),
                buildToolchainConsent(context, refreshCli),
            );
            return deployAppBuilderComponent(project, id, deps);
        },
    );
    const status = result.success ? 'deployed' : 'error';
    await postRowStatus(
        id,
        status,
        result.success ? undefined : result.error || 'Deployment failed',
    );
    // Terminal either way — the persisted status changed; refresh the grid map.
    await postComponentsSnapshot(context);
    await refreshProjectStatus(context);
    return result.success
        ? answerWithWarnings({}, result.warnings ?? [])
        : { success: false, error: result.error };
}

/** Handle 'deployAppBuilderComponent' — deploy the given appBuilderComponent's tail. */
export const handleDeployAppBuilderComponent: MessageHandler<{
    id?: string;
    refreshCli?: boolean;
    /** `'modal'` when the SC started it from the integrations screen (PL-59). */
    progress?: 'modal';
}> = narrateOutcomeToModal(
    (context, payload) =>
        deployById(context, payload?.id, payload?.refreshCli, progressSurfaceOf(payload)),
    (payload) => payload?.id,
);

/** Redeploy is the same path (idempotent re-run of the deploy tail). */
export const handleRedeployAppBuilderComponent = handleDeployAppBuilderComponent;

/** Run the removal inside its progress; the guards run inside it, as for an add. */
function runRemove(
    context: HandlerContext,
    project: Project,
    id: string,
    options: { progress: 'modal' | undefined; force: boolean },
): Promise<GuardableResult> {
    const { progress, force } = options;
    return withComponentProgress(
        {
            title: 'Removing',
            id,
            label: getAppBuilderComponent(project, id)?.name ?? id,
            noun: kindNoun(getAppBuilderComponent(project, id)?.kind),
            logger: context.logger,
            progress,
        },
        async (report): Promise<GuardableResult> => {
            const refused = await guardOrBlock(context, project, report, progress);
            if (refused) {
                return refused;
            }

            // Undeploy is a slow cloud op — telegraph it, or the grid sits frozen
            // while `aio app undeploy` runs with nothing on screen saying so.
            report(OPERATION_STAGES.removing.label);
            // Every phase reports through this — it was left out, so a 3-minute
            // removal read as one line (2026-09-21).
            const deps = buildDefaultRunnerDeps(
                await buildRunnerDepsContext(context, project, {
                    authManager: ServiceLocator.getAuthenticationService(),
                    commandManager: ServiceLocator.getCommandExecutor(),
                }),
                (message, subMessage, position) => report(message, subMessage, position),
            );
            // `force` is the SC's "Remove anyway".
            return removeAppBuilderComponent(project, id, deps, { force });
        },
    );
}

/** Tell the grid the removal ended, and answer the caller — with any cleanup warning. */
async function reportRemoveOutcome(
    context: HandlerContext,
    displayName: string,
    result: GuardableResult,
): Promise<HandlerResponse> {
    if (!result.success) {
        if (result.code !== ErrorCode.COMPONENT_REMOVAL_STOPPED) {
            return { success: false, error: result.error };
        }
        // The stop is saved on the record; the card shows it and offers Remove
        // anyway once the snapshot arrives. The code tells an agent the same.
        await postComponentsSnapshot(context);
        return { success: false, error: result.error, code: result.code };
    }
    // The entry left the persisted map — without a snapshot the card lingers.
    await postComponentsSnapshot(context);
    await refreshProjectStatus(context);

    const cleanup = result.runtimeCleanup;
    const commerceDetach = result.commerceDetach;
    return answerWithWarnings(
        {
            ...(cleanup ? { runtimeCleanup: cleanup } : {}),
            ...(commerceDetach ? { commerceDetach } : {}),
        },
        [
            runtimeWarning(displayName, cleanup),
            detachWarning(displayName, commerceDetach),
            ...(result.warnings ?? []),
        ],
    );
}

/** Handle 'removeAppBuilderComponent' — guards → D1 removeAppBuilderComponent {id} (confirm is UI-side). */
export const handleRemoveAppBuilderComponent: MessageHandler<{
    id?: string;
    /** The SC's "Remove anyway": only a literal true counts. */
    force?: boolean;
    /** `'modal'` when the SC started it from the integrations screen (PL-59). */
    progress?: 'modal';
}> = narrateOutcomeToModal(
    async (context, payload) => {
        const target = await resolveComponentTarget(context, payload?.id);
        if (!target.ok) return target.error;
        const { id, project } = target;

        // Read before the removal: the entry leaves the map when it succeeds.
        const displayName = getAppBuilderComponent(project, id)?.name ?? id;
        const result = await runRemove(context, project, id, {
            progress: progressSurfaceOf(payload),
            force: payload?.force === true,
        });
        return reportRemoveOutcome(context, displayName, result);
    },
    (payload) => payload?.id,
);

/** The unfinished Runtime cleanup, said out loud (AB-7), or undefined. */
function runtimeWarning(displayName: string, cleanup: RuntimeCleanupSummary | undefined): string | undefined {
    const stillRunning = cleanup?.failed ?? [];
    if (!cleanup || (stillRunning.length === 0 && cleanup.verified)) {
        return undefined;
    }
    const detail =
        stillRunning.length > 0
            ? `${stillRunning.length} item(s) are still deployed: ${stillRunning.join(', ')}`
            : (cleanup.note ?? 'the Runtime namespace could not be listed');
    return (
        `${displayName} was removed, but its Runtime cleanup did not finish — ${detail}. ` +
        `Ask the agent to run list_runtime_packages before reusing this project.`
    );
}

/** What of the ERP integration's Commerce writes could not be undone, or undefined. */
function detachWarning(displayName: string, detach: CommerceDetachResult | undefined): string | undefined {
    if (detach?.status !== 'failed') {
        return undefined;
    }
    return `${displayName} was removed, but not everything it changed in Commerce was undone. ${detach.detail ?? ''}`.trim();
}

/**
 * validateInput for the rename input box: reject empty/whitespace-only names
 * and case-insensitive trimmed duplicates of the OTHER integration entries'
 * display names (`name ?? id`). The entry's own current name stays allowed
 * (a no-op rename).
 *
 * The wizard applies the same duplicate rule in `IntegrationsStep.commitRename`
 * — it used to live in a `RenameIntegrationModal`, which the shared card's
 * inline pencil replaced. It does NOT share the empty-name branch:
 * `InlineRenameField` cancels an empty value before any host commit runs, so
 * only THIS path — a VS Code input box, with no such guard — must reject it.
 */
function validateRenameInput(value: string, takenNames: string[]): string | undefined {
    const trimmed = value.trim();
    if (trimmed === '') {
        return 'Enter a name.';
    }
    const lowered = trimmed.toLowerCase();
    if (takenNames.some((taken) => taken.trim().toLowerCase() === lowered)) {
        return 'That name is already used by another integration.';
    }
    return undefined;
}

/** The OTHER integration entries' display names (`name ?? id`) — the rename collision domain. */
function takenIntegrationNames(project: Project, id: string): string[] {
    return listAppBuilderComponents(project)
        .filter((entry) => entry.kind === 'integration' && entry.id !== id)
        .map((entry) => entry.name ?? entry.id);
}

/**
 * Resolve the new display name for a rename. Two doors, ONE validation chain:
 *   - inline payload `name` (drawer rename) → validateRenameInput directly;
 *     a failure comes back as `error` for inline display in the webview.
 *   - no payload name → the extension's input box (validateInput enforces the
 *     same rules live); `cancelled` when dismissed — write nothing.
 */
async function resolveRenameName(
    payloadName: string | undefined,
    currentLabel: string,
    takenNames: string[],
): Promise<{ name: string } | { error: string } | { cancelled: true }> {
    if (payloadName !== undefined) {
        const error = validateRenameInput(payloadName, takenNames);
        return error ? { error } : { name: payloadName.trim() };
    }
    const raw = await vscode.window.showInputBox({
        prompt: 'New integration name',
        value: currentLabel,
        validateInput: (value) => validateRenameInput(value, takenNames),
    });
    if (raw === undefined) {
        return { cancelled: true };
    }
    return { name: raw.trim() };
}

/**
 * Handle 'renameAppBuilderComponent' — display-name rename for a deployed
 * integration (shell instancing Step 10). The id (map key, folder, ow.package)
 * is IMMUTABLE; only the keyed entry's `name` changes. Mesh entries keep their
 * fixed "API Mesh" identity and are rejected. A LOCAL metadata write: no Adobe
 * guards (rename works offline). The extension owns the input surface — UNLESS
 * the payload carries an inline `name` (the drawer's InlineRenameField), which
 * skips the input box and round-trips validation errors for inline display.
 * Cancel writes nothing.
 */
export const handleRenameAppBuilderComponent: MessageHandler<{
    id?: string;
    name?: string;
}> = async (context, payload) => {
    const target = await resolveComponentTarget(context, payload?.id);
    if (!target.ok) return target.error;
    const { id, project } = target;

    const entry = getAppBuilderComponent(project, id);
    if (!entry || entry.kind !== 'integration') {
        return {
            success: false,
            error: 'Only integrations can be renamed',
            code: ErrorCode.INVALID_OPERATION,
        };
    }

    // Pre-built CATALOG integrations are excluded: the runner resolves
    // catalog-first and rewrites `name: entry.name` on every redeploy, so a
    // rename would be silently reverted. Same exclusion the settings
    // serializer applies (deriveAppBuilderComponentSources).
    // A second copy of a pre-built integration (AB-23) is pre-built too.
    if (getAppBuilderComponentEntry(entry.catalogId ?? id) !== undefined) {
        return {
            success: false,
            error: 'Pre-built catalog integrations cannot be renamed',
            code: ErrorCode.INVALID_OPERATION,
        };
    }

    const takenNames = takenIntegrationNames(project, id);
    const resolved = await resolveRenameName(payload?.name, entry.name ?? id, takenNames);
    if ('cancelled' in resolved) {
        return { success: true }; // cancelled — nothing written
    }
    if ('error' in resolved) {
        return { success: false, error: resolved.error, code: ErrorCode.CONFIG_INVALID };
    }

    const { name } = resolved;
    await context.stateManager.saveProject(setAppBuilderComponent(project, id, { ...entry, name }));
    // Same per-row channel the deploy path pushes — the status is unchanged
    // (the entry's current one); the name rides along to refresh the row label.
    await postRowStatus(id, entry.status, undefined, name);
    await postComponentsSnapshot(context);
    // The TRIMMED name, which is not necessarily what the caller sent. Additive:
    // the drawer's InlineRenameField reads `success`/`error` and ignores this.
    // `rename_integration` does not — a bare success renders as "{}".
    return { success: true, renamed: { id, name } };
};
