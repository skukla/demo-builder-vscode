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
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import stacksConfig from '@/features/project-creation/config/stacks.json';
import type { ComponentDefinitionEntry } from '@/features/project-creation/services/componentInstallationOrchestrator';
import type { Project, TransformedComponentDefinition, ComponentRegistry } from '@/types';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';
import type { Stack } from '@/types/stacks';

// Stacks configuration — same source of truth used by executor.ts

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

/** Look up a component definition by type from the registry manager */
async function findComponentByType(
    registryManager: { getFrontends: () => Promise<TransformedComponentDefinition[]>; getDependencies: () => Promise<TransformedComponentDefinition[]>; getAppBuilder: () => Promise<TransformedComponentDefinition[]>; getComponentById: (id: string) => Promise<TransformedComponentDefinition | undefined> },
    comp: { id: string; type: string },
): Promise<TransformedComponentDefinition | undefined> {
    if (comp.type === 'frontend') {
        const frontends = await registryManager.getFrontends();
        return frontends.find((f: { id: string }) => f.id === comp.id);
    }
    if (comp.type === 'dependency') {
        const deps = await registryManager.getDependencies();
        return deps.find((d: { id: string }) => d.id === comp.id);
    }
    if (comp.type === 'app-builder') {
        const apps = await registryManager.getAppBuilder();
        return apps.find((a: { id: string }) => a.id === comp.id);
    }
    return undefined;
}

/** Build the flat component list from stack + saved addons */
function buildComponentList(
    stack: Stack,
    project: Project,
): { id: string; type: string }[] {
    const frontend = stack.frontend;
    // Use project's saved dependencies (includes user-selected optional deps like mesh) or fall back to stack defaults
    const dependencies = project.componentSelections?.dependencies ?? stack.dependencies ?? [];
    const appBuilder = (project.selectedAddons || []).filter(
        addon => !stack.optionalAddons?.some(opt => opt.id === addon),
    );
    return [
        ...(frontend ? [{ id: frontend, type: 'frontend' }] : []),
        ...dependencies.map((id: string) => ({ id, type: 'dependency' })),
        ...appBuilder.map((id: string) => ({ id, type: 'app-builder' })),
    ];
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

    const allComponents = buildComponentList(stack, project);

    const componentDefinitions: Map<string, ComponentDefinitionEntry> = new Map();

    for (const comp of allComponents) {
        let componentDef = await findComponentByType(registryManager, comp);

        // Fallback: search all sections (e.g., mesh in "mesh" section)
        if (!componentDef) {
            componentDef = await registryManager.getComponentById(comp.id);
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

        const installOptions: { skipDependencies?: boolean } = { skipDependencies: true };

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
// Mesh Redeployment
// ==========================================================

/** Ensure Adobe I/O authentication, prompting sign-in if expired */
async function ensureAdobeAuth(
    project: Project,
    context: HandlerContext,
    logPrefix: string,
): Promise<boolean> {
    const { ServiceLocator } = await import('@/core/di');
    const authService = ServiceLocator.getAuthenticationService();

    const { ensureAdobeIOAuth } = await import('@/core/auth/adobeAuthGuard');
    const authResult = await ensureAdobeIOAuth({
        authManager: authService,
        logger: context.logger,
        logPrefix,
        projectContext: {
            organization: project.adobe?.organization,
            projectId: project.adobe?.projectId,
            workspace: project.adobe?.workspace,
        },
        warningMessage: 'Your Adobe I/O session has expired. Sign in to redeploy the API Mesh, or skip to finish without redeploying.',
    });

    return authResult.authenticated;
}

/** Set Adobe org/project/workspace context for mesh deployment */
async function restoreAdobeContext(
    project: Project,
    progress: { report: (value: { message: string }) => void },
): Promise<void> {
    const { ServiceLocator } = await import('@/core/di');
    const authService = ServiceLocator.getAuthenticationService();

    progress.report({ message: 'Setting Adobe context...' });
    if (project.adobe?.organization) {
        await authService.selectOrganization(project.adobe.organization, { skipPermissionCheck: true });
    }
    if (project.adobe?.projectId && project.adobe?.organization) {
        await authService.selectProject(project.adobe.projectId, project.adobe.organization);
    }
    if (project.adobe?.workspace && project.adobe?.projectId) {
        await authService.selectWorkspace(project.adobe.workspace, project.adobe.projectId);
    }
}

/** Handle mesh redeployment during project reset */
async function handleMeshRedeployment(
    project: Project,
    context: HandlerContext,
    logPrefix: string,
    progress: { report: (value: { message: string }) => void },
    vscode: typeof import('vscode'),
): Promise<{ redeployed: boolean; earlyReturn?: HandlerResponse } | null> {
    const { getMeshComponentInstance } = await import('@/types/typeGuards');
    const meshComponent = getMeshComponentInstance(project);

    if (!meshComponent?.path) return null;

    progress.report({ message: 'Checking Adobe I/O authentication...' });
    const isAuthenticated = await ensureAdobeAuth(project, context, logPrefix);

    if (!isAuthenticated) {
        context.logger.info(`${logPrefix} Not authenticated, skipping mesh redeploy`);
        return { redeployed: false };
    }

    await restoreAdobeContext(project, progress);

    progress.report({ message: 'Redeploying API Mesh...' });
    context.logger.info(`${logPrefix} Redeploying mesh`);

    try {
        const { deployMeshComponent } = await import('@/features/mesh/services/meshDeployment');
        const { fetchMeshInfoFromAdobeIO } = await import('@/features/mesh/services/meshVerifier');
        const { ServiceLocator } = await import('@/core/di');
        const commandManager = ServiceLocator.getCommandExecutor();

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
            context.logger.info(`${logPrefix} Mesh redeployed: ${meshResult.data.endpoint}`);
            return { redeployed: true };
        }
        throw new Error(meshResult.error || 'Mesh deployment failed');
    } catch (meshError) {
        context.logger.error(`${logPrefix} Mesh redeployment failed`, meshError as Error);
        project.status = 'ready';
        await context.stateManager.saveProject(project);

        void vscode.window.showWarningMessage(
            `"${project.name}" reset successfully, but mesh redeployment failed: ${(meshError as Error).message}. You can redeploy manually from the dashboard.`,
        );

        return {
            redeployed: false,
            earlyReturn: { success: true, error: `Reset completed but mesh redeployment failed: ${(meshError as Error).message}` },
        };
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
                const meshRedeployResult = await handleMeshRedeployment(
                    project, context, logPrefix, progress, vscode,
                );
                if (meshRedeployResult?.earlyReturn) return meshRedeployResult.earlyReturn;
                const meshRedeployed = meshRedeployResult?.redeployed ?? false;

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
