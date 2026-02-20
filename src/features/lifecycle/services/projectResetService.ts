/**
 * Project Reset Service
 *
 * Resets headless (non-EDS) projects by deleting and re-cloning components.
 * Follows the same UI pattern as edsResetService: confirmation → progress → execute → notify.
 *
 * Reuses:
 * - cloneAllComponents / installAllComponents from componentInstallationOrchestrator
 * - ComponentRegistryManager for component definitions
 * - loadComponentDefinitions pattern from executor.ts
 * - generateComponentEnvFile for .env regeneration
 * - StopDemo command for stopping running demos
 *
 * @module features/lifecycle/services/projectResetService
 */

import * as fsPromises from 'fs/promises';
import * as path from 'path';
import type { Project, TransformedComponentDefinition, ComponentRegistry } from '@/types';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';
import type { Stack } from '@/types/stacks';
import type { ComponentDefinitionEntry } from '@/features/project-creation/services/componentInstallationOrchestrator';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

// Stacks configuration — same source of truth used by executor.ts
import stacksConfig from '@/features/project-creation/config/stacks.json';

/**
 * Look up a stack by ID from stacks.json
 * Mirrors the private getStackById in executor.ts
 */
function getStackById(stackId: string): Stack | undefined {
    return (stacksConfig.stacks as Stack[]).find(s => s.id === stackId);
}

// ==========================================================
// Types
// ==========================================================

export interface ResetWithUIOptions {
    /** Project to reset */
    project: Project;
    /** Handler context */
    context: HandlerContext;
    /** Log prefix for messages (e.g., '[Dashboard]' or '[ProjectsList]') */
    logPrefix?: string;
}

// ==========================================================
// Component Definition Loading
// ==========================================================

/** Result of loading component definitions, includes registry for reuse */
interface LoadResult {
    componentDefinitions: Map<string, ComponentDefinitionEntry>;
    registry: ComponentRegistry;
    stack: Stack;
}

/**
 * Reconstruct component definitions from saved project state.
 *
 * Uses the same logic as executor.ts loadComponentDefinitions() but reads
 * from the saved project (selectedStack, selectedAddons, componentInstances)
 * instead of the wizard's ProjectCreationConfig.
 *
 * Returns the registry alongside definitions so callers can reuse it
 * (avoids duplicate file I/O).
 */
