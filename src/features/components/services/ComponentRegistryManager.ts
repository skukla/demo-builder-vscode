/**
 * Component Registry Manager
 *
 * Manages loading and accessing component definitions from src/features/components/config/components.json.
 * Provides methods for:
 * - Loading and transforming component registry
 * - Accessing frontends, backends, dependencies, integrations, and app builder components
 * - Component compatibility checking
 *
 * The DependencyResolver class (re-exported here for backward compatibility)
 * handles dependency resolution logic.
 */

import * as path from 'path';
import { ConfigurationLoader } from '@/core/config/ConfigurationLoader';
import { ComponentRegistry, RawComponentDefinition, RawComponentRegistry, ServiceDefinition, TransformedComponentDefinition } from '@/types/components';

// Re-export DependencyResolver for backward compatibility
export { DependencyResolver } from './DependencyResolver';

export class ComponentRegistryManager {
    private rawLoader: ConfigurationLoader<RawComponentRegistry>;
    private transformedRegistry: ComponentRegistry | null = null;

    constructor(extensionPath: string) {
        const registryPath = path.join(extensionPath, 'src', 'features', 'components', 'config', 'components.json');
        this.rawLoader = new ConfigurationLoader<RawComponentRegistry>(registryPath);
    }

    async loadRegistry(): Promise<ComponentRegistry> {
        if (!this.transformedRegistry) {
            const rawRegistry = await this.rawLoader.load({
                validationErrorMessage: 'Failed to parse component registry',
            });
            this.transformedRegistry = this.transformToGroupedStructure(rawRegistry);
        }
        return this.transformedRegistry;
    }

    private transformToGroupedStructure(raw: RawComponentRegistry): ComponentRegistry {
        const components: {
            frontends: TransformedComponentDefinition[];
            backends: TransformedComponentDefinition[];
            dependencies: TransformedComponentDefinition[];
            mesh: TransformedComponentDefinition[];
            appBuilder: TransformedComponentDefinition[];
            integrations: TransformedComponentDefinition[];
        } = {
            frontends: [],
            backends: [],
            dependencies: [],
            mesh: [],
            appBuilder: [],
            integrations: [],
        };

        const groups = raw.selectionGroups || {};

        // Build unified components map from v3.0.0 sectioned structure
        const componentsMap: Record<string, RawComponentDefinition> = {
            ...(raw.frontends || {}),       // v3.0.0: frontends section
            ...(raw.backends || {}),        // v3.0.0: backends section
            ...(raw.mesh || {}),            // v3.0.0: mesh section (contains commerce-mesh)
            ...(raw.appBuilder || {}),      // App Builder app components
            ...(raw.dependencies || {}),    // v3.0.0: dependencies section
            ...(raw.integrations || {}),    // v3.0.0: integrations section
        };

        const enhanceComponent = (id: string): TransformedComponentDefinition | null => {
            const comp = componentsMap[id];
            if (!comp) return null;

            return {
                ...comp,
                id,
                configuration: comp.configuration,
            };
        };

        const addComponents = (groupIds: string[] | undefined, target: TransformedComponentDefinition[]) => {
            (groupIds || []).forEach((id: string) => {
                const enhanced = enhanceComponent(id);
                if (enhanced) target.push(enhanced);
            });
        };

        addComponents(groups.frontends, components.frontends);
        addComponents(groups.backends, components.backends);
        addComponents(groups.integrations, components.integrations);
        addComponents(groups.dependencies, components.dependencies);

        // Mesh components are loaded directly from mesh section (not via selectionGroups)
        if (raw.mesh) {
            for (const id of Object.keys(raw.mesh)) {
                const enhanced = enhanceComponent(id);
                if (enhanced) components.mesh.push(enhanced);
            }
        }

        // App Builder components load directly from the appBuilder section (mirrors mesh)
        if (raw.appBuilder) {
            for (const id of Object.keys(raw.appBuilder)) {
                const enhanced = enhanceComponent(id);
                if (enhanced) components.appBuilder.push(enhanced);
            }
        }

        const infrastructure: TransformedComponentDefinition[] = [];
        if (raw.infrastructure) {
            for (const [id, comp] of Object.entries(raw.infrastructure)) {
                const enhanced: TransformedComponentDefinition = {
                    ...comp,
                    id,
                    configuration: comp.configuration,
                };
                infrastructure.push(enhanced);
            }
        }

        return {
            version: raw.version,
            infrastructure,
            components,
            services: raw.services || {},
            envVars: raw.envVars || {},
        };
    }

    async getFrontends(): Promise<TransformedComponentDefinition[]> {
        const registry = await this.loadRegistry();
        return registry.components.frontends;
    }

    async getBackends(): Promise<TransformedComponentDefinition[]> {
        const registry = await this.loadRegistry();
        return registry.components.backends;
    }

    async getDependencies(): Promise<TransformedComponentDefinition[]> {
        const registry = await this.loadRegistry();
        return registry.components.dependencies;
    }

    async getIntegrations(): Promise<TransformedComponentDefinition[]> {
        const registry = await this.loadRegistry();
        return registry.components.integrations || [];
    }

    async getMesh(): Promise<TransformedComponentDefinition[]> {
        const registry = await this.loadRegistry();
        return registry.components.mesh || [];
    }

    async getAppBuilder(): Promise<TransformedComponentDefinition[]> {
        const registry = await this.loadRegistry();
        return registry.components.appBuilder || [];
    }

    async getServices(): Promise<Record<string, ServiceDefinition>> {
        const registry = await this.loadRegistry();
        return registry.services || {};
    }

    async getServiceById(id: string): Promise<ServiceDefinition | undefined> {
        const registry = await this.loadRegistry();
        return registry.services?.[id];
    }

    async getComponentById(id: string): Promise<TransformedComponentDefinition | undefined> {
        const registry = await this.loadRegistry();
        const allComponents = [
            ...registry.components.frontends,
            ...registry.components.backends,
            ...registry.components.dependencies,
            ...(registry.components.mesh || []),
            ...(registry.components.appBuilder || []),
            ...(registry.components.integrations || []),
        ];
        return allComponents.find(c => c.id === id);
    }

    async checkCompatibility(frontendId: string, backendId: string): Promise<boolean> {
        const frontend = await this.getComponentById(frontendId);
        if (!frontend) return false;
        
        return frontend.compatibleBackends?.includes(backendId) || false;
    }
}
