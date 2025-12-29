/**
 * ComponentManager
 *
 * Handles the installation, lifecycle, and management of individual components
 * within a Demo Builder project.
 *
 * This service composes specialized modules:
 * - ComponentInstallation: Git cloning, version detection, submodule handling
 * - ComponentDependencies: npm install, build scripts
 *
 * Provides a simple constructor interface (just Logger) while delegating
 * to the specialized modules for implementation.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { ComponentInstallOptions, ComponentInstallResult } from '@/features/components/services/types';
import { Project, ComponentInstance, TransformedComponentDefinition, ComponentStatus } from '@/types';
import type { Logger } from '@/types/logger';
import { getComponentInstancesByType } from '@/types/typeGuards';
import { ComponentInstallation } from './componentInstallation';
import { ComponentDependencies } from './componentDependencies';

export type { ComponentInstallOptions, ComponentInstallResult };

// Re-export extracted services for direct use
export { ComponentInstallation } from './componentInstallation';
export { ComponentDependencies } from './componentDependencies';

/**
 * ComponentManager handles the installation, lifecycle, and management
 * of individual components within a Demo Builder project.
 */
export class ComponentManager {
    private logger: Logger;
    private installation: ComponentInstallation;
    private dependencies: ComponentDependencies;

    constructor(logger: Logger) {
        this.logger = logger;
        this.installation = new ComponentInstallation(logger);
        this.dependencies = new ComponentDependencies(logger);
    }

    /**
     * Install a component into the project
     */
    public async installComponent(
        project: Project,
        componentDef: TransformedComponentDefinition,
        options: ComponentInstallOptions = {},
    ): Promise<ComponentInstallResult> {
        try {
            this.logger.debug(`[ComponentManager] Installing component: ${componentDef.name}`);

            // Initialize component instance
            const componentInstance: ComponentInstance = {
                id: componentDef.id,
                name: componentDef.name,
                type: componentDef.type,
                subType: componentDef.subType,
                icon: componentDef.icon,
                status: 'not-installed',
                lastUpdated: new Date(),
            };

            // Determine installation method based on source type
            if (!componentDef.source) {
                // No source = configuration only (e.g., backend selector)
                componentInstance.status = 'ready';
                return { success: true, component: componentInstance };
            }

            switch (componentDef.source.type) {
                case 'git':
                    return await this.installGitComponent(
                        project,
                        componentDef,
                        componentInstance,
                        options,
                    );

                case 'npm':
                    return await this.installNpmComponent(
                        componentDef,
                        componentInstance,
                        options,
                    );

                case 'local':
                    return await this.linkLocalComponent(
                        componentDef,
                        componentInstance,
                    );

                default:
                    throw new Error(`Unsupported source type: ${componentDef.source.type}`);
            }
        } catch (error) {
            this.logger.error(`[ComponentManager] Failed to install ${componentDef.name}`, error as Error);
            return {
                success: false,
                error: (error as Error).message,
            };
        }
    }

    /**
     * Install a Git-based component by cloning the repository
     */
    private async installGitComponent(
        project: Project,
        componentDef: TransformedComponentDefinition,
        componentInstance: ComponentInstance,
        options: ComponentInstallOptions,
    ): Promise<ComponentInstallResult> {
        // Delegate to ComponentInstallation
        const result = await this.installation.installGitComponent(
            project.path,
            componentDef,
            componentInstance,
            options,
        );

        if (!result.success) {
            return result;
        }

        // Install dependencies if needed
        if (!options.skipDependencies && componentInstance.path) {
            componentInstance.status = 'installing';
            await this.dependencies.installDependenciesForComponent(
                componentInstance.path,
                componentDef,
                false,
            );
        }

        // Mark as ready
        componentInstance.status = 'ready';
        componentInstance.lastUpdated = new Date();

        // Single consolidated log line with all key info
        const versionInfo = componentInstance.version ? `, v${componentInstance.version}` : '';
        this.logger.debug(`[ComponentManager] Installed ${componentDef.name}${versionInfo}`);

        return {
            success: true,
            component: componentInstance,
        };
    }

