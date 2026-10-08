/**
 * Project Handlers
 *
 * Handles Adobe project management:
 * - get-projects: Fetch projects for current organization
 * - select-project: Select a specific project
 */

import { classifyTransience } from '@/core/errors';
import { withTimeout } from '@/core/utils/promiseUtils';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { isTimeoutError } from '@/core/utils/timeoutError';
import { validateProjectId } from '@/core/validation/validators/AdobeResourceValidator';
import {
    ensureOrgContext,
    type EnsureOrgContextResult,
} from '@/features/authentication/services/ensureOrgContext';
import { stampProjectsDeletable } from '@/features/authentication/services/projectOwnership';
import { isConsoleOpFailure, type AdobeProject } from '@/features/authentication/services/types';
import { ErrorCode } from '@/types/errorCodes';
import { HandlerContext, HandlerResponse } from '@/types/handlers';
import { DataResult, SimpleResult } from '@/types/results';
import { toError } from '@/types/typeGuards';

/**
 * Route a target org through the canonical ensureOrgContext helper, using the
 * authenticated org list as the selectable source. Returns the typed result so
 * handlers can branch (ok vs org_mismatch/needs_relogin/access_revoked) WITHOUT
 * ever running the store-mutating `aio console * select`.
 *
 * Exported for sibling handlers (e.g. deleteAdobeProjectHandler) that need the
 * same org gate.
 */
export async function resolveOrgContext(
    context: HandlerContext,
    orgId: string,
): Promise<EnsureOrgContextResult> {
    return ensureOrgContext(orgId, {
        listSelectableOrgs: async () => {
            // Throw rather than `?? []` on a missing auth service. An empty list is
            // indistinguishable from "this account cannot see that org", so the old
            // fallback turned a wiring bug into a confident, wrong org-mismatch
            // message — see showIntegrations' handler context (2026-07-31).
            if (!context.authManager) {
                throw new Error(
                    'No authentication service on this handler context — cannot list orgs.',
                );
            }
            const orgs = await context.authManager.getOrganizations();
            return orgs.map((org) => ({ id: org.id, code: org.code, name: org.name }));
        },
    });
}

/** User-facing copy for each non-ok org-context status (NO terminal instruction). */
function orgMismatchMessage(status: EnsureOrgContextResult['status']): string {
    if (status === 'needs_relogin') {
        return (
            'This organization is not available on your current Adobe account. ' +
            'Sign in with the correct account to continue.'
        );
    }
    if (status === 'access_revoked') {
        return 'Your access to this organization has changed. Choose a different organization.';
    }
    return (
        'This operation needs a different Adobe organization. ' +
        'Select the correct organization to continue.'
    );
}

/**
 * Send a structured ORG_MISMATCH message and return a failed DataResult.
 * Carries the ErrorCode + targetOrg so the UI can offer an in-app remedy.
 *
 * Exported for sibling handlers that reuse the org gate (see resolveOrgContext).
 */
export async function sendOrgMismatch<T>(
    context: HandlerContext,
    channel: string,
    ctxResult: EnsureOrgContextResult,
): Promise<DataResult<T>> {
    const message = orgMismatchMessage(ctxResult.status);
    await context.sendMessage(channel, {
        error: message,
        code: ErrorCode.ORG_MISMATCH,
        targetOrg: ctxResult.targetOrg,
        status: ctxResult.status,
    });
    return { success: false, error: message, code: ErrorCode.ORG_MISMATCH };
}

/**
 * get-projects - Fetch projects for current organization
 *
 * Retrieves list of Adobe App Builder projects accessible to the
 * current user in the selected organization.
 */
