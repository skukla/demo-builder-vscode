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
import { ServiceLocator } from '@/core/di';
import {
    getAppBuilderComponent,
    listAppBuilderComponents,
    setAppBuilderComponent,
} from '@/core/state/appBuilderComponentState';
import { cardInFlightLabel, withProgressRegister } from '@/core/vscode/progressRegister';
import {
    addAppBuilderComponent,
    deployAppBuilderComponent,
    removeAppBuilderComponent,
} from '@/features/app-builder/services/appBuilderComponentRunner';
import {
    buildCustomIntegrationEntry,
    entryFitsProjectAxes,
    getAppBuilderComponentEntry,
} from '@/features/components/services/appBuilderComponentCatalogLoader';
import {
    buildDefaultRunnerDeps,
    buildRunnerDepsContext,
} from '@/features/project-creation/services/appBuilderComponentRunnerDeps';
import { classifyEnvSchema } from '@/features/project-creation/services/envVarClassifier';
import type { Project } from '@/types';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { AppBuilderComponentKind } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';
import { MessageHandler, HandlerContext, HandlerResponse } from '@/types/handlers';
import type { AppBuilderComponentRowStatus } from '@/types/webviewPayloads';
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
        warningMessage: 'Adobe sign-in required to manage App Builder components.',
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
 * Exported for the same reason as {@link userSuppliedEnvVars}: `add_integration`'s
 * preflight must resolve the payload EXACTLY as this handler will, or it decides
 * about a different component than the one that would be added.
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
 * Exported because `add_integration`'s descriptor preflight
 * (`actionDescriptors.ts`) must reach the SAME verdict this handler does, one
 * step earlier. Two copies of that rule would be two things that must agree
 * while nothing makes them: the tool would dispatch, the handler would refuse,
 * and the panel the preflight exists to suppress would open anyway.
 */