async function loadComponentDefinitionsFromProject(
    project: Project,
    context: HandlerContext,
): Promise<LoadResult> {
    const { ComponentRegistryManager } = await import(
        '@/features/components/services/ComponentRegistryManager'
    );

    const registryManager = new ComponentRegistryManager(context.context.extensionPath);
    const registry = await registryManager.loadRegistry();
    const stack = project.selectedStack ? getStackById(project.selectedStack) : undefined;

    if (!stack) {
        throw new Error(
            `Stack "${project.selectedStack}" not found in stacks.json. Cannot reset.`,
        );
    }

    const frontend = stack.frontend;
    const dependencies = stack.dependencies || [];

    // Get frontend's submodule IDs to exclude from dependency loop
    const frontendSubmoduleIds = new Set<string>();
    if (frontend) {
        const frontends = await registryManager.getFrontends();
        const frontendDef = frontends.find((f: { id: string }) => f.id === frontend);
        if (frontendDef?.submodules) {
            Object.keys(frontendDef.submodules).forEach(id => frontendSubmoduleIds.add(id));
        }
    }

    const filteredDependencies = dependencies.filter(
        (id: string) => !frontendSubmoduleIds.has(id),
    );

    // Build component list from stack + saved addons (exclude submodule addons)
    const appBuilder = (project.selectedAddons || []).filter(
        addon => !stack.optionalAddons?.some(opt => opt.id === addon),
    );

    const allComponents = [
        ...(frontend ? [{ id: frontend, type: 'frontend' }] : []),
        ...filteredDependencies.map((id: string) => ({ id, type: 'dependency' })),
        ...appBuilder.map((id: string) => ({ id, type: 'app-builder' })),
    ];

    const componentDefinitions: Map<string, ComponentDefinitionEntry> = new Map();

    for (const comp of allComponents) {
        let componentDef: TransformedComponentDefinition | undefined;

        if (comp.type === 'frontend') {
            const frontends = await registryManager.getFrontends();
            componentDef = frontends.find((f: { id: string }) => f.id === comp.id);
        } else if (comp.type === 'dependency') {
            const deps = await registryManager.getDependencies();
            componentDef = deps.find((d: { id: string }) => d.id === comp.id);
        } else if (comp.type === 'app-builder') {
            const apps = await registryManager.getAppBuilder();
            componentDef = apps.find((a: { id: string }) => a.id === comp.id);
        }

        // Fallback: search all sections (e.g., mesh in "mesh" section)
        if (!componentDef) {
            componentDef = await registryManager.getComponentById(comp.id) as
                TransformedComponentDefinition | undefined;
        }

        if (!componentDef) {
            context.logger.warn(`[ProjectReset] Component ${comp.id} not found in registry`);
            continue;
        }

        // For frontend, restore source URL from saved componentInstance
        if (comp.type === 'frontend') {
            const savedInstance = project.componentInstances?.[comp.id];
            if (savedInstance?.repoUrl) {
                componentDef = {
                    ...componentDef,
                    source: {
                        type: 'git' as const,
                        url: savedInstance.repoUrl,
                        branch: savedInstance.branch || 'main',
                    },
                };
            }
        }

        if (!componentDef.source) {
            context.logger.warn(
                `[ProjectReset] Component ${comp.id} has no source, skipping`,
            );
            continue;
        }

        // Determine submodules from stack + saved addons
        const installOptions: {
            selectedSubmodules?: string[];
            skipDependencies?: boolean;
        } = { skipDependencies: true };

        if (comp.type === 'frontend' && componentDef.submodules && stack) {
            const allSelected = [
                ...(stack.dependencies || []),
                ...(project.selectedAddons || []),
            ];
            const selectedSubmodules = allSelected.filter(
                (depId: string) => componentDef?.submodules?.[depId] !== undefined,
            );
            if (selectedSubmodules.length > 0) {
                installOptions.selectedSubmodules = selectedSubmodules;
            }
        }

        componentDef = {
            ...componentDef,
            type: comp.type as TransformedComponentDefinition['type'],
        };
        componentDefinitions.set(comp.id, {
            definition: componentDef,
            type: comp.type,
            installOptions,
        });
    }

    return { componentDefinitions, registry, stack };
}

// ==========================================================
// Environment File Regeneration
// ==========================================================

/**
 * Regenerate .env files for all components using saved project configs.
 *
 * Creates a minimal EnvGenerationContext adapter from the saved project state
 * and delegates to generateComponentEnvFile for each component.
 *
 * @param registry - Reused from loadComponentDefinitionsFromProject (avoids duplicate I/O)
 * @param backendId - From stack.backend (single source of truth)
 */
async function regenerateEnvFiles(
    project: Project,
    componentDefinitions: Map<string, ComponentDefinitionEntry>,
    context: HandlerContext,
    registry: ComponentRegistry,
    backendId: string,
): Promise<void> {
    const { generateComponentEnvFile } = await import(
        '@/features/project-creation/helpers/envFileGenerator'
    );

    // Build minimal EnvGenerationContext adapter from saved project state
    const envContext = {
        registry,
        logger: context.logger,
        getBackendId: () => backendId,
        getComponentConfigs: () => project.componentConfigs,
        getEnvVarDefinitions: () => registry.envVars || {},
        getMeshEndpoint: () => project.meshState?.endpoint,
    };

    for (const [compId, { definition }] of componentDefinitions) {
        const componentPath = project.componentInstances?.[compId]?.path;
        if (!componentPath) continue;

        await generateComponentEnvFile(componentPath, compId, definition, envContext);
        context.logger.debug(`[ProjectReset] Regenerated .env for ${definition.name}`);
    }
}

// ==========================================================
// Full Reset with UI
// ==========================================================

/**
 * Reset a headless project with full UI flow.
 *
 * Pattern mirrors edsResetService.resetEdsProjectWithUI:
 * 1. Confirmation dialog
 * 2. Stop demo if running
 * 3. Set status to 'resetting'
 * 4. Delete components/ directory
 * 5. Clone all components (reuses componentInstallationOrchestrator)
 * 6. Install npm dependencies (reuses componentInstallationOrchestrator)
 * 7. Regenerate .env files from saved componentConfigs
 * 8. Redeploy API Mesh (if project has mesh component)
 * 9. Restore status, show success/error notification
 */
