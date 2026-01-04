/**
 * Project Operations - Project management for Adobe entities
 *
 * Handles project listing, selection, and current context.
 * Extracted from AdobeEntityService for SOP compliance.
 */

import { getConsoleWhereContext, ensureContext, type ContextOperationsDeps } from './contextOperations';
import { mapProjects } from './adobeEntityMapper';
import { getLogger, StepLogger } from '@/core/logging';
import { TIMEOUTS, formatDuration } from '@/core/utils';
import { validateProjectId } from '@/core/validation';
import type { AdobeSDKClient } from '@/features/authentication/services/adobeSDKClient';
import type {
    AdobeProject,
    RawAdobeProject,
    AdobeCLIError,
    SDKResponse,
} from '@/features/authentication/services/types';
import type { Logger } from '@/types/logger';
import { parseJSON } from '@/types/typeGuards';

/**
 * Dependencies required for project operations
 */
export interface ProjectOperationsDeps extends ContextOperationsDeps {
    sdkClient: AdobeSDKClient;
    logger: Logger;
    stepLogger: StepLogger;
}

/**
 * Get list of projects for current org (SDK with CLI fallback)
 * @param options.silent - If true, suppress user-facing log messages (used for internal ID resolution)
 */
export async function getProjects(
    deps: ProjectOperationsDeps,
    options?: { silent?: boolean },
): Promise<AdobeProject[]> {
    const debugLogger = getLogger();
    const startTime = Date.now();
    const silent = options?.silent ?? false;

    try {
        if (!silent) {
            deps.stepLogger.logTemplate('adobe-setup', 'operations.loading-projects', {});
        }

        let mappedProjects: AdobeProject[] = [];
        const cachedOrg = deps.cacheManager.getCachedOrganization();

        // Try SDK first if available and we have a VALID numeric org ID
        // PERFORMANCE FIX: SDK requires numeric org ID (e.g., "3397333")
        // The 'id' field contains the numeric org ID, while 'code' is the IMS org ID
        const hasValidOrgId = cachedOrg?.id && cachedOrg.id.length > 0;

        // Auto-initialize SDK if not ready (lazy init pattern)
        if (!deps.sdkClient.isInitialized()) {
            await deps.sdkClient.ensureInitialized();
        }

        if (deps.sdkClient.isInitialized() && hasValidOrgId) {
            try {
                const client = deps.sdkClient.getClient() as { getProjectsForOrg: (orgId: string) => Promise<SDKResponse<RawAdobeProject[]>> };
                const sdkResult = await client.getProjectsForOrg(cachedOrg.id);
                const sdkDuration = Date.now() - startTime;

                if (sdkResult.body && Array.isArray(sdkResult.body)) {
                    mappedProjects = mapProjects(sdkResult.body);

                    debugLogger.debug(`[Project Ops] Retrieved ${mappedProjects.length} projects via SDK in ${formatDuration(sdkDuration)}`);
                } else {
                    throw new Error('Invalid SDK response format');
                }
            } catch (sdkError) {
                debugLogger.trace('[Project Ops] SDK failed, falling back to CLI:', sdkError);
                debugLogger.warn('[Project Ops] SDK unavailable, using slower CLI fallback for projects');
            }
        } else if (deps.sdkClient.isInitialized() && !hasValidOrgId) {
            debugLogger.debug('[Project Ops] SDK available but org ID is missing, using CLI');
        }

        // CLI fallback
        if (mappedProjects.length === 0) {
            const result = await deps.commandManager.execute(
                'aio console project list --json',
                { encoding: 'utf8' },
            );

            const cliDuration = Date.now() - startTime;

            if (result.code !== 0) {
                // Check if it's just no projects
                if (result.stderr?.includes('does not have any projects')) {
                    debugLogger.debug('[Project Ops] No projects found for organization');
                    return [];
                }
                throw new Error(`Failed to get projects: ${result.stderr}`);
            }

            // SECURITY: Use parseJSON for type-safe parsing
            const projects = parseJSON<RawAdobeProject[]>(result.stdout);

            if (!projects || !Array.isArray(projects)) {
                throw new Error('Invalid projects response format');
            }

            mappedProjects = mapProjects(projects);

            debugLogger.debug(`[Project Ops] Retrieved ${mappedProjects.length} projects via CLI in ${formatDuration(cliDuration)}`);
        }

        if (!silent) {
            deps.stepLogger.logTemplate('adobe-setup', 'statuses.projects-loaded', {
                count: mappedProjects.length,
                plural: mappedProjects.length === 1 ? '' : 's',
            });
        }

        return mappedProjects;
    } catch (error) {
        debugLogger.error('[Project Ops] Failed to get projects', error as Error);
        throw error;
    }
}

/**
 * Get current project from CLI
 */
