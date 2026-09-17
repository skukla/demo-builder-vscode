/**
 * App Management install-state handlers (AB-5).
 *
 * The manifest has persisted `appBuilderComponents[id].installation` since the
 * install pass shipped, and NOTHING rendered or served it — answering "did it
 * install, and which step failed?" took a hand-scripted GET three times in one
 * session. These two handlers are that read and its remedy:
 *
 * - `getAppBuilderInstallStatus` — the app's own GET /installation (live step
 *   tree included), plus the persisted record. Read-only, headless-safe.
 * - `installAppBuilderComponent` — re-run the install/associate pass WITHOUT a
 *   redeploy; until this, the only retry for a failed install was a full
 *   deploy round.
 * - `reinstallAppBuilderComponent` — uninstall then install, only for an app
 *   Commerce refused to upgrade in place (AB-13).
 *
 * Split from `appBuilderComponentHandlers.ts` (899 lines) rather than grown
 * into it; the guard chain, target resolution, and progress telegraph are that
 * module's exports, so the two files cannot drift on them.
 *
 * @module features/dashboard/handlers/appManagementInstallHandlers
 */

import {
    guardOrBlock,
    resolveComponentTarget,
    postComponentsSnapshot,
    withComponentProgress,
    type GuardableResult,
} from './appBuilderComponentHandlers';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { getAppBuilderComponent, recordInstallation } from '@/core/state/appBuilderComponentState';
import {
    AppManagementClient,
    type InstallationState,
    type StepStatus,
} from '@/features/app-builder/services/appManagementClient';
import { deriveAppManagementBaseUrl } from '@/features/app-builder/services/appManagementInstaller';
import { reinstallAppManagementApp } from '@/features/app-builder/services/appManagementReinstall';
import type { AppManagementInstallResult } from '@/features/app-builder/services/appManagementUpgrade';
import type { AppBuilderComponentRunnerDeps } from '@/features/app-builder/services/appBuilderComponentRunner';
import {
    buildCustomIntegrationEntry,
    getAppBuilderComponentEntry,
} from '@/features/components/services/appBuilderComponentCatalogLoader';
import {
    buildDefaultRunnerDeps,
    buildRunnerDepsContext,
    resolveAppManagementAuth,
} from '@/features/project-creation/services/appBuilderComponentRunnerDeps';
import type { AppBuilderComponentState, Project } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext, HandlerResponse, MessageHandler } from '@/types/handlers';

/**
 * The entry's lifecycle, resolved the way the runner resolves it: catalog row
 * first, then the persisted source through recognition — so a seeded kit
 * instance under a custom id still identifies as app-management.
 */
function resolveLifecycle(id: string, state: AppBuilderComponentState): string | undefined {
    const catalogEntry = getAppBuilderComponentEntry(id);
    if (catalogEntry) {
        return catalogEntry.lifecycle;
    }
    return buildCustomIntegrationEntry(
        {
            owner: state.source.owner,
            repo: state.source.repo,
            branch: state.source.branch,
            name: state.name ?? id,
        },
        id,
    ).lifecycle;
}

/** Walk the install step tree, collecting the names of every failed step. */
function collectFailedSteps(step: StepStatus | undefined, into: string[] = []): string[] {
    if (!step) return into;
    if (step.status === 'failed') {
        into.push(step.name);
    }
    for (const child of step.children ?? []) {
        collectFailedSteps(child, into);
    }
    return into;
}

/** The live state, shaped for an agent: status + timing + failed step names. */
function shapeLiveState(state: InstallationState | undefined): Record<string, unknown> {
    if (!state) {
        return { status: 'never-installed' };
    }
    const failedSteps = collectFailedSteps(state.step);
    return {
        status: state.status,
        startedAt: state.startedAt,
        completedAt: state.completedAt,
        ...(failedSteps.length > 0 ? { failedSteps } : {}),
    };
}

/**
 * Handle 'getAppBuilderInstallStatus' — the persisted install record plus the
 * app's LIVE installation state (its own GET /installation). Read-only: no
 * guards, no prompts — a missing sign-in comes back as a typed AUTH_REQUIRED
 * rather than a dialog, so the MCP surface can serve it headless.
 */
