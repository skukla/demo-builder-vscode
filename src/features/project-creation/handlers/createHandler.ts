/**
 * Project Creation Handlers - Create Handler
 *
 * Main handler for project creation workflow with timeout and cancellation support.
 */

import * as fs from 'fs';
import { promises as fsPromises } from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { executeProjectCreation } from './executor';
import { OVERALL_TIMEOUT_MS } from './shared';
import { HandlerContext } from '@/commands/handlers/HandlerContext';
import { ServiceLocator } from '@/core/di';
import { buildOrgTargetFromProjectAdobe, withOrgContext } from '@/core/shell';
import { withTimeout } from '@/core/utils/promiseUtils';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { validateProjectNameSecurity as validateProjectName } from '@/core/validation';
import { GitHubAppNotInstalledError } from '@/features/eds/services/types';
import { getMeshNodeVersion } from '@/features/mesh/services/meshConfig';
import { MESH_DELETE_COMMAND } from '@/features/mesh/services/meshDeleteCommand';
import { ErrorCode } from '@/types/errorCodes';
import { toAppError, isTimeout } from '@/types/errors';
import { toError } from '@/types/typeGuards';
import type { CreationFailedPayload, CreationProgressPayload } from '@/types/webviewPayloads';
import type { ProjectCreationConfig } from '@/types/webviewRequests';

/**
 * Count selected components (SOP §10 compliance)
 *
 * Extracts deep optional chaining into readable helper function.
 */
function countSelectedComponents(components?: {
    frontend?: string;
    backend?: string;
    dependencies?: string[];
}): number {
    let count = 0;
    if (components?.frontend) count++;
    if (components?.backend) count++;
    count += components?.dependencies?.length || 0;
    return count;
}

/**
 * Send failure messages for validation errors (project name or duplicate)
 */
async function sendValidationFailure(
    context: HandlerContext,
    errorSummary: string,
    errorDetail: string,
): Promise<{ success: boolean }> {
    const progress: CreationProgressPayload = {
        currentOperation: 'Failed',
        progress: 0,
        message: '',
        logs: [],
        error: errorSummary,
    };
    await context.sendMessage('creationProgress', progress);

    const failed: CreationFailedPayload = {
        error: errorDetail,
        isTimeout: false,
        elapsed: '0s',
    };
    await context.sendMessage('creationFailed', failed);

    return { success: true }; // Don't throw - handler completed
}

/**
 * Validate project name and check for duplicates.
 * Returns a failure result if validation fails, or undefined to continue.
 */
async function validateProjectConfig(
    context: HandlerContext,
    config: ProjectCreationConfig,
): Promise<{ success: boolean } | undefined> {
    // SECURITY: Validate project name to prevent path traversal. The runtime
    // check stays even though the type declares it — the wire can always be
    // handed a malformed payload.
    if (typeof config.projectName !== 'string') {
        throw new Error('projectName must be a string');
    }

    try {
        validateProjectName(config.projectName);
    } catch (validationError) {
        context.logger.error('[Project Creation] Invalid project name', validationError as Error);
        const errorMessage = toError(validationError).message;
        return sendValidationFailure(
            context,
            `Invalid project name: ${errorMessage}`,
            `Invalid project name: ${errorMessage}`,
        );
    }

    // VALIDATION: Check for duplicate project name (prevents accidental overwrite)
    // This checks for valid projects (with .demo-builder.json manifest)
    // Orphaned/invalid directories will still be cleaned up by executor
    // In edit mode, allow the original project name (same project being edited)
    const existingProjects = await context.stateManager.getAllProjects();
    const isEditMode = Boolean(config.editProjectPath);
    const duplicateProject = existingProjects.find((p) => {
        if (p.name !== config.projectName) return false;
        // In edit mode, allow if it's the same project being edited
        if (isEditMode && p.path === config.editProjectPath) return false;
        return true;
    });

    if (duplicateProject) {
        context.logger.warn(
            `[Project Creation] Project "${config.projectName}" already exists at: ${duplicateProject.path}`,
        );
        return sendValidationFailure(
            context,
            `Project "${config.projectName}" already exists`,
            `Project "${config.projectName}" already exists. Please choose a different name or delete the existing project first.`,
        );
    }

    return undefined; // Validation passed
}

/** The Adobe org/project identity used to target the orphaned-mesh cleanup. */
type CleanupAdobeRef =
    | { organization?: string; projectId?: string; workspace?: string }
    | undefined;

/**
 * Cleanup partial project directory and orphaned mesh on failure.
 */
