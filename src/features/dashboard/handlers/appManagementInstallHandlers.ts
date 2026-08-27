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
import { getAppBuilderComponent } from '@/core/state/appBuilderComponentState';
import {
    AppManagementClient,
    type InstallationState,
    type StepStatus,
} from '@/features/app-builder/services/appManagementClient';
import { deriveAppManagementBaseUrl } from '@/features/app-builder/services/appManagementInstaller';
import {
    buildCustomIntegrationEntry,
    getAppBuilderComponentEntry,
} from '@/features/components/services/appBuilderComponentCatalogLoader';
import {
    buildDefaultRunnerDeps,
    buildRunnerDepsContext,
    resolveAppManagementAuth,
} from '@/features/project-creation/services/appBuilderComponentRunnerDeps';
import type { AppBuilderComponentState } from '@/types/base';
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
    const auth = await resolveAppManagementAuth(project);
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

/**
 * Handle 'installAppBuilderComponent' — re-run the Commerce install/associate
 * pass for a DEPLOYED app-management app, without redeploying it. Guards →
 * the same installer the deploy tail runs → persist the outcome where the
 * drawer and get_integration_install_status read it.
 */
export const handleInstallAppBuilderComponent: MessageHandler<{ id?: string }> = async (
    context: HandlerContext,
    payload,
): Promise<HandlerResponse> => {
    const target = await resolveComponentTarget(context, payload?.id);
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
    if (resolveLifecycle(id, state) !== 'app-management') {
        return {
            success: false,
            error: `"${id}" does not install into Commerce (only App Management apps do).`,
            code: ErrorCode.INVALID_OPERATION,
        };
    }
    if (state.status !== 'deployed') {
        return {
            success: false,
            error: `"${id}" is not deployed yet — deploy it first (the deploy runs the install).`,
            code: ErrorCode.INVALID_OPERATION,
        };
    }

    const displayName = state.name ?? id;
    const result = await withComponentProgress(
        {
            title: 'Installing',
            id,
            label: displayName,
            noun: 'Integration',
            logger: context.logger,
        },
        async (report): Promise<GuardableResult & { detail?: string }> => {
            const refused = await guardOrBlock(context, project, report);
            if (refused) {
                return refused;
            }

            const deps = buildDefaultRunnerDeps(
                await buildRunnerDepsContext(context, project),
                (message, subMessage) => report(subMessage || message),
            );
            // Always wired by buildDefaultRunnerDeps; the field is optional only
            // for bare unit-test deps, so a guard beats asserting it away.
            if (!deps.installAppManagement) {
                return { success: false, error: 'The install pass is not available.' };
            }
            const installed = await deps.installAppManagement(project, state.deployedUrls, report);
            // Same persistence the deploy tail's install pass writes — the
            // drawer and the status read serve THIS record.
            state.installation = {
                status: installed.status,
                detail: installed.detail,
                at: new Date().toISOString(),
            };
            await context.stateManager.saveProject(project);
            return installed.status === 'failed'
                ? { success: false, error: installed.detail, detail: installed.detail }
                : { success: true, detail: installed.detail };
        },
    );

    // The persisted record changed — refresh the grid/drawer either way.
    await postComponentsSnapshot(context);
    return result.success
        ? { success: true, installation: state.installation }
        : { success: false, error: result.error, code: result.code };
};
