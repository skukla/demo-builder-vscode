/**
 * Project Handlers
 *
 * Handles Adobe project management:
 * - ensure-org-selected: Verify organization is selected
 * - get-projects: Fetch projects for current organization
 * - select-project: Select a specific project
 * - check-project-apis: Verify API Mesh access
 */

import { ServiceLocator } from '@/core/di';
import { withTimeout } from '@/core/utils/promiseUtils';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { validateProjectId } from '@/core/validation';
import type { AdobeProject } from '@/features/authentication/services/types';
import { getMeshNodeVersion } from '@/features/mesh/services/meshConfig';
import { toAppError, isTimeout } from '@/types/errors';
import { HandlerContext } from '@/types/handlers';
import { DataResult, SimpleResult } from '@/types/results';
import { parseJSON, toError } from '@/types/typeGuards';

/**
 * ensure-org-selected - Check if organization is selected
 *
 * Verifies that an organization is currently selected in the
 * Adobe context.
 */
export async function handleEnsureOrgSelected(context: HandlerContext): Promise<DataResult<{ hasOrg: boolean }>> {
    try {
        const currentOrg = await context.authManager?.getCurrentOrganization();
        const hasOrg = !!currentOrg;
        await context.sendMessage('orgSelectionStatus', { hasOrg });
        return { success: true, data: { hasOrg } };
    } catch (error) {
        context.logger.error('Failed to ensure org selected:', error as Error);
        await context.sendMessage('error', {
            message: 'Failed to check organization selection',
            details: toError(error).message,
        });
        return { success: false };
    }
}

/**
 * get-projects - Fetch projects for current organization
 *
 * Retrieves list of Adobe App Builder projects accessible to the
 * current user in the selected organization.
 */