export function userSuppliedEnvVars(entry: AppBuilderComponentCatalogEntry): UserSuppliedEnvVars {
    const { userText, userSecret } = classifyEnvSchema(entry.envSchema ?? []);
    return {
        names: [...userText, ...userSecret].map((envVar) => envVar.name),
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
async function refreshProjectStatus(context: HandlerContext): Promise<void> {
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
 * Handle 'addAppBuilderComponent' — guards → (bucket-3 → Configure) → assemble deps →
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

export const handleAddAppBuilderComponent: MessageHandler<
    AddAppBuilderComponentRequestPayload
> = async (context, payload) => {
    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { success: false, error: 'No project found', code: ErrorCode.PROJECT_NOT_FOUND };
    }

    const entry = resolveAddEntry(payload ?? {});
    if (!entry) {
        return {
            success: false,
            error: 'Unknown appBuilderComponent',
            code: ErrorCode.CONFIG_INVALID,
        };
    }

    // Stack gate: galleries filter by the project's axes, but this add-by-id
    // door resolves from the RAW catalog — without this check a Commerce-only
    // entry (the starter kit) could be added to a project with no Commerce
    // backend, then fail at install/association where nothing explains why.
    if (
        !entryFitsProjectAxes(
            entry,
            project.componentSelections?.backend ?? '',
            project.componentSelections?.frontend ?? '',
        )
    ) {
        return {
            success: false,
            error:
                `"${entry.name ?? entry.id}" isn't compatible with this project's stack` +
                (entry.compatibleBackends?.length
                    ? ` — it requires one of these backends: ${entry.compatibleBackends.join(', ')}.`
                    : '.'),
            code: ErrorCode.CONFIG_INVALID,
        };
    }

    // An id already in the keyed map means this add would REPLACE that component,
    // not sit beside it: the id is simultaneously the `appBuilderComponents` slot,
    // the clone folder, and — through `deriveOwPackage` — the OpenWhisk package, so
    // the second deploy overwrites the first on Runtime too. Neither route into
    // here mints a fresh id (`resolveAddEntry` returns a catalog entry unchanged,
    // and a custom source with no instance falls back to `${owner}-${repo}`), so
    // this is the one place that can catch it. Blank instances never reach it —
    // they carry a collision-checked id derived from the user's name.
    //
    // `status: 'error'` is exempt: the runner persists that when a clone succeeded
    // but the deploy failed, keeping the folder so the user can retry by adding
    // again. Refusing there would block the documented recovery path.
    const existing = project.appBuilderComponents?.[entry.id];
    if (existing && existing.status !== 'error') {
        return {
            success: false,
            error: `"${entry.name ?? entry.id}" is already added to this project.`,
            code: ErrorCode.CONFIG_INVALID,
        };
    }

    // Extension-layout apps (App Management generation) ship FIXED OpenWhisk
    // package names — the deploy path deliberately skips the per-id ow-package
    // rewrite for them, so two apps built from the same source in ONE workspace
    // overwrite each other on Runtime no matter what ids we mint (proven live,
    // AB-2 spike 2026-08-27). The id check above cannot catch a seeded instance
    // under a different name, so the same-source scan here is the real gate.
    // The same-id error-retry exemption stays: that path returned before this.
    if (entry.layout === 'extension') {
        const clash = Object.entries(project.appBuilderComponents ?? {}).find(
            ([existingId, component]) =>
                existingId !== entry.id &&
                component.source.owner === entry.source.owner &&
                component.source.repo === entry.source.repo,
        );
        if (clash) {
            const [, component] = clash;
            return {
                success: false,
                error:
                    `"${component.name ?? clash[0]}" is already built from ${entry.source.owner}/` +
                    `${entry.source.repo}. Apps of this kind have fixed internal package names, so a ` +
                    'second copy in the same workspace would overwrite the first. Remove the ' +
                    'existing one first, or use a separate project.',
                code: ErrorCode.CONFIG_INVALID,
            };
        }
    }

    // The guards run INSIDE the progress: runGuards does the auth check, whose
    // `aio config get` spawn costs seconds on a cold cache. Running it first left
    // the user clicking Add and staring at nothing until it returned.
    const result = await withComponentProgress(
        {
            title: 'Adding',
            id: entry.id,
            label: entry.name ?? entry.id,
            noun: kindNoun(entry.kind),
            logger: context.logger,
        },
        async (report): Promise<GuardableResult> => {
            report('Checking requirements…');
            const guardError = await runGuards(context, project);
            if (guardError) {
                vscode.window.showWarningMessage(guardError.error);
                // `blocked`, not merely failed: nothing ran, so callers must NOT
                // take the failed-op path (error row status + snapshot).
                return {
                    success: false,
                    error: guardError.error,
                    code: guardError.code,
                    blocked: true,
                };
            }

            // Bucket-3 inputs → Configure FIRST (never silently deploy with missing inputs).
            //
            // This used to return `{success: true}` for opening a panel and adding
            // NOTHING. The grid painted a component that was not there, and once
            // the same handler became the `add_integration` tool an agent had no
            // way to tell the route from a completed add — it is the defect the
            // `needsUser` convention was written against (`ai/server/handoff.ts`).
            //
            // `blocked`, like a guard refusal: nothing ran and nothing persisted,
            // so the caller must not take the failed-op path (error row + snapshot).
            // The AGENT path never reaches here — `add_integration`'s preflight
            // answers with the handoff before dispatching, so no panel opens for a
            // call the user did not make.
            const userVars = userSuppliedEnvVars(entry);
            if (userVars.names.length > 0) {
                await vscode.commands.executeCommand('demoBuilder.configureProject');
                return {
                    success: false,
                    error:
                        `"${entry.name ?? entry.id}" needs ${userVars.names.join(', ')} before it ` +
                        'can be added. Enter the values in Configure Project, then add it again.',
                    blocked: true,
                };
            }

            // Attribute the picks to THIS integration before anything subscribes.
            // Keyed by `entry.id`, which for a named blank instance is the
            // collision-checked instanceId that resolveAddEntry already applied —
            // the same key Manage APIs and the reconcile union read back.
            const picks = payload?.apis ?? [];
            if (picks.length > 0) {
                project.componentApiPicks = {
                    ...(project.componentApiPicks ?? {}),
                    [entry.id]: [...new Set(picks)],
                };
                await context.stateManager.saveProject(project);
            }

            report('Adding integration…');
            // The deploy tails report every step; hand them the notification's
            // reporter so a slow add narrates itself instead of sitting on one
            // static title for the ~70s of subscribe + install + build + deploy.
            const deps = buildDefaultRunnerDeps(
                await buildRunnerDepsContext(context, project),
                // The notification title already names the operation and its object, so
                // the step line is the SUB-step alone when one exists — joining both
                // produced two-line cards ('Deploying custom integration... Running
                // aio app deploy'; owner screenshot, 2026-08-27).
                (message, subMessage) => report(subMessage || message),
                buildToolchainConsent(context, payload?.refreshCli),
            );
            return addAppBuilderComponent(project, entry, deps);
        },
    );
    if (result.blocked) {
        return { success: false, error: result.error };
    }
    if (!result.success) {
        await postRowStatus(entry.id, 'error', result.error || 'Deployment failed');
        // Even a failed add may have persisted the entry (clone/deploy died
        // mid-flight) — the grid needs the fresh map either way.
        await postComponentsSnapshot(context);
        await refreshProjectStatus(context);
        return { success: false, error: result.error };
    }
    await postRowStatus(entry.id, 'deployed', undefined);
    await postComponentsSnapshot(context);
    await refreshProjectStatus(context);
    // Name what was added rather than answering a bare `{success: true}`.
    //
    // The webview ignores this response (the flow posts and closes; progress
    // arrives on the status channel), but `add_integration` does not: `defaultShape`
    // renders a bare success as the literal string "{}", and the id is the one
    // thing the agent needs next — to deploy, remove, or ask the status of what it
    // just added. For a CUSTOM source it never supplied that id; `resolveAddEntry`
    // derived it.
    return {
        success: true,
        added: { id: entry.id, name: entry.name ?? entry.id, kind: entry.kind },
    };
};

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
};

/** What the card calls a component: its kind, title-cased for the status line. */
function kindNoun(kind: AppBuilderComponentKind | undefined): string {
    return kind === 'mesh' ? 'Mesh' : 'Integration';
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
 * Every slow step belongs inside `run`, with `report('Checking requirements…')`
 * as its first line — the same shape `deployMeshHeadless` uses.
 *
 * @param options - the notification title, the row to telegraph, the user logger
 * @param run - the work; call its `report` to push each step to the NOTIFICATION
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
    },
    run: (report: (message: string) => void) => Promise<T>,
): Promise<T> {
    const { title, id, label, noun, logger } = options;
    logger.info(`${title} ${label}...`);

    // The register split (steps -> notification, card -> one static line) is
    // SHARED with the mesh path, which is a separate implementation of the same
    // operation. It lived in both and was reversed in only one, so a mesh
    // redeploy narrated the old way for a round of testing. It now lives once.
    const result = await withProgressRegister(
        {
            title: `${title} ${label}`,
            cardLabel: cardInFlightLabel(title, noun),
            pushCardStatus: (cardLabel) => {
                void postRowStatus(id, 'deploying', cardLabel);
            },
        },
        run,
    );

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
        },
        async (report): Promise<GuardableResult> => {
            report('Checking requirements…');
            const guardError = await runGuards(context, project);
            if (guardError) {
                vscode.window.showWarningMessage(guardError.error);
                // `blocked`, not merely failed: nothing ran, so callers must NOT
                // take the failed-op path (error row status + snapshot).
                return {
                    success: false,
                    error: guardError.error,
                    code: guardError.code,
                    blocked: true,
                };
            }

            report('Deploying…');
            // Same reuse as the add path: the deploy tail narrates its own steps.
            const deps = buildDefaultRunnerDeps(
                await buildRunnerDepsContext(context, project),
                // The notification title already names the operation and its object, so
                // the step line is the SUB-step alone when one exists — joining both
                // produced two-line cards ('Deploying custom integration... Running
                // aio app deploy'; owner screenshot, 2026-08-27).
                (message, subMessage) => report(subMessage || message),
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
    return result.success ? { success: true } : { success: false, error: result.error };
}

/** Handle 'deployAppBuilderComponent' — deploy the given appBuilderComponent's tail. */
export const handleDeployAppBuilderComponent: MessageHandler<{
    id?: string;
    refreshCli?: boolean;
}> = (context, payload) => deployById(context, payload?.id, payload?.refreshCli);

/** Redeploy is the same path (idempotent re-run of the deploy tail). */
export const handleRedeployAppBuilderComponent = handleDeployAppBuilderComponent;

/** Handle 'removeAppBuilderComponent' — guards → D1 removeAppBuilderComponent {id} (confirm is UI-side). */
export const handleRemoveAppBuilderComponent: MessageHandler<{ id?: string }> = async (
    context,
    payload,
) => {
    const target = await resolveComponentTarget(context, payload?.id);
    if (!target.ok) return target.error;
    const { id, project } = target;

    const displayName = getAppBuilderComponent(project, id)?.name ?? id;
    const result = await withComponentProgress(
        {
            title: 'Removing',
            id,
            label: displayName,
            noun: kindNoun(getAppBuilderComponent(project, id)?.kind),
            logger: context.logger,
        },
        async (report): Promise<GuardableResult> => {
            report('Checking requirements…');
            const guardError = await runGuards(context, project);
            if (guardError) {
                vscode.window.showWarningMessage(guardError.error);
                // `blocked`, not merely failed: nothing ran, so callers must NOT
                // take the failed-op path (error row status + snapshot).
                return {
                    success: false,
                    error: guardError.error,
                    code: guardError.code,
                    blocked: true,
                };
            }

            // Undeploy is a slow cloud op — telegraph it, or the grid sits frozen
            // while `aio app undeploy` runs with nothing on screen saying so.
            report('Removing integration…');
            const deps = buildDefaultRunnerDeps(await buildRunnerDepsContext(context, project));
            return removeAppBuilderComponent(project, id, deps);
        },
    );
    if (!result.success) {
        return { success: false, error: result.error };
    }
    // The entry left the persisted map — without a snapshot the card lingers.
    await postComponentsSnapshot(context);
    await refreshProjectStatus(context);
    return { success: true };
};

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
    if (getAppBuilderComponentEntry(id) !== undefined) {
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