async function cleanupOnFailure(
    context: HandlerContext,
    projectPath: string,
    isEditMode: boolean,
    adobeRef: CleanupAdobeRef,
): Promise<void> {
    try {
        if (isEditMode) {
            context.logger.debug(
                '[Project Edit] Edit failed - preserving existing project (not deleting)',
            );
            context.logger.info(
                '[Project Edit] Edit operation failed. Your existing project has been preserved.',
            );
        } else if (fs.existsSync(projectPath)) {
            context.logger.debug(
                `[Project Creation] Cleaning up partial project at ${projectPath}`,
            );
            await fsPromises.rm(projectPath, { recursive: true, force: true });
            await context.stateManager.clearProject();
            context.logger.debug('[Project Creation] Cleanup complete');
        }

        await cleanupOrphanedMesh(context, adobeRef);
    } catch (cleanupError) {
        context.logger.warn(
            '[Project Creation] Failed to cleanup partial project',
            cleanupError as Error,
        );
    }
}

/**
 * Cleanup API Mesh if it was created during this session and didn't exist before.
 *
 * The delete MUST target the org/project/workspace the mesh was created in — via
 * per-invocation AIO_CONSOLE_* env (`withOrgContext`), NOT the user's stale
 * ambient `aio` selection. Targeting the ambient selection looks in the wrong
 * workspace ("No mesh found …") and strands the mesh as an orphan. The workspace
 * is the exact one the deploy hit (`meshCreatedForWorkspace`); org/project come
 * from the create config.
 */
async function cleanupOrphanedMesh(
    context: HandlerContext,
    adobeRef: CleanupAdobeRef,
): Promise<void> {
    const workspace = context.sharedState.meshCreatedForWorkspace;
    if (workspace && !context.sharedState.meshExistedBeforeSession) {
        context.logger.debug(
            `[Project Creation] Cleaning up orphaned API Mesh for workspace ${workspace}`,
        );
        try {
            const commandManager = ServiceLocator.getCommandExecutor();
            const target = buildOrgTargetFromProjectAdobe(
                { ...adobeRef, workspace },
                context.authManager?.getCachedOrganization(),
            );
            const deleteResult = await withOrgContext(target, () =>
                commandManager.execute(MESH_DELETE_COMMAND, {
                    timeout: TIMEOUTS.LONG,
                    configureTelemetry: false,
                    enhancePath: true,
                    useNodeVersion: getMeshNodeVersion(),
                }),
            );

            if (deleteResult.code === 0) {
                context.logger.debug('[Project Creation] Successfully deleted orphaned mesh');
            } else {
                context.logger.warn(
                    `[Project Creation] Failed to delete orphaned mesh: ${deleteResult.stderr}`,
                );
            }
        } catch (meshCleanupError) {
            context.logger.warn(
                '[Project Creation] Error during mesh cleanup',
                meshCleanupError as Error,
            );
        }
    } else if (workspace && context.sharedState.meshExistedBeforeSession) {
        context.logger.debug(
            '[Project Creation] Mesh existed before session - preserving it (not deleting on cancel/failure)',
        );
    }
}

/**
 * Report creation error to the UI (GitHub App, cancellation, timeout, or generic failure).
 */
async function reportCreationError(
    context: HandlerContext,
    error: unknown,
    elapsedStr: string,
): Promise<void> {
    // Handle GitHub App not installed error specifically
    if (error instanceof GitHubAppNotInstalledError) {
        context.logger.info(`[Project Creation] GitHub App not installed: ${error.message}`);
        context.logger.info(`[Project Creation] Install the GitHub App: ${error.installUrl}`);
        const ghProgress: CreationProgressPayload = {
            currentOperation: 'GitHub App Required',
            progress: 0,
            message: '',
            logs: [],
            error: `The AEM Code Sync GitHub App must be installed to enable Edge Delivery Services.`,
        };
        await context.sendMessage('creationProgress', ghProgress);
        const failed: CreationFailedPayload = {
            error: `GitHub App Required: The AEM Code Sync app is not installed on ${error.owner}/${error.repo}.`,
            isTimeout: false,
            elapsed: elapsedStr,
            errorType: 'GITHUB_APP_NOT_INSTALLED',
            errorDetails: {
                owner: error.owner,
                repo: error.repo,
                installUrl: error.installUrl,
            },
        };
        await context.sendMessage('creationFailed', failed);
        return;
    }

    // Determine error type using typed errors
    const appError = toAppError(error);
    const errorMessage = appError.userMessage;
    const isCancelled =
        appError.code === ErrorCode.CANCELLED ||
        (appError.cause?.message?.includes('cancelled by user') ?? false);
    const isTimeoutError = isTimeout(appError);

    const terminal: CreationProgressPayload = {
        currentOperation: isCancelled ? 'Cancelled' : 'Failed',
        progress: 0,
        message: '',
        logs: [],
        error: errorMessage,
    };
    await context.sendMessage('creationProgress', terminal);

    // No creationCancelled push: nothing has listened for it since the wizard
    // moved to the 'Cancelled' sentinel on creationProgress (sent above) —
    // a dead send found by the 2026-08-21 channel inventory.
    if (!isCancelled) {
        const failed: CreationFailedPayload = {
            error: errorMessage,
            isTimeout: isTimeoutError,
            elapsed: elapsedStr,
        };
        await context.sendMessage('creationFailed', failed);
    }
}