export async function handleGetProjects(
    context: HandlerContext,
    payload?: { orgId?: string; quiet?: boolean },
): Promise<DataResult<AdobeProject[]>> {
    const orgId = payload?.orgId;
    // `quiet` = a read the user did not ask for (background hydration). It takes
    // the SDK-only fetch, which degrades to [] instead of falling back to `aio
    // console project list --json` — a CLI call that opens a browser on a stale
    // token. P1: nothing the user did not initiate may launch a browser.
    const quiet = payload?.quiet === true;

    // When the caller names a target org, establish targeting through the
    // canonical helper before fetching. A mismatch yields a structured,
    // in-app-actionable message (ORG_MISMATCH + targetOrg) — never the old
    // "run aio console org select in your terminal" dead-end.
    if (orgId) {
        const ctxResult = await resolveOrgContext(context, orgId);
        if (ctxResult.status !== 'ok') {
            return sendOrgMismatch(context, 'get-projects', ctxResult);
        }
    }

    try {
        // Send loading status with sub-message
        const currentOrg = await context.authManager?.getEntityServices()
            .then((units) => units.resolver.getCurrentOrganization());
        if (currentOrg) {
            await context.sendMessage('project-loading-status', {
                isLoading: true,
                message: 'Loading your Adobe projects',
                subMessage: `Fetching from organization: ${currentOrg.name || 'your organization'}`,
            });
        }

        // Wrap getProjects with timeout (30 seconds). Thread orgId so the fetch
        // runs under org-context targeting (AIO_CONSOLE_* env, no global mutation).
        const projectsPromise = quiet
            ? context.authManager?.getEntityServices().then((units) =>
                  units.reads.getProjectsSdkOnly(orgId ? { orgId } : undefined),
              )
            : orgId
              ? context.authManager?.getProjects({ orgId })
              : context.authManager?.getProjects();
        if (!projectsPromise) {
            throw new Error('Auth manager not available');
        }
        const projects = await withTimeout(projectsPromise, {
            timeoutMs: TIMEOUTS.NORMAL,
            // A NOUN PHRASE: TimeoutError composes "<operation> took too long...".
            timeoutMessage: 'Loading your Adobe projects',
        });
        // Stamp ownership (deletable) so the webview only offers delete on
        // projects the current token user created (fail closed on unknowns).
        const stamped = await stampProjectsDeletable(context.authManager, projects);
        await context.sendMessage('get-projects', stamped);
        return { success: true, data: stamped };
    } catch (error) {
        // Code from the guess, sentence from an error we wrote — see workspaceHandlers.
        const code =
            classifyTransience(error).kind === 'timeout' ? ErrorCode.TIMEOUT : ErrorCode.UNKNOWN;
        const originalMessage = error instanceof Error ? error.message : '';
        // These two ARE this extension's own words, thrown by the org guard and the
        // auth layer, which is why they are passed through rather than replaced.
        const hasActionableMessage =
            originalMessage.includes('organization') || originalMessage.includes('AUTH_EXPIRED');
        const errorMessage = isTimeoutError(error)
            ? error.userMessage
            : hasActionableMessage
              ? originalMessage.replace('AUTH_EXPIRED: ', '')
              : 'Failed to load projects. Please try again.';

        context.logger.error('Failed to get projects:', error);
        await context.sendMessage('get-projects', {
            error: errorMessage,
            code,
        });
        return { success: false, error: errorMessage, code };
    }
}

/**
 * select-project - Select an Adobe project
 *
 * Sets the specified project as the current project context
 * in Adobe CLI configuration.
 *
 * Requires org ID to protect against context drift
 * (e.g., when another process changes the global Adobe CLI context).
 */
