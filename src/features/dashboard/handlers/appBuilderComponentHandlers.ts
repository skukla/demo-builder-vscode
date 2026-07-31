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
    addAppBuilderComponent,
    deployAppBuilderComponent,
    removeAppBuilderComponent,
} from '@/features/app-builder/services/appBuilderComponentRunner';
import {
    buildDefaultRunnerDeps,
    buildRunnerDepsContext,
} from '@/features/app-builder/services/appBuilderComponentRunnerDeps';
import {
    getAppBuilderComponent,
    listAppBuilderComponents,
    setAppBuilderComponent,
} from '@/features/app-builder/services/appBuilderComponentState';
import {
    buildCustomIntegrationEntry,
    getAppBuilderComponentEntry,
} from '@/features/project-creation/services/appBuilderComponentCatalogLoader';
import { classifyEnvSchema } from '@/features/project-creation/services/envVarClassifier';
import type { Project } from '@/types';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import { ErrorCode } from '@/types/errorCodes';
import { MessageHandler, HandlerContext, HandlerResponse } from '@/types/handlers';
import { toError } from '@/types/typeGuards';

/**
 * Run the deploy guard order (auth → org-mismatch → App Builder permission).
 * Returns an error string on the first failure (caller aborts
 * WITHOUT calling the runner); undefined when all guards pass.
 *
 * Exported for the console-API handlers (consoleApiHandlers.ts), which need
 * the identical chain before touching Developer Console credentials.
 */
export async function runGuards(
    context: HandlerContext,
    project: Project,
): Promise<string | undefined> {
    const authManager = ServiceLocator.getAuthenticationService();

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
        return 'Adobe sign-in required.';
    }

    const { detectProjectOrgMismatch } = await import(
        '@/features/authentication/services/detectProjectOrgMismatch'
    );
    const orgContext = await detectProjectOrgMismatch(authManager, project, context.logger);
    if (orgContext && !orgContext.reachable) {
        return 'Project uses a different Adobe organization. Use "Switch IMS Org" to continue.';
    }

    const permission = await authManager.testDeveloperPermissions();
    if (!permission.hasPermissions) {
        return permission.error || 'Developer or System Admin role required for App Builder.';
    }

    return undefined;
}

/** Resolve the catalog entry from an add payload (catalog id OR custom source). */
function resolveAddEntry(payload: {
    id?: string;
    source?: { owner: string; repo: string };
}): AppBuilderComponentCatalogEntry | undefined {
    if (payload.source?.owner && payload.source?.repo) {
        return buildCustomIntegrationEntry(payload.source);
    }
    if (payload.id) {
        return getAppBuilderComponentEntry(payload.id);
    }
    return undefined;
}

/** True when the entry needs user-provided inputs (bucket 3: text or secret). */
function needsUserInputs(entry: AppBuilderComponentCatalogEntry): boolean {
    const { userText, userSecret } = classifyEnvSchema(entry.envSchema ?? []);
    return userText.length > 0 || userSecret.length > 0;
}

/**
 * The live per-row status vocabulary pushed over the keyed
 * `appBuilderComponentStatusUpdate` channel: the persisted union plus the
 * transient 'deploying'. Shared with the channel's sender
 * (showDashboard's sendAppBuilderComponentStatusUpdate).
 */
export type AppBuilderComponentRowStatus =
    | 'deploying'
    | 'deployed'
    | 'stale'
    | 'error'
    | 'not-deployed';

/**
 * Post a per-row status update via the dashboard command. Imported LAZILY so
 * this handler module never statically
 * pulls the webview-command class into the module-load graph (which would chain
 * BaseWebviewCommand into handler-only test contexts).
 *
 * `name` refreshes the row's display label on the same channel (rename path).
 */