/**
 * Handler: create-project
 *
 * Main project creation handler with timeout and cancellation support
 */
export async function handleCreateProject(
    context: HandlerContext,
    payload: Record<string, unknown>,
): Promise<{
    success: boolean;
}> {
    // The dispatch layer is untyped; this is the receiving cast against the
    // shared wire declaration (validated above/below at runtime).
    const config = payload as unknown as ProjectCreationConfig;

    const validationResult = await validateProjectConfig(context, config);
    if (validationResult) {
        return validationResult;
    }

    const startTime = Date.now();
    const projectName = config.projectName; // validated by validateProjectConfig above
    const projectPath = path.join(os.homedir(), '.demo-builder', 'projects', projectName);

    // FIRST: Check workspace trust and offer one-time tip
    const hasShownTrustTip = context.context.globalState.get('demoBuilder.trustTipShown', false);
    if (!hasShownTrustTip && !vscode.workspace.isTrusted) {
        context.logger.debug('[Project Creation] Showing one-time workspace trust tip');
        await context.context.globalState.update('demoBuilder.trustTipShown', true);

        const choice = await vscode.window.showInformationMessage(
            '💡 Tip: Trust all Demo Builder projects at once for the best experience',
            'Learn How',
            'Skip for Now',
        );

        if (choice === 'Learn How') {
            const demoBuilderPath = path.join(os.homedir(), '.demo-builder');
            vscode.window.showInformationMessage(
                `Add "${demoBuilderPath}" to your Trusted Folders ` +
                    '(Cmd+Shift+P → "Workspaces: Manage Workspace Trust" → Add Folder). ' +
                    'All future projects will be trusted automatically, no more dialogs!',
                'Got it!',
            );
        }
    }

    // Create abort controller for cancellation
    context.logger.debug('[Project Creation] Creating NEW AbortController', {
        previousExists: !!context.sharedState.projectCreationAbortController,
        timestamp: new Date().toISOString(),
    });
    context.sharedState.projectCreationAbortController = new AbortController();

    try {
        // Log summary at debug, full config at trace
        const typedConfig = config as {
            projectName?: string;
            components?: { frontend?: string; backend?: string; dependencies?: string[] };
        };
        context.logger.debug(
            `[Project Creation] Starting: ${typedConfig.projectName} (${countSelectedComponents(typedConfig.components)} components)`,
        );
        context.logger.trace('[Project Creation] Full config:', config);

        // Send initial status with progress
        await context.sendMessage('creationProgress', {
            currentOperation: 'Initializing',
            progress: 0,
            message: 'Preparing to create your project...',
            logs: [],
        });

        // Execute with timeout and cancellation support
        await withTimeout(executeProjectCreation(context, config), {
            timeoutMs: OVERALL_TIMEOUT_MS,
            timeoutMessage:
                'Project creation timed out after 30 minutes. ' +
                'This may indicate a network issue or very large components. ' +
                'Please check your connection and try again.',
            signal: context.sharedState.projectCreationAbortController.signal,
        });

        return { success: true };
    } catch (error) {
        const elapsed = Date.now() - startTime;
        const elapsedMin = Math.floor(elapsed / 1000 / 60);
        const elapsedSec = Math.floor((elapsed / 1000) % 60);
        const elapsedStr = `${elapsedMin}m ${elapsedSec}s`;

        context.logger.error(`[Project Creation] Failed after ${elapsedStr}`, error as Error);

        // Cleanup partial project directory and orphaned mesh on failure. The
        // adobe ref lets the mesh cleanup target the workspace it was created in.
        const isEditMode = Boolean((config as { editProjectPath?: string }).editProjectPath);
        const adobeRef = (config as { adobe?: CleanupAdobeRef }).adobe;
        await cleanupOnFailure(context, projectPath, isEditMode, adobeRef);

        // Report error to UI
        await reportCreationError(context, error, elapsedStr);

        return { success: true }; // Don't throw - handler completed successfully even if project creation failed
    } finally {
        // Cleanup
        context.logger.debug('[Project Creation] Cleanup - clearing sharedState', {
            hadAbortController: !!context.sharedState.projectCreationAbortController,
            wasAborted: context.sharedState.projectCreationAbortController?.signal.aborted,
            meshCreatedForWorkspace: context.sharedState.meshCreatedForWorkspace,
            meshExistedBeforeSession: context.sharedState.meshExistedBeforeSession,
            timestamp: new Date().toISOString(),
        });
        context.sharedState.projectCreationAbortController = undefined;
        context.sharedState.meshCreatedForWorkspace = undefined;
        context.sharedState.meshExistedBeforeSession = undefined;
    }
}
