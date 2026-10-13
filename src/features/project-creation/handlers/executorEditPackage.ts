/**
 * Project Creation — an Edit that changes the package on an Edge Delivery
 * storefront, the stack and backend staying the same (PL-75).
 *
 * The rebuild reinstalled every component and ran storefront setup again. Now
 * Finish records the package's choices on the project (the package, its settings
 * through Configure's own staging, add-ons and block libraries), writes the
 * settings files, and runs the dashboard's own Reset (`resetEdsProjectWithUI`) onto
 * the new package, with its question asked before anything in the Edit ran. Reset
 * builds the storefront from the project as it is then, so it runs last.
 *
 * @module features/project-creation/handlers/executorEditPackage
 */

import type { ProgressTracker } from './shared';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { componentRegistryFrom } from '@/features/components/services/componentRegistryAccess';
import { diffConfigs } from '@/features/dashboard/services/configureConfigChanges';
import { stageSettingsChange } from '@/features/dashboard/services/projectSettingsChange';
import { resetEdsProjectWithUI } from '@/features/eds/services/reset/edsResetUI';
import type { MeshChanges } from '@/features/mesh/services/types';
import { regenerateProjectEnvFiles } from '@/features/project-creation/helpers/envFileRegeneration';
import { generateAIContextFiles } from '@/features/project-creation/services/aiBundle/aiBundleService';
import { isPackageChange } from '@/features/project-creation/ui/wizard/editChanges';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';
import type { ProjectCreationConfig } from '@/types/webviewRequests';

/** Asks before the storefront is reset onto the new package. True to go ahead. */
export type AskResetStorefront = (project: Project) => Promise<boolean>;

/** Whether this Edit resets the storefront, decided before anything runs. */
export interface PackagePlan {
    resets: boolean;
}

/**
 * The reset that follows redeploys the mesh, so the settings staging need not
 * judge it: nothing is left out of date.
 */
const MESH_REDEPLOYED_BY_RESET: MeshChanges = {
    hasChanges: false,
    envVarsChanged: false,
    sourceFilesChanged: false,
    changedEnvVars: [],
};

/**
 * Ask, before anything runs, whether to reset the storefront onto the new package.
 *
 * @throws when the SC declines
 */
export async function planPackageChange(
    project: Project,
    changes: readonly string[],
    ask: AskResetStorefront,
): Promise<PackagePlan> {
    if (!isPackageChange(changes)) return { resets: false };
    if (!(await ask(project))) throw new Error('Saving changes was cancelled by user. Nothing was changed.');
    return { resets: true };
}

/**
 * Record the package's choices, write the settings files, then reset the
 * storefront onto it and refresh the AI files that name the package.
 *
 * @throws when the reset does not finish
 */
export async function applyPackageChange(
    context: HandlerContext,
    project: Project,
    config: ProjectCreationConfig,
    plan: PackagePlan,
    progressTracker: ProgressTracker,
): Promise<void> {
    if (!plan.resets) return;
    project.selectedPackage = config.selectedPackage;
    // The added demo wins over the package wherever a storefront is resolved, so
    // it must follow the choice, cleared included (the rebuild could never clear it).
    project.demo = config.demo;
    project.selectedAddons = config.selectedAddons;
    project.selectedBlockLibraries = config.selectedBlockLibraries;
    project.customBlockLibraries = config.customBlockLibraries;
    await stageSettingsChange(project, diffConfigs(project.componentConfigs ?? {}, config.componentConfigs ?? {}), {
        secrets: context.context.secrets,
        detectMeshChanges: async () => MESH_REDEPLOYED_BY_RESET,
        log: (line) => context.logger.info(`[Project Edit] ${line}`),
        warn: (line) => context.logger.warn(`[Project Edit] ${line}`),
    });
    const registry = await componentRegistryFrom(context).loadRegistry();
    await regenerateProjectEnvFiles(project, registry, context.logger, context.context.secrets);
    await context.stateManager.saveProject(project);

    const reset = await resetEdsProjectWithUI({
        project,
        context,
        logPrefix: '[Project Edit]',
        meshDeps: {
            commandManager: ServiceLocator.getCommandExecutor(),
            authManager: ServiceLocator.getAuthenticationService(),
        },
        includeBlockLibrary: true,
        verifyCdn: true,
        withinEdit: { report: (stage, step) => progressTracker(stage, 80, step ?? '') },
    });
    if (reset.cancelled) {
        throw new Error('Storefront reset cancelled by user. The new package is saved; use Reset to finish.');
    }
    if (!reset.success) {
        throw new Error(
            `The storefront reset failed: ${reset.error ?? 'no reason given'}. ` +
                'The new package is saved; use Reset to try again.',
        );
    }

    // AGENTS.md names the package; a bundle refresh never fails the Edit.
    try {
        await generateAIContextFiles(project.path, project, context.context.extensionPath);
        await context.stateManager.saveProjectConfigOnly(project);
    } catch (error) {
        context.logger.warn(`[Project Edit] AI files not refreshed: ${(error as Error).message}`);
    }
}
