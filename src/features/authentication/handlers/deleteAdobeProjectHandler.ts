/**
 * Delete Adobe Project Handler
 *
 * Handles the delete-adobe-project message: after a native confirmation
 * modal, tears down a Console project (event registrations + 3rd-party
 * providers, then the project itself) via `teardownConsoleProject`, and
 * finalizes on the extension side — conditional console-selection clear,
 * project-list refresh, and an outcome toast.
 *
 * Ordering mirrors the house handler shape (validate → org gate → confirm →
 * service → shaped result). Per-entity failures never throw; the teardown
 * result travels back to the webview as `data`.
 */

import * as vscode from 'vscode';
import { resolveOrgContext, sendOrgMismatch } from './projectHandlers';
import { validateOrgId, validateProjectId } from '@/core/validation';
import { BASELINE_API } from '@/features/app-builder';
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import {
    teardownConsoleProject,
    type ConsoleProjectTeardownResult,
    type TeardownDeps,
    type TeardownTarget,
} from '@/features/authentication/services/consoleProjectTeardown';
import { IoEventsClient } from '@/features/authentication/services/ioEventsClient';
import {
    stampProjectsDeletable,
    verifyProjectOwnership,
} from '@/features/authentication/services/projectOwnership';
import { ErrorCode } from '@/types/errorCodes';
import { HandlerContext, HandlerResponse } from '@/types/handlers';

/** Confirm-button label; the modal resolves to this string when accepted. */
const DELETE_CONFIRM_LABEL = 'Delete Project';

/**
 * Display cap for the webview-supplied `projectTitle` (it is unvalidated —
 * only the ids are). Keeps the confirm modal readable and un-spoofable-by-length;
 * the immutable `projectId` shown in the modal detail is the real anchor.
 */
const MAX_TITLE_LENGTH = 100;

export interface DeleteAdobeProjectPayload {
    projectId: string;
    projectTitle?: string;
    orgId: string;
}

/**
 * Build the narrow {@link TeardownDeps} adapter over AuthenticationService.
 * Exported for tests — the adapter is where the service-call shapes live
 * (BASELINE_API serviceInfo array, token guard, workspace mapping).
 */
export function createTeardownDeps(authService: AuthenticationService): TeardownDeps {
    return {
        getWorkspaces: async ({ orgId, projectId }) => {
            const workspaces = await authService.getWorkspaces({ orgId, projectId });
            return workspaces.map((workspace) => ({ id: workspace.id, name: workspace.name }));
        },
        getWorkspaceS2SCredential: (orgId, projectId, workspaceId) =>
            authService.getWorkspaceS2SCredential(orgId, projectId, workspaceId),
        createWorkspaceS2SCredentialFor: (orgId, projectId, workspaceId) =>
            authService.createWorkspaceS2SCredentialFor(orgId, projectId, workspaceId),
        subscribeManagementApi: (orgId, idIntegration) =>
            authService.subscribeOAuthServerToServerIntegrationToServices(orgId, idIntegration, [
                { sdkCode: BASELINE_API, licenseConfigs: null, roles: null },
            ]),
        deleteConsoleProject: (orgId, projectId) =>
            authService.deleteConsoleProject(orgId, projectId),
        getAccessToken: async () => {
            const inspection = await authService.getTokenManager().inspectToken();
            if (!inspection.valid || !inspection.token) {
                throw new Error('Adobe sign-in required — no valid access token available.');
            }
            return inspection.token;
        },
        createEventsClient: (auth) => new IoEventsClient(auth),
    };
}

/** Validate the payload; returns a shaped failure or undefined when valid. */
function validateDeletePayload(
    context: HandlerContext,
    payload: DeleteAdobeProjectPayload | undefined,
): HandlerResponse | undefined {
    if (!payload?.projectId || !payload?.orgId) {
        return {
            success: false,
            error: 'projectId and orgId are required to delete an Adobe project.',
            code: ErrorCode.PROJECT_INVALID,
        };
    }
    // SECURITY: these ids flow into Adobe Console/Events API paths.
    try {
        validateOrgId(payload.orgId);
        validateProjectId(payload.projectId);
    } catch (validationError) {
        context.logger.error('[Project] Invalid Adobe resource ID', validationError as Error);
        return {
            success: false,
            error: `Invalid Adobe resource ID: ${(validationError as Error).message}`,
            code: ErrorCode.PROJECT_INVALID,
        };
    }
    return undefined;
}

/**
 * Native modal confirmation; resolves true only on an explicit "Delete Project".
 * The detail always names the validated, immutable `projectId` so the user can
 * verify WHAT gets deleted even if the (webview-supplied) title were misleading.
 */
async function confirmDeletion(title: string, projectId: string): Promise<boolean> {
    const choice = await vscode.window.showWarningMessage(
        `Delete "${title}"?`,
        {
            modal: true,
            detail: 'Permanently deletes this Adobe I/O project, its event registrations, '
                + 'and event providers from Adobe Developer Console. This cannot be undone.'
                + `\n\nProject ID: ${projectId}`,
        },
        DELETE_CONFIRM_LABEL,
    );
    return choice === DELETE_CONFIRM_LABEL;
}

/** Run the teardown under a notification progress bar ("Step N/M: message"). */
function runTeardownWithProgress(
    deps: TeardownDeps,
    target: TeardownTarget,
): Thenable<ConsoleProjectTeardownResult> {
    return vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Deleting Adobe project…',
            cancellable: false,
        },
        (progress) => teardownConsoleProject(deps, target, (p) =>
            progress.report({ message: `Step ${p.step}/${p.totalSteps}: ${p.message}` })),
    );
}

