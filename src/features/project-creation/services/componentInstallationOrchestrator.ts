/**
 * ComponentInstallationOrchestrator
 *
 * Handles the parallel cloning and installation of project components.
 * Phase 1: Clone all components (download source)
 * Phase 2: Install npm dependencies for all components
 */

import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { ProgressTracker } from '../handlers/shared';
import type { Project, TransformedComponentDefinition } from '@/types';
import type { Logger } from '@/types/logger';
import { ComponentManager } from '@/features/components/services/componentManager';

export interface ComponentDefinitionEntry {
    definition: TransformedComponentDefinition;
    type: string;
    installOptions: {
        selectedSubmodules?: string[];
        skipDependencies?: boolean;
    };
}

export interface InstallationContext {
    project: Project;
    componentDefinitions: Map<string, ComponentDefinitionEntry>;
    progressTracker: ProgressTracker;
    logger: Logger;
    saveProject: () => Promise<void>;
    /**
     * Optional override for components directory.
     * Used in edit mode to install to a temp directory before atomic swap.
     */
    componentsDir?: string;
}

/**
 * Phase 1: Clone all components in parallel
 *
 * Downloads source code without running npm install.
 */
export async function cloneAllComponents(
    context: InstallationContext,
): Promise<void> {
    const { project, componentDefinitions, progressTracker, logger, saveProject, componentsDir } = context;

    progressTracker('Downloading Components', 25, 'Cloning repositories...');
    logger.debug('[Project Creation] Phase 1: Downloading components...');

    // Determine target directory: use override if provided (edit mode), otherwise default
    const targetComponentsDir = componentsDir || path.join(project.path, 'components');

    // Ensure target directory exists
    await fsPromises.mkdir(targetComponentsDir, { recursive: true });

    if (componentsDir) {
        logger.debug(`[Project Creation] Using custom components directory: ${componentsDir}`);
    }

    const componentManager = new ComponentManager(logger);

    // Clone all components in parallel
    const clonePromises = Array.from(componentDefinitions.entries()).map(
        async ([compId, { definition, installOptions }]) => {
            logger.debug(`[Project Creation] Cloning: ${definition.name}`);

            // Clone without npm install (skipDependencies: true)
            // Pass custom componentsDir through options for edit mode (atomic swap)
            const optionsWithDir = componentsDir
                ? { ...installOptions, componentsDir: targetComponentsDir }
                : installOptions;

            const result = await componentManager.installComponent(project, definition, optionsWithDir);

            if (!result.success || !result.component) {
                throw new Error(`Failed to clone ${definition.name}: ${result.error}`);
            }

            return { compId, component: result.component };
        },
    );

    const cloneResults = await Promise.all(clonePromises);

    // Update project with all cloned components
    for (const { compId, component } of cloneResults) {
        project.componentInstances![compId] = component;
    }

    // Save project state after all clones (show components in sidebar)
    await saveProject();
    progressTracker('Downloading Components', 40, 'All components downloaded');
    logger.debug('[Project Creation] Phase 1 complete: All components downloaded');
}

/**
 * Phase 2: Install npm dependencies for all components in parallel
 */
export async function installAllComponents(
    context: InstallationContext,
): Promise<void> {
    const { project, componentDefinitions, progressTracker, logger } = context;

    progressTracker('Installing Components', 40, 'Installing npm packages...');
    logger.debug('[Project Creation] Phase 2: Installing components...');

    const componentManager = new ComponentManager(logger);

    // Run npm install for all components in parallel
    const installPromises = Array.from(componentDefinitions.entries()).map(
        async ([compId, { definition }]) => {
            const componentPath = project.componentInstances?.[compId]?.path;
            if (!componentPath) return { compId, success: true };

            logger.debug(`[Project Creation] npm install: ${definition.name}`);

            const installResult = await componentManager.installNpmDependencies(componentPath, definition);

            if (!installResult.success) {
                throw new Error(`Failed to install ${definition.name}: ${installResult.error}`);
            }

            return { compId, success: true };
        },
    );

    await Promise.all(installPromises);

    // Update all component statuses to ready
    for (const [compId] of componentDefinitions) {
        const componentInstance = project.componentInstances![compId];
        if (componentInstance) {
            componentInstance.status = 'ready';
            componentInstance.lastUpdated = new Date();
        }
    }

    progressTracker('Installing Components', 70, 'All components installed');
    logger.debug('[Project Creation] Phase 2 complete: All components installed');
}
