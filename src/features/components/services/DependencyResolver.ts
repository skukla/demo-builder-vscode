/**
 * Dependency Resolver
 *
 * Handles component dependency resolution including:
 * - Resolving required and optional dependencies
 * - Validating dependency chains for circular dependencies
 * - Generating project configuration from component selections
 *
 * Extracted from ComponentRegistryManager.ts for better separation of concerns.
 */

import {
    ComponentDefinition,
} from '@/types';
import { ProjectConfig } from '@/types/handlers';
import type { ComponentRegistryManager } from './ComponentRegistryManager';

/**
 * Resolves component dependencies and generates configuration
 */
export class DependencyResolver {
    constructor(private registryManager: ComponentRegistryManager) {}

    /**
     * Resolve all dependencies for a frontend/backend selection
     * @param frontendId - Selected frontend component ID
     * @param backendId - Selected backend component ID
     * @param selectedOptional - Array of selected optional dependency IDs
     * @returns Object with required, optional, selected, and all dependencies
     */
    async resolveDependencies(
        frontendId: string,
        backendId: string,
        selectedOptional: string[] = [],
    ): Promise<{
        required: ComponentDefinition[];
        optional: ComponentDefinition[];
        selected: ComponentDefinition[];
        all: ComponentDefinition[];
    }> {
        const frontend = await this.registryManager.getComponentById(frontendId);
        const backend = await this.registryManager.getComponentById(backendId);

        if (!frontend || !backend) {
            throw new Error('Invalid frontend or backend selection');
        }

        const requiredIds = new Set<string>();
        const optionalIds = new Set<string>();

        // Add frontend dependencies
        if (frontend.dependencies) {
            frontend.dependencies.required.forEach(id => requiredIds.add(id));
            frontend.dependencies.optional.forEach(id => optionalIds.add(id));
        }

        // Add backend dependencies (if any)
        if (backend.dependencies) {
            backend.dependencies.required.forEach(id => requiredIds.add(id));
            backend.dependencies.optional.forEach(id => optionalIds.add(id));
        }

        // Resolve component definitions
        const required = await this.resolveComponentIds(Array.from(requiredIds));
        const optional = await this.resolveComponentIds(Array.from(optionalIds));
        const selected = await this.resolveComponentIds(selectedOptional);

        // Combine all dependencies
        const allDependencies = [
            ...required,
            ...selected,
        ];

        return {
            required,
            optional,
            selected,
            all: allDependencies,
        };
    }

    /**
     * Resolve component IDs to their definitions
     */
    private async resolveComponentIds(ids: string[]): Promise<ComponentDefinition[]> {
        const components: ComponentDefinition[] = [];
        for (const id of ids) {
            const component = await this.registryManager.getComponentById(id);
            if (component) {
                components.push(component);
            }
        }
        return components;
    }

    /**
     * Validate dependency chain for circular dependencies and conflicts
     * @param dependencies - Array of component definitions to validate
     * @returns Validation result with errors and warnings
     */
    async validateDependencyChain(dependencies: ComponentDefinition[]): Promise<{
        valid: boolean;
        errors: string[];
        warnings: string[];
    }> {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Check for circular dependencies
        const visited = new Set<string>();
        const recursionStack = new Set<string>();

        const checkCircular = async (componentId: string): Promise<boolean> => {
            if (recursionStack.has(componentId)) {
                errors.push(`Circular dependency detected: ${componentId}`);
                return false;
            }

            if (visited.has(componentId)) {
                return true;
            }

            visited.add(componentId);
            recursionStack.add(componentId);

            const component = await this.registryManager.getComponentById(componentId);
            if (component?.dependencies?.required) {
                for (const depId of component.dependencies.required) {
                    await checkCircular(depId);
                }
            }

            recursionStack.delete(componentId);
            return true;
        };

        for (const dep of dependencies) {
            await checkCircular(dep.id);
        }

        // Check for conflicting versions or configurations
        const componentVersions = new Map<string, string[]>();
        for (const dep of dependencies) {
            const versions = componentVersions.get(dep.id) || [];
            versions.push(dep.source?.version || 'latest');
            componentVersions.set(dep.id, versions);
        }

        componentVersions.forEach((versions, id) => {
            const uniqueVersions = new Set(versions);
            if (uniqueVersions.size > 1) {
                warnings.push(`Multiple versions requested for ${id}: ${Array.from(uniqueVersions).join(', ')}`);
            }
        });

        return {
            valid: errors.length === 0,
            errors,
            warnings,
        };
    }

    /**
     * Generate project configuration from component selections
     * @param frontend - Selected frontend component
     * @param backend - Selected backend component
     * @param dependencies - Selected dependency components
     * @returns Project configuration object
     */
    async generateConfiguration(
        frontend: ComponentDefinition,
        backend: ComponentDefinition,
        dependencies: ComponentDefinition[],
    ): Promise<ProjectConfig> {
        const config: Partial<ProjectConfig> = {};

        // Collect all environment variables
        const envVars: Record<string, string> = {};

        // Frontend env vars
        if (frontend.configuration?.envVars) {
            frontend.configuration.envVars.forEach(varName => {
                envVars[varName] = '${' + varName + '}';
            });
        }

        // Dependency-specific configurations
        for (const dep of dependencies) {
            if (dep.id === 'commerce-mesh' && dep.configuration?.providesEndpoint) {
                envVars.MESH_ENDPOINT = '${MESH_ENDPOINT}';
            }

            if (dep.id === 'demo-inspector') {
                envVars.DEMO_INSPECTOR_ENABLED = dep.configuration?.defaultEnabled ? 'true' : 'false';
            }

            // Add any dependency-specific env vars
            if (dep.configuration?.envVars) {
                dep.configuration.envVars.forEach(varName => {
                    envVars[varName] = '${' + varName + '}';
                });
            }
        }

        config.envVars = envVars;

        // Get default port from extension settings
        const vscode = await import('vscode');
        const defaultPort = vscode.workspace.getConfiguration('demoBuilder').get<number>('defaultPort', 3000);

        config.frontend = {
            id: frontend.id,
            port: frontend.configuration?.port || defaultPort,
            nodeVersion: frontend.configuration?.nodeVersion || '20',
        };
        config.backend = {
            id: backend.id,
            configuration: (backend.configuration?.required as Record<string, unknown>) || {},
        };
        config.dependencies = dependencies.map(d => ({
            id: d.id,
            type: (d.subType || d.type) as string,
            configuration: (d.configuration as Record<string, unknown>) || {},
        }));

        return config as ProjectConfig;
    }
}