export async function resetProjectWithUI(
    options: ResetWithUIOptions,
): Promise<HandlerResponse> {
    const {
        project,
        context,
        logPrefix = '[ProjectReset]',
    } = options;

    const vscode = await import('vscode');

    // Show confirmation dialog
    const confirmButton = 'Reset Project';
    const confirmation = await vscode.window.showWarningMessage(
        `Are you sure you want to reset "${project.name}"? This will delete all components and re-install them from scratch. Your configuration will be preserved.`,
        { modal: true },
        confirmButton,
    );

    if (confirmation !== confirmButton) {
        context.logger.info(`${logPrefix} Reset cancelled by user`);
        return { success: false, cancelled: true };
    }

    // Stop demo if running
    if (project.status === 'running' || project.status === 'starting') {
        context.logger.info(`${logPrefix} Stopping running demo before reset`);
        await vscode.commands.executeCommand('demoBuilder.stopDemo');
    }

    // Set status to 'resetting'
    const originalStatus = project.status;
    project.status = 'resetting';
    await context.stateManager.saveProject(project);

    try {
        return await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Resetting Project',
                cancellable: false,
            },
            async (progress) => {
                context.logger.info(`${logPrefix} Resetting project: ${project.name}`);

                // Step 1: Load component definitions from saved project state
                progress.report({ message: 'Loading component definitions...' });
                const { componentDefinitions, registry, stack } =
                    await loadComponentDefinitionsFromProject(project, context);

                if (componentDefinitions.size === 0) {
                    return {
                        success: false,
                        error: 'No components found for this project stack',
                    };
                }

                context.logger.info(
                    `${logPrefix} Found ${componentDefinitions.size} components to reset`,
                );

                // Step 2: Delete existing components directory
                progress.report({ message: 'Removing existing components...' });
                const componentsDir = path.join(project.path, 'components');

                try {
                    await fsPromises.rm(componentsDir, { recursive: true, force: true });
                    context.logger.info(`${logPrefix} Removed components directory`);
                } catch {
                    context.logger.debug(
                        `${logPrefix} No components directory to remove`,
                    );
                }

                // Clear component instances (will be rebuilt by cloneAllComponents)
                project.componentInstances = {};

                // Step 3: Clone all components (reuse from orchestrator)
                progress.report({ message: 'Downloading components...' });
                const { cloneAllComponents, installAllComponents } = await import(
                    '@/features/project-creation/services/componentInstallationOrchestrator'
                );

                const installContext = {
                    project,
                    componentDefinitions,
                    progressTracker: ((_phase: string, _pct: number, msg: string) => {
                        progress.report({ message: msg });
                    }) as import('@/features/project-creation/handlers/shared').ProgressTracker,
                    logger: context.logger,
                    saveProject: () => context.stateManager.saveProject(project),
                };

                await cloneAllComponents(installContext);

                // Step 4: Install npm dependencies (reuse from orchestrator)
                progress.report({ message: 'Installing dependencies...' });
                await installAllComponents(installContext);

                // Step 5: Regenerate .env files from saved config
                progress.report({ message: 'Regenerating configuration files...' });
                await regenerateEnvFiles(
                    project,
                    componentDefinitions,
                    context,
                    registry,
                    stack.backend,
                );

                // Step 6: Redeploy API Mesh (if project has mesh)
                const { getMeshComponentInstance } = await import('@/types/typeGuards');
                const meshComponent = getMeshComponentInstance(project);

                let meshRedeployed = false;
                if (meshComponent?.path) {
                    progress.report({ message: 'Checking Adobe I/O authentication...' });
                    const { ServiceLocator } = await import('@/core/di');
                    const authService = ServiceLocator.getAuthenticationService();
                    const isAuthenticated = await authService.isAuthenticated();

                    if (!isAuthenticated) {
                        context.logger.info(`${logPrefix} Adobe I/O token expired, prompting sign-in`);
                        const signInButton = 'Sign In';
                        const selection = await vscode.window.showWarningMessage(
                            'Your Adobe I/O session has expired. Sign in to redeploy the API Mesh, or skip to finish without redeploying.',
                            signInButton,
                            'Skip',
                        );

                        if (selection === signInButton) {
                            const loginSuccess = await authService.loginAndRestoreProjectContext({
                                organization: project.adobe?.organization,
                                projectId: project.adobe?.projectId,
                                workspace: project.adobe?.workspace,
                            });
                            if (!loginSuccess) {
                                context.logger.warn(`${logPrefix} Sign-in failed, skipping mesh redeploy`);
                            }
                        }
                    }

                    // Only deploy if authenticated (either already or after sign-in)
                    const isNowAuthenticated = await authService.isAuthenticated();
                    if (isNowAuthenticated) {
                        progress.report({ message: 'Setting Adobe context...' });
                        if (project.adobe?.organization) {
                            await authService.selectOrganization(project.adobe.organization);
                        }
                        if (project.adobe?.projectId && project.adobe?.organization) {
                            await authService.selectProject(project.adobe.projectId, project.adobe.organization);
                        }
                        if (project.adobe?.workspace && project.adobe?.projectId) {
                            await authService.selectWorkspace(project.adobe.workspace, project.adobe.projectId);
                        }

                        progress.report({ message: 'Redeploying API Mesh...' });
                        context.logger.info(`${logPrefix} Redeploying mesh`);

                        try {
                            const { deployMeshComponent } = await import('@/features/mesh/services/meshDeployment');
                            const { fetchMeshInfoFromAdobeIO } = await import('@/features/mesh/services/meshVerifier');
                            const commandManager = ServiceLocator.getCommandExecutor();

                            // Query Adobe I/O for existing mesh ID (context already set above)
                            const meshInfo = await fetchMeshInfoFromAdobeIO(context.logger);
                            const existingMeshId = meshInfo?.meshId || '';

                            const meshResult = await deployMeshComponent(
                                meshComponent.path,
                                commandManager,
                                context.logger,
                                (_msg, sub) => progress.report({ message: sub || _msg }),
                                existingMeshId,
                            );

                            if (meshResult.success && meshResult.data?.endpoint) {
                                const { updateMeshState } = await import('@/features/mesh/services/stalenessDetector');
                                await updateMeshState(project, meshResult.data.endpoint);
                                meshRedeployed = true;
                                context.logger.info(`${logPrefix} Mesh redeployed: ${meshResult.data.endpoint}`);
                            } else {
                                throw new Error(meshResult.error || 'Mesh deployment failed');
                            }
                        } catch (meshError) {
                            context.logger.error(`${logPrefix} Mesh redeployment failed`, meshError as Error);
                            // Partial success — reset worked but mesh failed
                            project.status = 'ready';
                            await context.stateManager.saveProject(project);

                            void vscode.window.showWarningMessage(
                                `"${project.name}" reset successfully, but mesh redeployment failed: ${(meshError as Error).message}. You can redeploy manually from the dashboard.`,
                            );

                            return { success: true, error: `Reset completed but mesh redeployment failed: ${(meshError as Error).message}` };
                        }
                    } else {
                        context.logger.info(`${logPrefix} Not authenticated, skipping mesh redeploy`);
                    }
                }

                // Save final project state
                project.status = 'ready';
                await context.stateManager.saveProject(project);

                // Show auto-dismissing success notification
                const successMessage = meshRedeployed
                    ? `"${project.name}" reset and mesh redeployed successfully`
                    : `"${project.name}" reset successfully`;

                void vscode.window.withProgress(
                    {
                        location: vscode.ProgressLocation.Notification,
                        title: successMessage,
                    },
                    async () =>
                        new Promise(resolve =>
                            setTimeout(resolve, TIMEOUTS.UI.NOTIFICATION),
                        ),
                );

                context.logger.info(`${logPrefix} Project reset completed`);
                return { success: true };
            },
        );
    } catch (error) {
        const errorMessage = (error as Error).message;
        context.logger.error(`${logPrefix} Reset failed`, error as Error);

        vscode.window.showErrorMessage(`Failed to reset project: ${errorMessage}`);

        return { success: false, error: errorMessage };
    } finally {
        // Restore status if still 'resetting' (error path)
        if (project.status === 'resetting') {
            project.status = originalStatus;
            await context.stateManager.saveProject(project);
        }
    }
}
