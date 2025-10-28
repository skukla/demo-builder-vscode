import * as path from 'path';
import {
    ComponentDefinition,
    ComponentRegistry,
    TransformedComponentDefinition,
    RawComponentRegistry,
    RawComponentDefinition,
    EnvVarDefinition,
    ServiceDefinition,
    PresetDefinition,
} from '@/types';
import { ProjectConfig } from '@/types/handlers';
import { ConfigurationLoader } from '@/core/config/ConfigurationLoader';

export class ComponentRegistryManager {
    private rawLoader: ConfigurationLoader<RawComponentRegistry>;
    private transformedRegistry: ComponentRegistry | null = null;

    constructor(extensionPath: string) {
        const registryPath = path.join(extensionPath, 'templates', 'components.json');
        this.rawLoader = new ConfigurationLoader<RawComponentRegistry>(registryPath);
    }

    async loadRegistry(): Promise<ComponentRegistry> {
        if (!this.transformedRegistry) {
            const rawRegistry = await this.rawLoader.load({
                validationErrorMessage: 'Failed to parse component registry'
            });
            this.transformedRegistry = this.transformToGroupedStructure(rawRegistry);
        }
        return this.transformedRegistry;
    }

    /**
     * Transform v2.0 flat structure to grouped structure for internal use
     * Uses selectionGroups to organize components, builds envVars arrays from shared registry
     */
    private transformToGroupedStructure(raw: RawComponentRegistry): ComponentRegistry {
        const components: {
            frontends: TransformedComponentDefinition[];
            backends: TransformedComponentDefinition[];
            dependencies: TransformedComponentDefinition[];
            externalSystems: TransformedComponentDefinition[];
            appBuilder: TransformedComponentDefinition[];
        } = {
            frontends: [],
            backends: [],
            dependencies: [],
            externalSystems: [],
            appBuilder: [],
        };

        const groups = raw.selectionGroups || {};
        const components_map = raw.components || {};

        // Helper to enhance a component with envVars and services
        const enhanceComponent = (id: string): TransformedComponentDefinition | null => {
            const comp = components_map[id];
            if (!comp) return null;
            
            return {
                ...comp,
                id,
                configuration: comp.configuration ? {
                    ...comp.configuration,
                    envVars: this.buildEnvVarsForComponent(id, comp, raw.envVars || {}),
                    services: comp.configuration.requiredServices 
                        ? this.buildServicesForComponent(comp.configuration.requiredServices, raw.services || {}, raw.envVars || {})
                        : undefined,
                } : undefined,
            };
        };

        // Map selectionGroups to internal buckets
        (groups.frontends || []).forEach((id: string) => {
            const enhanced = enhanceComponent(id);
            if (enhanced) components.frontends.push(enhanced);
        });

        (groups.backends || []).forEach((id: string) => {
            const enhanced = enhanceComponent(id);
            if (enhanced) components.backends.push(enhanced);
        });

        (groups.appBuilderApps || []).forEach((id: string) => {
            const enhanced = enhanceComponent(id);
            if (enhanced) components.appBuilder.push(enhanced);
        });

        (groups.integrations || []).forEach((id: string) => {
            const enhanced = enhanceComponent(id);
            if (enhanced) components.externalSystems.push(enhanced);
        });

        // Map dependencies from selectionGroups (explicit list)
        (groups.dependencies || []).forEach((id: string) => {
            const enhanced = enhanceComponent(id);
            if (enhanced) components.dependencies.push(enhanced);
        });

        // Process infrastructure components (always required)
        const infrastructure: TransformedComponentDefinition[] = [];
        if (raw.infrastructure) {
            for (const [id, comp] of Object.entries(raw.infrastructure)) {
                const enhanced: TransformedComponentDefinition = {
                    ...comp,
                    id,
                    configuration: comp.configuration ? {
                        ...comp.configuration,
                        envVars: this.buildEnvVarsForComponent(id, comp, raw.envVars || {}),
                        services: comp.configuration.requiredServices
                            ? this.buildServicesForComponent(comp.configuration.requiredServices, raw.services || {}, raw.envVars || {})
                            : undefined,
                    } : undefined,
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

    /**
     * Build envVars array for a component from the shared envVars registry
     */
    private buildEnvVarsForComponent(
        componentId: string,
        component: RawComponentDefinition,
        sharedEnvVars: Record<string, Omit<EnvVarDefinition, 'key'>>,
    ): EnvVarDefinition[] {
        const envVars: EnvVarDefinition[] = [];
        const envVarConfig = component.configuration?.envVars;
        const requiredKeys = envVarConfig?.requiredEnvVars || [];
        const optionalKeys = envVarConfig?.optionalEnvVars || [];
        const allKeys = [...requiredKeys, ...optionalKeys];

        for (const key of allKeys) {
            const envVar = sharedEnvVars[key];
            if (envVar) {
                envVars.push({
                    key,
                    ...envVar,
                    usedBy: [componentId],
                });
            }
        }

        return envVars;
    }

    /**
     * Build services array for a component from service IDs
     * Expands service references to full definitions with envVars
     */
    private buildServicesForComponent(
        serviceIds: string[],
        services: Record<string, ServiceDefinition>,
        sharedEnvVars: Record<string, Omit<EnvVarDefinition, 'key'>>,
    ): ServiceDefinition[] {
        const expandedServices: ServiceDefinition[] = [];

        for (const serviceId of serviceIds) {
            const service = services[serviceId];
            if (service) {
                // Build envVars for this service
                const serviceEnvVars: EnvVarDefinition[] = [];
                const requiredKeys = service.requiredEnvVars || [];
                
                for (const key of requiredKeys) {
                    const envVar = sharedEnvVars[key];
                    if (envVar) {
                        serviceEnvVars.push({
                            key,
                            ...envVar,
                        });
                    }
                }

                expandedServices.push({
                    ...service,
                    envVars: serviceEnvVars,
                });
            }
        }

        return expandedServices;
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

    async getExternalSystems(): Promise<TransformedComponentDefinition[]> {
        const registry = await this.loadRegistry();
        return registry.components.externalSystems || [];
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

    async getComponentById(id: string): Promise<ComponentDefinition | undefined> {
        const registry = await this.loadRegistry();
        const allComponents = [
            ...registry.components.frontends,
            ...registry.components.backends,
            ...registry.components.dependencies,
            ...(registry.components.externalSystems || []),
            ...(registry.components.appBuilder || []),
        ];
        return allComponents.find(c => c.id === id) as ComponentDefinition | undefined;
    }

    async getPresets(): Promise<PresetDefinition[]> {
        // Presets are not currently defined in components.json v2.0
        return [];
    }

    async checkCompatibility(frontendId: string, backendId: string): Promise<boolean> {
        const frontend = await this.getComponentById(frontendId);
        if (!frontend) return false;
        
        return frontend.compatibleBackends?.includes(backendId) || false;
    }

    async getRequiredNodeVersions(
        frontendId?: string,
        backendId?: string,
        dependencies?: string[],
        externalSystems?: string[],
        appBuilder?: string[],
    ): Promise<Set<string>> {
        const nodeVersions = new Set<string>();

        // Check frontend node version
        if (frontendId) {
            const frontend = await this.getComponentById(frontendId);
            if (frontend?.configuration?.nodeVersion) {
                nodeVersions.add(frontend.configuration.nodeVersion);
            }
        }

        // Check backend node version
        if (backendId) {
            const backend = await this.getComponentById(backendId);
            if (backend?.configuration?.nodeVersion) {
                nodeVersions.add(backend.configuration.nodeVersion);
            }
        }

        // Check dependencies node versions (e.g., API Mesh requires Node 18)
        if (dependencies) {
            for (const depId of dependencies) {
                const dep = await this.getComponentById(depId);
                if (dep?.configuration?.nodeVersion) {
                    nodeVersions.add(dep.configuration.nodeVersion);
                }
            }
        }

        // Check app builder node versions (typically Node 22)
        if (appBuilder) {
            for (const appId of appBuilder) {
                const app = await this.getComponentById(appId);
                if (app?.configuration?.nodeVersion) {
                    nodeVersions.add(app.configuration.nodeVersion);
                }
            }
        }

        return nodeVersions;
    }

    async getNodeVersionToComponentMapping(
        frontendId?: string,
        backendId?: string,
        dependencies?: string[],
        externalSystems?: string[],
        appBuilder?: string[],
    ): Promise<Record<string, string>> {
        const mapping: Record<string, string> = {};

        // Check infrastructure node versions (always required)
        const registry = await this.loadRegistry();
        if (registry.infrastructure) {
            for (const infra of registry.infrastructure) {
                if (infra.configuration?.nodeVersion) {
                    mapping[infra.configuration.nodeVersion] = infra.name;
                }
            }
        }

        // Check frontend node version
        if (frontendId) {
            const frontend = await this.getComponentById(frontendId);
            if (frontend?.configuration?.nodeVersion) {
                mapping[frontend.configuration.nodeVersion] = frontend.name;
            }
        }

        // Check backend node version
        if (backendId) {
            const backend = await this.getComponentById(backendId);
            if (backend?.configuration?.nodeVersion) {
                mapping[backend.configuration.nodeVersion] = backend.name;
            }
        }

        // Check dependencies node versions
        if (dependencies) {
            for (const depId of dependencies) {
                const dep = await this.getComponentById(depId);
                if (dep?.configuration?.nodeVersion) {
                    mapping[dep.configuration.nodeVersion] = dep.name;
                }
            }
        }

        // Check app builder node versions
        if (appBuilder) {
            for (const appId of appBuilder) {
                const app = await this.getComponentById(appId);
                if (app?.configuration?.nodeVersion) {
                    mapping[app.configuration.nodeVersion] = app.name;
                }
            }
        }

        return mapping;
    }
}

export class DependencyResolver {
    constructor(private registryManager: ComponentRegistryManager) {}

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

export function createComponentRegistryManager(extensionPath: string): ComponentRegistryManager {
    return new ComponentRegistryManager(extensionPath);
}

export function createDependencyResolver(registryManager: ComponentRegistryManager): DependencyResolver {
    return new DependencyResolver(registryManager);
}