export const handleGetAppBuilderInstallStatus: MessageHandler<{ id?: string }> = async (
    context,
    payload,
): Promise<HandlerResponse> => {
    const target = await resolveComponentTarget(context, payload?.id);
    if (!target.ok) return target.error;
    const { id, project } = target;

    const state = getAppBuilderComponent(project, id);
    if (!state) {
        return {
            success: false,
            error: `Integration "${id}" not found.`,
            code: ErrorCode.PROJECT_NOT_FOUND,
        };
    }
    const baseUrl = deriveAppManagementBaseUrl(state.deployedUrls);
    if (!baseUrl) {
        return {
            success: false,
            error: `"${id}" is not an App Management app (it deploys no install API), so it has no install state.`,
            code: ErrorCode.INVALID_OPERATION,
        };
    }
    const auth = await resolveAppManagementAuth(project, ServiceLocator.getAuthenticationService());
    if (!auth) {
        return {
            success: false,
            error: 'Adobe sign-in required to read the install state.',
            code: ErrorCode.AUTH_REQUIRED,
        };
    }

    try {
        const live = await new AppManagementClient(baseUrl, auth).getInstallationState();
        return {
            success: true,
            data: {
                id,
                persisted: state.installation,
                live: shapeLiveState(live),
            },
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { success: false, error: `Could not read the install state: ${message}` };
    }
};

/** Everything an install-pass handler needs once the target checks pass. */
interface InstallPass {
    project: Project;
    state: AppBuilderComponentState;
    deps: AppBuilderComponentRunnerDeps;
    report: (message: string) => void;
    appVersion: string | undefined;
}

type InstallPassCheck = (id: string, state: AppBuilderComponentState) => string | undefined;

/**
 * The shared body of install and reinstall: resolve a DEPLOYED app-management
 * integration, run the guards and build the runner deps under a progress
 * notification, run `pass`, then persist its outcome where the drawer and
 * get_integration_install_status read it.
 */
async function runInstallPass(
    context: HandlerContext,
    requestedId: string | undefined,
    title: string,
    /** Resolves to the outcome, or to a reason string when the pass is not wired (nothing persisted). */
    pass: (input: InstallPass) => Promise<AppManagementInstallResult | string>,
    check?: InstallPassCheck,
): Promise<HandlerResponse> {
    const target = await resolveComponentTarget(context, requestedId);
    if (!target.ok) return target.error;
    const { id, project } = target;

    const state = getAppBuilderComponent(project, id);
    if (!state || state.kind !== 'integration') {
        return {
            success: false,
            error: `Integration "${id}" not found.`,
            code: ErrorCode.PROJECT_NOT_FOUND,
        };
    }
    const refusal = refuseInstallPass(id, state) ?? check?.(id, state);
    if (refusal) {
        return { success: false, error: refusal, code: ErrorCode.INVALID_OPERATION };
    }

    const result = await withComponentProgress(
        { title, id, label: state.name ?? id, noun: 'Integration', logger: context.logger },
        async (report): Promise<GuardableResult & { detail?: string }> => {
            const refused = await guardOrBlock(context, project, report);
            if (refused) {
                return refused;
            }

            const deps = buildDefaultRunnerDeps(
                await buildRunnerDepsContext(context, project, {
                    authManager: ServiceLocator.getAuthenticationService(),
                    commandManager: ServiceLocator.getCommandExecutor(),
                }),
                (message, subMessage) => report(subMessage || message),
            );
            const componentPath = project.componentInstances?.[id]?.path;
            const appVersion = componentPath ? await deps.readAppVersion?.(componentPath) : undefined;
            const outcome = await pass({ project, state, deps, report, appVersion });
            if (typeof outcome === 'string') {
                return { success: false, error: outcome };
            }
            // Same persistence the deploy tail's install pass writes — the
            // drawer and the status read serve THIS record.
            recordInstallation(state, outcome);
            await context.stateManager.saveProject(project);
            return outcome.status === 'failed'
                ? { success: false, error: outcome.detail, detail: outcome.detail }
                : { success: true, detail: outcome.detail };
        },
    );

    // The persisted record changed — refresh the grid/drawer either way.
    await postComponentsSnapshot(context);
    return result.success
        ? { success: true, installation: state.installation }
        : { success: false, error: result.error, code: result.code };
}

/** Why an integration cannot take an install pass at all, if it cannot. */
function refuseInstallPass(id: string, state: AppBuilderComponentState): string | undefined {
    if (resolveLifecycle(id, state) !== 'app-management') {
        return `"${id}" does not install into Commerce (only App Management apps do).`;
    }
    if (state.status !== 'deployed') {
        return `"${id}" is not deployed yet — deploy it first (the deploy runs the install).`;
    }
    return undefined;
}

/**
 * Handle 'installAppBuilderComponent' — re-run the Commerce install/associate
 * pass for a DEPLOYED app-management app, without redeploying it. Guards →
 * the same installer the deploy tail runs → persist the outcome where the
 * drawer and get_integration_install_status read it.
 */
export const handleInstallAppBuilderComponent: MessageHandler<{ id?: string }> = async (
    context: HandlerContext,
    payload,
): Promise<HandlerResponse> =>
    runInstallPass(context, payload?.id, 'Installing', async ({ project, state, deps, report, appVersion }) => {
        // Always wired by buildDefaultRunnerDeps; the field is optional only
        // for bare unit-test deps, so a guard beats asserting it away.
        if (!deps.installAppManagement) {
            return 'The install pass is not available.';
        }
        return deps.installAppManagement(project, state.deployedUrls, report, { appVersion });
    });

/**
 * Handle 'reinstallAppBuilderComponent' — uninstall the app from Commerce and
 * install it again from the code already deployed. Destructive (the uninstall
 * removes what the app set up in Commerce), so it is refused unless Commerce
 * has refused an in-place upgrade: that record is the only state that needs it.
 */
export const handleReinstallAppBuilderComponent: MessageHandler<{ id?: string }> = async (
    context: HandlerContext,
    payload,
): Promise<HandlerResponse> =>
    runInstallPass(
        context,
        payload?.id,
        'Reinstalling',
        async ({ project, state, deps, report, appVersion }) => {
            const { installAppManagement, uninstallAppManagement } = deps;
            if (!installAppManagement || !uninstallAppManagement) {
                return 'The reinstall is not available.';
            }
            return reinstallAppManagementApp({
                uninstall: () => uninstallAppManagement(project, state.deployedUrls, report),
                install: () => installAppManagement(project, state.deployedUrls, report, { appVersion }),
            });
        },
        (id, state) =>
            state.installation?.needsReinstall
                ? undefined
                : `"${id}" does not need a reinstall: Commerce has not refused an upgrade of it.`,
    );