export async function handleSelectProject(
    context: HandlerContext,
    payload: { projectId: string },
): Promise<SimpleResult> {
    const { projectId } = payload;

    // SECURITY: Validate project ID to prevent command injection
    try {
        validateProjectId(projectId);
    } catch (validationError) {
        context.logger.error('[Project] Invalid project ID', validationError as Error);
        throw new Error(`Invalid project ID: ${toError(validationError).message}`);
    }

    try {
        // Get org ID for context guard (required for drift protection)
        const currentOrg = await context.authManager?.getEntityServices()
            .then((units) => units.resolver.getCurrentOrganization());
        if (!currentOrg?.id) {
            throw new Error('No organization selected - cannot select project without org context');
        }

        // Route through the canonical helper so we never accept a project under a
        // wrong-org context. A mismatch surfaces a structured ORG_MISMATCH message
        // (no terminal instruction) and aborts the selection.
        const ctxResult = await resolveOrgContext(context, currentOrg.id);
        if (ctxResult.status !== 'ok') {
            await context.sendMessage('error', {
                message: 'Failed to select project',
                details: orgMismatchMessage(ctxResult.status),
                code: ErrorCode.ORG_MISMATCH,
                targetOrg: ctxResult.targetOrg,
                status: ctxResult.status,
            });
            throw new Error(`ORG_MISMATCH: cannot select project in org ${currentOrg.id}`);
        }

        // Phase 4a: the chosen project lives in webview state and is threaded
        // per-op (each `aio` operation runs under `withOrgContext` with the
        // project target). Accept the selection and ack it WITHOUT mutating the
        // shared `aio` global via selectProject (which races concurrent
        // processes). ensureOrgContext above already validated reachability.
        try {
            await context.sendMessage('projectSelected', { projectId });
        } catch (sendError) {
            context.debugLogger.debug(
                '[Project] Failed to send projectSelected message:',
                sendError,
            );
            throw new Error(
                `Failed to send project selection response: ${toError(sendError).message}`,
            );
        }

        return { success: true };
    } catch (error) {
        context.debugLogger.debug('[Project] Exception caught in handleSelectProject:', error);
        context.logger.error('Failed to select project:', error as Error);
        await context.sendMessage('error', {
            message: 'Failed to select project',
            details: toError(error).message,
        });
        // Re-throw so the handler can send proper response
        throw error;
    }
}

/**
 * create-adobe-project — create a new Adobe I/O App Builder project in-app.
 *
 * The "New" affordance is always offered; permission is validated HERE. Checks developer
 * permission and, when absent, returns an `AUTH_FORBIDDEN`-coded error the UI surfaces
 * inline (telegraph-on-attempt, no pre-flight probe). On success, returns the refreshed
 * project list alongside the new project so the caller can seed its cache — see the
 * comment on that block for why this must not be a push. Never throws.
 */
export async function handleCreateAdobeProject(
    context: HandlerContext,
    payload: { name: string; description?: string },
): Promise<HandlerResponse> {
    if (!context.authManager) {
        return { success: false, error: 'Authentication not available' };
    }

    const name = (payload?.name ?? '').trim();
    const description = payload?.description ?? '';

    try {
        // Defensive permission re-check (guards a stale probe) → UI drops to Flow B.
        const { hasPermissions, error: permError } =
            await context.authManager.testDeveloperPermissions();
        if (!hasPermissions) {
            return {
                success: false,
                code: ErrorCode.AUTH_FORBIDDEN,
                error:
                    permError ||
                    'You do not have permission to create projects in this organization. Select an existing project instead.',
            };
        }

        if (!name) {
            return { success: false, error: 'Project name is required.' };
        }

        const { projectOps } = await context.authManager.getEntityServices();
        const project = await projectOps.createProject(name, description);
        if (isConsoleOpFailure(project)) {
            // The service carries Console's own reason now — surface it instead
            // of the old quota guess, which the measured failure never matched.
            return { success: false, error: `Could not create the project: ${project.error}` };
        }

        // Refresh the project list and return it ON THIS RESPONSE (best-effort).
        // It must NOT be a `sendMessage` push: the only listener for `get-projects`
        // lives in AdobeProjectPicker, and every create path has replaced that
        // picker with the create panel (AdobeProjectField) or a phase spinner
        // (the Add Integration flow) by the time this runs. WebviewClient drops a
        // message with no registered listener, so the pushed refresh was lost and
        // the remounted picker read a stale cache — a list missing the project the
        // user had just made. The caller awaits this response, so it always lands.
        // Goes through the SAME deletable stamping as get-projects.
        let projects: AdobeProject[] | undefined;
        try {
            projects = await stampProjectsDeletable(
                context.authManager,
                await context.authManager.getProjects(),
            );
        } catch (refreshError) {
            // Omitted, not empty: the caller clears its cache and reloads.
            context.debugLogger.debug('[Project] Post-create refresh failed:', refreshError);
        }

        context.logger.info(`[Project] Created App Builder project: ${project.name}`);
        return { success: true, data: project, projects };
    } catch (error) {
        context.logger.error('[Project] Failed to create project:', error as Error);
        return { success: false, error: `Failed to create project: ${toError(error).message}` };
    }
}