export async function handleGetProjects(
    context: HandlerContext,
    _payload?: { orgId?: string },
): Promise<DataResult<AdobeProject[]>> {
    try {
        // Send loading status with sub-message
        const currentOrg = await context.authManager?.getCurrentOrganization();
        if (currentOrg) {
            await context.sendMessage('project-loading-status', {
                isLoading: true,
                message: 'Loading your Adobe projects...',
                subMessage: `Fetching from organization: ${currentOrg?.name || 'your organization'}`,
            });
        }

        // Wrap getProjects with timeout (30 seconds)
        const projectsPromise = context.authManager?.getProjects();
        if (!projectsPromise) {
            throw new Error('Auth manager not available');
        }
        const projects = await withTimeout(
            projectsPromise,
            {
                timeoutMs: TIMEOUTS.NORMAL,
                timeoutMessage: 'Request timed out. Please check your connection and try again.',
            },
        );
        await context.sendMessage('get-projects', projects);
        return { success: true, data: projects };
    } catch (error) {
        const appError = toAppError(error);
        const errorMessage = isTimeout(appError)
            ? appError.userMessage
            : 'Failed to load projects. Please try again.';

        context.logger.error('Failed to get projects:', appError);
        await context.sendMessage('get-projects', {
            error: errorMessage,
            code: appError.code,
        });
        return { success: false, error: errorMessage, code: appError.code };
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
        const currentOrg = await context.authManager?.getCurrentOrganization();
        if (!currentOrg?.id) {
            throw new Error('No organization selected - cannot select project without org context');
        }

        // Select project with org context guard to protect against context drift
        const success = await context.authManager?.selectProject(projectId, currentOrg.id);

        if (success) {
            // Note: Selection already logged by adobeEntityService with project name

            // Ensure fresh workspace data after project change
            // (selectProject already clears workspace cache)

            try {
                await context.sendMessage('projectSelected', { projectId });
            } catch (sendError) {
                context.debugLogger.debug('[Project] Failed to send projectSelected message:', sendError);
                throw new Error(`Failed to send project selection response: ${toError(sendError).message}`);
            }

            return { success: true };
        } else {
            // Log error but don't throw - let caller handle response
            context.logger.error(`Failed to select project ${projectId}`);
            context.debugLogger.debug('[Project] Project selection failed, sending error message');
            await context.sendMessage('error', {
                message: 'Failed to select project',
                details: `Project selection for ${projectId} was unsuccessful`,
            });
            throw new Error(`Failed to select project ${projectId}`);
        }
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
 * check-project-apis - Verify API Mesh access for selected project
 *
 * Checks if the selected project has API Mesh enabled by probing
 * the Adobe CLI api-mesh commands.
 */
export async function handleCheckProjectApis(context: HandlerContext): Promise<DataResult<{ hasMesh: boolean }>> {
    context.logger.debug('[Adobe Setup] Checking required APIs for selected project');
    context.debugLogger.debug('[Adobe Setup] handleCheckProjectApis invoked');
    try {
        const commandManager = ServiceLocator.getCommandExecutor();

        // Step 1: Verify CLI has the API Mesh plugin installed (so commands exist)
        try {
            const { stdout } = await commandManager.execute('aio plugins --json', { useNodeVersion: getMeshNodeVersion() });
            const plugins = parseJSON<{ name?: string; id?: string }[]>(stdout || '[]');
            if (!plugins) {
                context.logger.warn('[Adobe Setup] Failed to parse plugins list');
                return { success: true, data: { hasMesh: false } };
            }
            const hasPlugin = Array.isArray(plugins)
                ? plugins.some((p: { name?: string; id?: string }) => (p.name || p.id || '').includes('api-mesh'))
                : JSON.stringify(plugins).includes('api-mesh');
            if (!hasPlugin) {
                context.logger.warn('[Adobe Setup] API Mesh CLI plugin not installed');
                return { success: true, data: { hasMesh: false } };
            }
        } catch (e) {
            context.debugLogger.debug('[Adobe Setup] Failed to verify plugins; continuing', { error: String(e) });
        }

        // Step 2: Confirm project context is selected (best effort)
        try {
            await commandManager.execute('aio console projects get --json', { useNodeVersion: getMeshNodeVersion() });
        } catch (e) {
            context.debugLogger.debug('[Adobe Setup] Could not confirm project context (non-fatal)', { error: String(e) });
        }

        // Step 3: Probe access by calling a safe mesh command that lists or describes
        // CLI variants differ; try a few options and infer permissions from errors
        // Preferred probe: get active mesh (succeeds only if API enabled; returns 404-style when none exists)
        try {
            const { stdout } = await commandManager.execute('aio api-mesh:get --active --json', { useNodeVersion: getMeshNodeVersion() });
            context.debugLogger.trace('[Adobe Setup] api-mesh:get --active output', { stdout });
            context.logger.debug('[Adobe Setup] API Mesh access confirmed (active mesh or readable config)');
            return { success: true, data: { hasMesh: true } };
        } catch (cliError) {
            const err = cliError as { message?: string; stderr?: string; stdout?: string };
            const combined = `${err.message || ''}\n${err.stderr || ''}\n${err.stdout || ''}`;
            context.debugLogger.trace('[Adobe Setup] api-mesh:get --active error', { combined });
            const forbidden = /403|forbidden|not authorized|not enabled|no access/i.test(combined);
            if (forbidden) {
                context.logger.warn('[Adobe Setup] API Mesh not enabled for selected project');
                return { success: true, data: { hasMesh: false } };
            }
            // If error indicates no active mesh or not found, treat as enabled but empty
            const noActive = /no active|not found|404/i.test(combined);
            if (noActive) {
                context.logger.debug('[Adobe Setup] API Mesh enabled; no active mesh found');
                return { success: true, data: { hasMesh: true } };
            }
        }

        const probes = [
            'aio api-mesh:get --help',
            'aio api-mesh --help',
        ];

        for (const cmd of probes) {
            try {
                const { stdout } = await commandManager.execute(cmd);
                context.debugLogger.trace('[Adobe Setup] Mesh probe success', { cmd, stdout });
                // If any mesh command runs, assume access exists
                context.logger.debug('[Adobe Setup] API Mesh access confirmed');
                return { success: true, data: { hasMesh: true } };
            } catch (cliError) {
                const err = cliError as { message?: string; stderr?: string; stdout?: string };
                const combined = `${err.message || ''}\n${err.stderr || ''}\n${err.stdout || ''}`;
                context.debugLogger.trace('[Adobe Setup] Mesh probe error', { cmd, combined });
                const forbidden = /403|forbidden|not authorized|not enabled|no access|missing permission/i.test(combined);
                if (forbidden) {
                    context.logger.warn('[Adobe Setup] API Mesh not enabled for selected project');
                    return { success: true, data: { hasMesh: false } };
                }
                // If the error indicates unknown command, try next variant
                const unknown = /is not a aio command|Unknown argument|Did you mean/i.test(combined);
                if (unknown) continue;
            }
        }

        // If all probes failed without a definitive permission error, return false to prompt user
        context.logger.warn('[Adobe Setup] Unable to confirm API Mesh access (CLI variant mismatch)');
        return { success: true, data: { hasMesh: false } };
    } catch (error) {
        context.logger.error('[Adobe Setup] Failed to check project APIs', error as Error);
        throw error;
    }
}
