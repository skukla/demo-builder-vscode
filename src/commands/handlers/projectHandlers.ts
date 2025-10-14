/**
 * Project Handlers
 *
 * Handles Adobe project management:
 * - ensure-org-selected: Verify organization is selected
 * - get-projects: Fetch projects for current organization
 * - select-project: Select a specific project
 * - check-project-apis: Verify API Mesh access
 */

import { ServiceLocator } from '../../services/serviceLocator';
import { parseJSON } from '../../types/typeGuards';
import { withTimeout } from '../../utils/promiseUtils';
import { validateProjectId } from '@/shared/validation';
import { TIMEOUTS } from '../../utils/timeoutConfig';
import { HandlerContext } from './HandlerContext';

/**
 * ensure-org-selected - Check if organization is selected
 *
 * Verifies that an organization is currently selected in the
 * Adobe context.
 */
export async function handleEnsureOrgSelected(context: HandlerContext): Promise<{ success: boolean; hasOrg?: boolean }> {
    try {
        const currentOrg = await context.authManager.getCurrentOrganization();
        const hasOrg = !!currentOrg;
        await context.sendMessage('orgSelectionStatus', { hasOrg });
        return { success: true, hasOrg };
    } catch (error) {
        context.logger.error('Failed to ensure org selected:', error as Error);
        await context.sendMessage('error', {
            message: 'Failed to check organization selection',
            details: error instanceof Error ? error.message : String(error),
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
    payload?: { orgId?: string },
): Promise<{ success: boolean; projects?: import('../../utils/auth/types').AdobeProject[]; error?: string }> {
    try {
        // Send loading status with sub-message
        const currentOrg = await context.authManager.getCurrentOrganization();
        if (currentOrg) {
            await context.sendMessage('project-loading-status', {
                isLoading: true,
                message: 'Loading your Adobe projects...',
                subMessage: `Fetching from organization: ${currentOrg?.name || 'your organization'}`,
            });
        }

        // Wrap getProjects with timeout (30 seconds)
        const projects = await withTimeout(
            context.authManager.getProjects(),
            {
                timeoutMs: TIMEOUTS.PROJECT_LIST,
                timeoutMessage: 'Request timed out. Please check your connection and try again.',
            },
        );
        await context.sendMessage('projects', projects);
        return { success: true, projects };
    } catch (error) {
        const errorMessage = error instanceof Error && error.message.includes('timed out')
            ? error.message
            : 'Failed to load projects. Please try again.';

        context.logger.error('Failed to get projects:', error as Error);
        await context.sendMessage('projects', {
            error: errorMessage,
        });
        return { success: false, error: errorMessage };
    }
}

/**
 * select-project - Select an Adobe project
 *
 * Sets the specified project as the current project context
 * in Adobe CLI configuration.
 */
export async function handleSelectProject(
    context: HandlerContext,
    payload: { projectId: string },
): Promise<{ success: boolean }> {
    const { projectId } = payload;

    // SECURITY: Validate project ID to prevent command injection
    try {
        validateProjectId(projectId);
    } catch (validationError) {
        context.logger.error('[Project] Invalid project ID', validationError as Error);
        throw new Error(`Invalid project ID: ${validationError instanceof Error ? validationError.message : String(validationError)}`);
    }

    context.debugLogger.debug(`[Project] handleSelectProject called with projectId: ${projectId}`);

    try {
        context.debugLogger.debug('[Project] About to call authManager.selectProject');
        // Directly select the project - we already have the projectId
        const success = await context.authManager.selectProject(projectId);

        context.debugLogger.debug(`[Project] authManager.selectProject returned: ${success}`);

        if (success) {
            context.logger.info(`Selected project: ${projectId}`);
            context.debugLogger.debug('[Project] Project selection succeeded, about to send projectSelected message');

            // Ensure fresh workspace data after project change
            // (selectProject already clears workspace cache)

            try {
                await context.sendMessage('projectSelected', { projectId });
                context.debugLogger.debug('[Project] projectSelected message sent successfully');
            } catch (sendError) {
                context.debugLogger.debug('[Project] Failed to send projectSelected message:', sendError);
                throw new Error(`Failed to send project selection response: ${sendError instanceof Error ? sendError.message : String(sendError)}`);
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
            details: error instanceof Error ? error.message : String(error),
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
export async function handleCheckProjectApis(context: HandlerContext): Promise<{ success: boolean; hasMesh: boolean }> {
    context.logger.info('[Adobe Setup] Checking required APIs for selected project');
    context.debugLogger.debug('[Adobe Setup] handleCheckProjectApis invoked');
    try {
        const commandManager = ServiceLocator.getCommandExecutor();

        // Step 1: Verify CLI has the API Mesh plugin installed (so commands exist)
        try {
            const { stdout } = await commandManager.executeAdobeCLI('aio plugins --json');
            const plugins = parseJSON<{ name?: string; id?: string }[]>(stdout || '[]');
            if (!plugins) {
                context.logger.warn('[Adobe Setup] Failed to parse plugins list');
                return { success: true, hasMesh: false };
            }
            const hasPlugin = Array.isArray(plugins)
                ? plugins.some((p: { name?: string; id?: string }) => (p.name || p.id || '').includes('api-mesh'))
                : JSON.stringify(plugins).includes('api-mesh');
            if (!hasPlugin) {
                context.logger.warn('[Adobe Setup] API Mesh CLI plugin not installed');
                return { success: true, hasMesh: false };
            }
        } catch (e) {
            context.debugLogger.debug('[Adobe Setup] Failed to verify plugins; continuing', { error: String(e) });
        }

        // Step 2: Confirm project context is selected (best effort)
        try {
            await commandManager.executeAdobeCLI('aio console projects get --json');
        } catch (e) {
            context.debugLogger.debug('[Adobe Setup] Could not confirm project context (non-fatal)', { error: String(e) });
        }

        // Step 3: Probe access by calling a safe mesh command that lists or describes
        // CLI variants differ; try a few options and infer permissions from errors
        // Preferred probe: get active mesh (succeeds only if API enabled; returns 404-style when none exists)
        try {
            const { stdout } = await commandManager.executeAdobeCLI('aio api-mesh:get --active --json');
            context.debugLogger.debug('[Adobe Setup] api-mesh:get --active output', { stdout });
            context.logger.info('[Adobe Setup] API Mesh access confirmed (active mesh or readable config)');
            return { success: true, hasMesh: true };
        } catch (cliError) {
            const err = cliError as { message?: string; stderr?: string; stdout?: string };
            const combined = `${err.message || ''}\n${err.stderr || ''}\n${err.stdout || ''}`;
            context.debugLogger.debug('[Adobe Setup] api-mesh:get --active error', { combined });
            const forbidden = /403|forbidden|not authorized|not enabled|no access/i.test(combined);
            if (forbidden) {
                context.logger.warn('[Adobe Setup] API Mesh not enabled for selected project');
                return { success: true, hasMesh: false };
            }
            // If error indicates no active mesh or not found, treat as enabled but empty
            const noActive = /no active|not found|404/i.test(combined);
            if (noActive) {
                context.logger.info('[Adobe Setup] API Mesh enabled; no active mesh found');
                return { success: true, hasMesh: true };
            }
        }

        const probes = [
            'aio api-mesh:get --help',
            'aio api-mesh --help',
        ];

        for (const cmd of probes) {
            try {
                const { stdout } = await commandManager.executeAdobeCLI(cmd);
                context.debugLogger.debug('[Adobe Setup] Mesh probe success', { cmd, stdout });
                // If any mesh command runs, assume access exists
                context.logger.info('[Adobe Setup] API Mesh access confirmed');
                return { success: true, hasMesh: true };
            } catch (cliError) {
                const err = cliError as { message?: string; stderr?: string; stdout?: string };
                const combined = `${err.message || ''}\n${err.stderr || ''}\n${err.stdout || ''}`;
                context.debugLogger.debug('[Adobe Setup] Mesh probe error', { cmd, combined });
                const forbidden = /403|forbidden|not authorized|not enabled|no access|missing permission/i.test(combined);
                if (forbidden) {
                    context.logger.warn('[Adobe Setup] API Mesh not enabled for selected project');
                    return { success: true, hasMesh: false };
                }
                // If the error indicates unknown command, try next variant
                const unknown = /is not a aio command|Unknown argument|Did you mean/i.test(combined);
                if (unknown) continue;
            }
        }

        // If all probes failed without a definitive permission error, return false to prompt user
        context.logger.warn('[Adobe Setup] Unable to confirm API Mesh access (CLI variant mismatch)');
        return { success: true, hasMesh: false };
    } catch (error) {
        context.logger.error('[Adobe Setup] Failed to check project APIs', error as Error);
        throw error;
    }
}