async function postRowStatus(
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
async function postComponentsSnapshot(context: HandlerContext): Promise<void> {
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
export const handleAddAppBuilderComponent: MessageHandler<{
    id?: string;
    source?: { owner: string; repo: string };
}> = async (context, payload) => {
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

    // The guards run INSIDE the progress: runGuards does the auth check, whose
    // `aio config get` spawn costs seconds on a cold cache. Running it first left
    // the user clicking Add and staring at nothing until it returned.
    const result = await withComponentProgress(
        { title: 'Adding', id: entry.id, label: entry.name ?? entry.id, logger: context.logger },
        async (report): Promise<GuardableResult> => {
            report('Checking requirements…');
            const guardError = await runGuards(context, project);
            if (guardError) {
                vscode.window.showWarningMessage(guardError);
                // `blocked`, not merely failed: nothing ran, so callers must NOT
                // take the failed-op path (error row status + snapshot).
                return { success: false, error: guardError, blocked: true };
            }

            // Bucket-3 inputs → Configure FIRST (never silently deploy with missing inputs).
            if (needsUserInputs(entry)) {
                await vscode.commands.executeCommand('demoBuilder.configureProject');
                return { success: true };
            }

            report('Adding integration…');
            await postRowStatus(entry.id, 'deploying', 'Adding integration…');
            const deps = buildDefaultRunnerDeps(await buildRunnerDepsContext(context, project));
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
        return { success: false, error: result.error };
    }
    await postRowStatus(entry.id, 'deployed', undefined);
    await postComponentsSnapshot(context);
    return { success: true };
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
async function resolveComponentTarget(
    context: HandlerContext,
    id: string | undefined,
): Promise<
    { ok: true; id: string; project: Project } | { ok: false; error: HandlerResponse }
> {
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
type GuardableResult = { success: boolean; error?: string; blocked?: boolean };

/**
 * Run a slow per-integration operation with the telegraph the rest of the
 * extension already uses: a VS Code progress notification, a live row status on
 * the grid, and USER-log lines at start and finish.
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
 * @param run - the work; call its `report` to push sub-progress to both surfaces
 * @returns whatever `run` resolves to
 */
async function withComponentProgress<T extends GuardableResult>(
    options: { title: string; id: string; label: string; logger: HandlerContext['logger'] },
    run: (report: (message: string) => void) => Promise<T>,
): Promise<T> {
    const { title, id, label, logger } = options;
    logger.info(`${title} ${label}...`);

    let result = { success: false } as T;
    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `${title} ${label}`, cancellable: false },
        async (progress) => {
            result = await run((message) => {
                progress.report({ message });
                void postRowStatus(id, 'deploying', message);
            });
        },
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
async function deployById(context: HandlerContext, requestedId: string | undefined) {
    const target = await resolveComponentTarget(context, requestedId);
    if (!target.ok) return target.error;
    const { id, project } = target;

    const result = await withComponentProgress(
        { title: 'Deploying', id, label: id, logger: context.logger },
        async (report): Promise<GuardableResult> => {
            report('Checking requirements…');
            const guardError = await runGuards(context, project);
            if (guardError) {
                vscode.window.showWarningMessage(guardError);
                // `blocked`, not merely failed: nothing ran, so callers must NOT
                // take the failed-op path (error row status + snapshot).
                return { success: false, error: guardError, blocked: true };
            }

            report('Deploying…');
            await postRowStatus(id, 'deploying', 'Deploying…');
            const deps = buildDefaultRunnerDeps(await buildRunnerDepsContext(context, project));
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
    return result.success ? { success: true } : { success: false, error: result.error };
}

/** Handle 'deployAppBuilderComponent' — deploy the given appBuilderComponent's tail. */
export const handleDeployAppBuilderComponent: MessageHandler<{ id?: string }> = (
    context,
    payload,
) => deployById(context, payload?.id);

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
        { title: 'Removing', id, label: displayName, logger: context.logger },
        async (report): Promise<GuardableResult> => {
            report('Checking requirements…');
            const guardError = await runGuards(context, project);
            if (guardError) {
                vscode.window.showWarningMessage(guardError);
                // `blocked`, not merely failed: nothing ran, so callers must NOT
                // take the failed-op path (error row status + snapshot).
                return { success: false, error: guardError, blocked: true };
            }

            // Undeploy is a slow cloud op — telegraph it, or the grid sits frozen
            // while `aio app undeploy` runs with nothing on screen saying so.
            report('Removing integration…');
            await postRowStatus(id, 'deploying', 'Removing integration…');
            const deps = buildDefaultRunnerDeps(await buildRunnerDepsContext(context, project));
            return removeAppBuilderComponent(project, id, deps);
        },
    );
    if (!result.success) {
        return { success: false, error: result.error };
    }
    // The entry left the persisted map — without a snapshot the card lingers.
    await postComponentsSnapshot(context);
    return { success: true };
};

/**
 * validateInput for the rename input box: reject empty/whitespace-only names
 * and (wizard-parity with RenameIntegrationModal) case-insensitive trimmed
 * duplicates of the OTHER integration entries' display names (`name ?? id`).
 * The entry's own current name stays allowed (a no-op rename).
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
export const handleRenameAppBuilderComponent: MessageHandler<{ id?: string; name?: string }> = async (
    context,
    payload,
) => {
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
    return { success: true };
};

/**
 * Handle 'verifyAppBuilderComponent' — an ON-DEMAND, non-interactive probe (P1). It uses
 * the SDK-only org read (never a CLI/browser path, never a deploy or aio write)
 * to confirm the project's org is reachable, then posts a typed `deployed` or
 * `error` row status (P2: always a typed outcome, never a silent flip).
 */
export const handleVerifyAppBuilderComponent: MessageHandler<{ id?: string }> = async (
    context,
    payload,
) => {
    // The project is loaded as a GUARD only — verify reads the org, not the project.
    const target = await resolveComponentTarget(context, payload?.id);
    if (!target.ok) return target.error;
    const { id } = target;

    const authManager = ServiceLocator.getAuthenticationService();
    try {
        const orgs = await authManager.getOrganizationsSdkOnly();
        const reachable = Array.isArray(orgs) && orgs.length > 0;
        if (reachable) {
            await postRowStatus(id, 'deployed', undefined);
        } else {
            await postRowStatus(id, 'error', 'Could not verify (sign in to check).');
        }
    } catch (error) {
        await postRowStatus(id, 'error', toError(error).message);
    }
    return { success: true };
};