/**
 * Clear the aio console selection IF it points at the deleted project.
 * Mechanism: `getCachedProject()` mirrors the resolved console selection, so
 * comparing its id against the deleted project is the smallest correct check
 * before the store-mutating `clearConsoleContext()`. Best-effort — a failure
 * here never flips the teardown result.
 */
async function clearSelectionIfCurrent(
    context: HandlerContext,
    result: ConsoleProjectTeardownResult,
    projectId: string,
): Promise<void> {
    if (!result.shouldClearConsoleSelection) {
        return;
    }
    try {
        const cached = context.authManager?.getCachedProject();
        if (cached?.id === projectId) {
            await context.authManager?.clearConsoleContext();
        }
    } catch (clearError) {
        context.debugLogger.debug('[Project] Post-delete selection clear failed:', clearError);
    }
}

/**
 * Refresh the project list for the org (mirrors handleCreateAdobeProject;
 * best-effort). The push goes through the SAME deletable stamping as
 * get-projects so the webview's delete affordances stay ownership-accurate.
 */
async function refreshProjects(context: HandlerContext, orgId: string): Promise<void> {
    try {
        const projects = await context.authManager?.getProjects({ orgId });
        if (projects) {
            await context.sendMessage(
                'get-projects',
                await stampProjectsDeletable(context.authManager, projects),
            );
        }
    } catch (refreshError) {
        context.debugLogger.debug('[Project] Post-delete refresh failed:', refreshError);
    }
}

/** Count deleted items of a kind for the outcome toast. */
function countDeleted(result: ConsoleProjectTeardownResult, kind: 'registration' | 'provider'): number {
    return result.items.filter((item) => item.kind === kind && item.outcome === 'deleted').length;
}

/** Success toast: what was deleted, with entity counts. */
function buildSuccessMessage(result: ConsoleProjectTeardownResult, title: string): string {
    const registrations = countDeleted(result, 'registration');
    const providers = countDeleted(result, 'provider');
    return `Deleted Adobe project "${title}" `
        + `(${registrations} event registration(s) and ${providers} event provider(s) removed).`;
}

/** Failure warning: names every failed item; the delete is safely retryable. */
function buildFailureMessage(result: ConsoleProjectTeardownResult, title: string): string {
    const failed = result.items
        .filter((item) => item.outcome === 'failed')
        .map((item) => `${item.kind} "${item.label ?? item.id}"`)
        .join(', ');
    return `Could not delete Adobe project "${title}". Failed: ${failed}. `
        + 'The project was NOT deleted. Already-removed items stay removed; '
        + 'run Delete again to retry.';
}

/** Post-teardown finalization: conditional clear, refresh, and outcome toast. */
async function finalizeTeardown(
    context: HandlerContext,
    result: ConsoleProjectTeardownResult,
    target: { orgId: string; projectId: string; title: string },
): Promise<void> {
    if (result.projectDeleted) {
        await clearSelectionIfCurrent(context, result, target.projectId);
        await refreshProjects(context, target.orgId);
        void vscode.window.showInformationMessage(buildSuccessMessage(result, target.title));
    } else {
        void vscode.window.showWarningMessage(buildFailureMessage(result, target.title));
    }
}

/**
 * Handler: delete-adobe-project
 *
 * Deletes an Adobe I/O Console project after removing its event registrations
 * and 3rd-party event providers. Confirmation is a native modal on the
 * extension side; a dismissal returns `{ success: false, cancelled: true }`
 * (house convention — cf. projectResetService). Never throws.
 */
export async function handleDeleteAdobeProject(
    context: HandlerContext,
    payload: DeleteAdobeProjectPayload,
): Promise<HandlerResponse> {
    const invalid = validateDeletePayload(context, payload);
    if (invalid) {
        return invalid;
    }
    if (!context.authManager) {
        return { success: false, error: 'Authentication not available' };
    }

    const { projectId, orgId, projectTitle } = payload;
    // SECURITY: length-cap the unvalidated webview-supplied title for display.
    const title = (projectTitle || projectId).slice(0, MAX_TITLE_LENGTH);

    // Org gate — never tear down under a wrong-org context.
    const ctxResult = await resolveOrgContext(context, orgId);
    if (ctxResult.status !== 'ok') {
        // Spread into a fresh literal: DataResult lacks HandlerResponse's index signature.
        return { ...(await sendOrgMismatch(context, 'delete-adobe-project', ctxResult)) };
    }

    // SECURITY: ownership gate — only the project's creator may delete it.
    // who_created is fetched independently (never trusted from the webview)
    // and compared to the token's own user id; unknowns fail closed.
    if (!(await verifyProjectOwnership(context.authManager, { orgId, projectId }))) {
        return {
            success: false,
            error: 'You can only delete Adobe projects you created.',
            code: ErrorCode.NOT_PROJECT_OWNER,
        };
    }

    if (!(await confirmDeletion(title, projectId))) {
        return { success: false, cancelled: true };
    }

    // Confirmed: signal the webview that teardown is starting so the picker can
    // disable the row. Deferring this until AFTER the modal keeps the row from
    // signalling activity while the user is still deciding (the native modal
    // blocks the window, so no row change is perceivable before this point).
    await context.sendMessage('project-delete-started', { projectId });

    try {
        const deps = createTeardownDeps(context.authManager);
        const result = await runTeardownWithProgress(deps, { orgId, projectId, projectTitle });
        await finalizeTeardown(context, result, { orgId, projectId, title });
        return { success: result.success, data: result };
    } catch (error) {
        // teardownConsoleProject never throws by design — anything landing here
        // is unexpected. Log the full error; return a sanitized shaped failure.
        context.logger.error('[Project] Delete Adobe project failed unexpectedly:', error as Error);
        return {
            success: false,
            error: 'Failed to delete the Adobe project. Check the logs for details.',
            code: ErrorCode.UNKNOWN,
        };
    }
}