    /**
     * Install an npm package component
     */
    private async installNpmComponent(
        componentDef: TransformedComponentDefinition,
        componentInstance: ComponentInstance,
        options: ComponentInstallOptions,
    ): Promise<ComponentInstallResult> {
        if (!componentDef.source?.package) {
            throw new Error('NPM package name not provided');
        }

        this.logger.debug(`[ComponentManager] Installing npm package: ${componentDef.source.package}`);

        componentInstance.status = 'installing';
        componentInstance.version = options.version || componentDef.source.version || 'latest';

        // For npm packages, we typically install them into a specific component
        // (e.g., demo-inspector gets installed into the frontend component)
        // This is a reference/metadata entry, actual installation happens during frontend setup

        componentInstance.status = 'ready';
        componentInstance.lastUpdated = new Date();
        componentInstance.metadata = {
            packageName: componentDef.source.package,
            installTarget: 'frontend', // Default target for npm packages
        };

        return {
            success: true,
            component: componentInstance,
        };
    }

    /**
     * Link a local component (for development)
     */
    private async linkLocalComponent(
        componentDef: TransformedComponentDefinition,
        componentInstance: ComponentInstance,
    ): Promise<ComponentInstallResult> {
        if (!componentDef.source?.url) {
            throw new Error('Local path not provided');
        }

        this.logger.debug(`[ComponentManager] Linking local component: ${componentDef.source.url}`);

        // Verify path exists
        try {
            await fs.access(componentDef.source.url);
        } catch {
            throw new Error(`Local path does not exist: ${componentDef.source.url}`);
        }

        componentInstance.path = componentDef.source.url;
        componentInstance.status = 'ready';
        componentInstance.lastUpdated = new Date();
        componentInstance.metadata = {
            isLocal: true,
        };

        return {
            success: true,
            component: componentInstance,
        };
    }

    /**
     * Install npm dependencies for an already-cloned component
     * Used in phase-based installation where clone and npm install are separate
     */
    public async installNpmDependencies(
        componentPath: string,
        componentDef: TransformedComponentDefinition,
    ): Promise<{ success: boolean; error?: string }> {
        return this.dependencies.installNpmDependencies(componentPath, componentDef);
    }

    /**
     * Update a component's status
     */
    public async updateComponentStatus(
        project: Project,
        componentId: string,
        status: ComponentStatus,
        metadata?: Record<string, unknown>,
    ): Promise<void> {
        if (!project.componentInstances) {
            project.componentInstances = {};
        }

        if (!project.componentInstances[componentId]) {
            throw new Error(`Component ${componentId} not found in project`);
        }

        project.componentInstances[componentId].status = status;
        project.componentInstances[componentId].lastUpdated = new Date();

        if (metadata) {
            project.componentInstances[componentId].metadata = {
                ...project.componentInstances[componentId].metadata,
                ...metadata,
            };
        }

        this.logger.debug(`[ComponentManager] Updated ${componentId} status to ${status}`);
    }

    /**
     * Get component instance by ID
     */
    public getComponent(project: Project, componentId: string): ComponentInstance | undefined {
        return project.componentInstances?.[componentId];
    }

    /**
     * Get all components of a specific type
     * SOP sec 4: Using helper instead of inline Object.values with filter
     */
    public getComponentsByType(
        project: Project,
        type: ComponentInstance['type'],
    ): ComponentInstance[] {
        return getComponentInstancesByType(project, type);
    }

    /**
     * Remove a component from the project
     */
    public async removeComponent(
        project: Project,
        componentId: string,
        deleteFiles = false,
    ): Promise<void> {
        const component = this.getComponent(project, componentId);

        if (!component) {
            throw new Error(`Component ${componentId} not found`);
        }

        this.logger.debug(`[ComponentManager] Removing component: ${component.name}`);

        // Delete files if requested and path exists
        if (deleteFiles && component.path) {
            try {
                await fs.rm(component.path, { recursive: true, force: true });
                this.logger.debug(`[ComponentManager] Deleted component files: ${component.path}`);
            } catch (error) {
                this.logger.error('[ComponentManager] Failed to delete component files', error as Error);
            }
        }

        // Remove from project
        if (project.componentInstances) {
            delete project.componentInstances[componentId];
        }

        this.logger.debug(`[ComponentManager] Successfully removed ${component.name}`);
    }

    /**
     * Get the components directory path for a project
     */
    public static getComponentsDirectory(project: Project): string {
        return path.join(project.path, 'components');
    }

    /**
     * Get the path for a specific component
     */
    public static getComponentPath(project: Project, componentId: string): string {
        return path.join(ComponentManager.getComponentsDirectory(project), componentId);
    }
}