export async function getCurrentProject(
    deps: ProjectOperationsDeps,
): Promise<AdobeProject | undefined> {
    const debugLogger = getLogger();

    try {
        // Check cache first
        const cachedProject = deps.cacheManager.getCachedProject();
        if (cachedProject) {
            return cachedProject;
        }

        const context = await getConsoleWhereContext(deps);
        if (!context) {
            return undefined;
        }

        if (context.project) {
            let projectData;

            if (typeof context.project === 'string') {
                try {
                    // Use silent mode for internal ID resolution to avoid duplicate log messages
                    const projects = await getProjects(deps, { silent: true });
                    const matchedProject = projects.find(p => p.name === context.project || p.title === context.project);

                    if (matchedProject) {
                        projectData = matchedProject;
                    } else {
                        debugLogger.warn(`[Project Ops] Could not find numeric ID for project "${context.project}", using name as fallback`);
                        projectData = {
                            id: context.project,
                            name: context.project,
                            title: context.project,
                        };
                    }
                } catch (error) {
                    debugLogger.debug('[Project Ops] Failed to fetch project list for ID lookup:', error);
                    projectData = {
                        id: context.project,
                        name: context.project,
                        title: context.project,
                    };
                }
            } else if (typeof context.project === 'object') {
                const projectName = context.project.name || context.project.id || 'Unknown';
                debugLogger.debug(`[Project Ops] Current project: ${projectName}`);
                projectData = {
                    id: context.project.id,
                    name: context.project.name,
                    title: context.project.title || context.project.name,
                    description: context.project.description,
                    org_id: context.project.org_id,
                };
            } else {
                debugLogger.debug('[Project Ops] Project data is not string or object');
                return undefined;
            }

            // Cache the result
            deps.cacheManager.setCachedProject(projectData);
            return projectData;
        }

        debugLogger.debug('[Project Ops] No project currently selected');
        return undefined;
    } catch (error) {
        debugLogger.debug('[Project Ops] Failed to get current project:', error);
        return undefined;
    }
}

/**
 * Select project with organization context guard.
 * Ensures the org is selected first (protects against context drift).
 *
 * @param projectId - The project ID to select
 * @param orgId - Org ID to ensure context before selection
 * @param selectOrganization - Callback to select org if context drift detected
 */
export async function selectProject(
    deps: ProjectOperationsDeps,
    projectId: string,
    orgId: string,
    selectOrganization: (orgId: string) => Promise<boolean>,
): Promise<boolean> {
    const debugLogger = getLogger();

    const contextOk = await ensureContext(
        deps,
        { orgId },
        selectOrganization,
        (pid) => doSelectProject(deps, pid),
    );
    if (!contextOk) {
        debugLogger.error('[Project Ops] Failed to ensure org context for project selection');
        return false;
    }

    return doSelectProject(deps, projectId);
}

/**
 * Internal project selection (no context guard).
 * Used by ensureContext and selectProject.
 */
export async function doSelectProject(
    deps: ProjectOperationsDeps,
    projectId: string,
): Promise<boolean> {
    const debugLogger = getLogger();

    try {
        // SECURITY: Validate projectId to prevent command injection
        validateProjectId(projectId);

        deps.stepLogger.logTemplate('adobe-setup', 'operations.selecting', { item: 'project' });

        const result = await deps.commandManager.execute(
            `aio console project select ${projectId}`,
            {
                encoding: 'utf8',
                timeout: TIMEOUTS.NORMAL,
            },
        );

        if (result.code === 0) {
            // Smart caching - use silent mode to avoid duplicate log messages
            let projectName = projectId; // Fallback to ID if name lookup fails
            try {
                const projects = await getProjects(deps, { silent: true });
                const selectedProject = projects.find(p => p.id === projectId);

                if (selectedProject) {
                    deps.cacheManager.setCachedProject(selectedProject);
                    projectName = selectedProject.title || selectedProject.name || projectId;
                } else {
                    deps.cacheManager.setCachedProject(undefined);
                    debugLogger.warn(`[Project Ops] Could not find project ${projectId} in list`);
                }
            } catch (error) {
                debugLogger.debug('[Project Ops] Failed to cache project after selection:', error);
                deps.cacheManager.setCachedProject(undefined);
            }

            // Log with project name (or ID as fallback)
            deps.stepLogger.logTemplate('adobe-setup', 'statuses.project-selected', { name: projectName });

            // Clear downstream caches
            deps.cacheManager.setCachedWorkspace(undefined);
            deps.cacheManager.clearConsoleWhereCache();

            return true;
        }

        debugLogger.debug(`[Project Ops] Project select failed with code: ${result.code}`);
        return false;
    } catch (error) {
        // Check if command succeeded despite timeout
        const err = error as AdobeCLIError;
        if (err.stdout?.includes('Project selected :')) {
            debugLogger.debug('[Project Ops] Project selection succeeded despite timeout');

            // Smart caching even on timeout success - use silent mode
            let projectName = projectId; // Fallback to ID if name lookup fails
            try {
                const projects = await getProjects(deps, { silent: true });
                const selectedProject = projects.find(p => p.id === projectId);

                if (selectedProject) {
                    deps.cacheManager.setCachedProject(selectedProject);
                    projectName = selectedProject.title || selectedProject.name || projectId;
                }
            } catch (cacheError) {
                debugLogger.debug('[Project Ops] Failed to cache project after timeout success:', cacheError);
                deps.cacheManager.setCachedProject(undefined);
            }

            // Log with project name (or ID as fallback)
            deps.stepLogger.logTemplate('adobe-setup', 'statuses.project-selected', { name: projectName });

            // Clear downstream caches
            deps.cacheManager.setCachedWorkspace(undefined);
            deps.cacheManager.clearConsoleWhereCache();

            return true;
        }

        debugLogger.error('[Project Ops] Failed to select project', error as Error);
        return false;
    }
}
