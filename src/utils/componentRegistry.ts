import * as fs from 'fs';
import * as path from 'path';
import { 
    ComponentDefinition, 
    ComponentRegistry, 
    ComponentDependencies,
    PresetDefinition 
} from '../types';

export class ComponentRegistryManager {
    private registry: ComponentRegistry | null = null;
    private registryPath: string;

    constructor(extensionPath: string) {
        this.registryPath = path.join(extensionPath, 'templates', 'components.json');
    }

    async loadRegistry(): Promise<ComponentRegistry> {
        if (!this.registry) {
            const content = await fs.promises.readFile(this.registryPath, 'utf8');
            const rawRegistry = JSON.parse(content);
            
            // Adapter: Transform new flat structure to old grouped structure for backward compatibility
            this.registry = this.adaptNewStructure(rawRegistry);
        }
        return this.registry!;
    }

    /**
     * Adapter method to transform new v2.0 structure to old structure
     * This maintains backward compatibility while using the new normalized format
     */
    private adaptNewStructure(raw: any): ComponentRegistry {
        // If already in old format (has frontends/backends as arrays), return as-is
        if (Array.isArray(raw.components?.frontends)) {
            return raw as ComponentRegistry;
        }

        // Transform flat components map to grouped structure
        const components: any = {
            frontends: [],
            backends: [],
            dependencies: [],
            externalSystems: [],
            appBuilder: []
        };

        // Group components by type
        for (const [id, component] of Object.entries(raw.components || {})) {
            const comp = component as any;
            const enhanced = { 
                ...comp, 
                id,
                // Convert requiredEnvVars/optionalEnvVars to envVars array with full definitions
                configuration: comp.configuration ? {
                    ...comp.configuration,
                    envVars: this.buildEnvVarsForComponent(id, comp, raw.envVars || {})
                } : undefined
            };

            switch (comp.type) {
                case 'frontend':
                    components.frontends.push(enhanced);
                    break;
                case 'backend':
                    components.backends.push(enhanced);
                    break;
                case 'dependency':
                    components.dependencies.push(enhanced);
                    break;
                case 'external-system':
                    components.externalSystems.push(enhanced);
                    break;
                case 'app-builder':
                    components.appBuilder.push(enhanced);
                    break;
            }
        }

        return {
            version: raw.version,
            components,
            compatibilityMatrix: raw.compatibility || raw.compatibilityMatrix || {}
        };
    }

    /**
     * Build envVars array for a component from the shared envVars registry
     */
    private buildEnvVarsForComponent(componentId: string, component: any, sharedEnvVars: any): any[] {
        const envVars: any[] = [];
        const requiredKeys = component.configuration?.requiredEnvVars || [];
        const optionalKeys = component.configuration?.optionalEnvVars || [];
        const allKeys = [...requiredKeys, ...optionalKeys];

        for (const key of allKeys) {
            const envVar = sharedEnvVars[key];
            if (envVar) {
                envVars.push({
                    key,
                    ...envVar,
                    // Maintain the usedBy pattern for filtering (though we could remove this later)
                    usedBy: [componentId]
                });
            }
        }

        return envVars;
    }

    async getFrontends(): Promise<ComponentDefinition[]> {
        const registry = await this.loadRegistry();
        return registry.components.frontends;
    }

    async getBackends(): Promise<ComponentDefinition[]> {
        const registry = await this.loadRegistry();
        return registry.components.backends;
    }

    async getDependencies(): Promise<ComponentDefinition[]> {
        const registry = await this.loadRegistry();
        return registry.components.dependencies;
    }

    async getExternalSystems(): Promise<ComponentDefinition[]> {
        const registry = await this.loadRegistry();
        return registry.components.externalSystems || [];
    }

    async getAppBuilder(): Promise<ComponentDefinition[]> {
        const registry = await this.loadRegistry();
        return registry.components.appBuilder || [];
    }

    async getComponentById(id: string): Promise<ComponentDefinition | undefined> {
        const registry = await this.loadRegistry();
        const allComponents = [
            ...registry.components.frontends,
            ...registry.components.backends,
            ...registry.components.dependencies,
            ...(registry.components.externalSystems || []),
            ...(registry.components.appBuilder || [])
        ];
        return allComponents.find(c => c.id === id);
    }

    async getPresets(): Promise<PresetDefinition[]> {
        const registry = await this.loadRegistry();
        return registry.presets || [];
    }

    async checkCompatibility(frontendId: string, backendId: string): Promise<boolean> {
        const frontend = await this.getComponentById(frontendId);
        if (!frontend) return false;
        
        return frontend.compatibleBackends?.includes(backendId) || false;
    }

    async getCompatibilityInfo(frontendId: string, backendId: string) {
        const registry = await this.loadRegistry();
        return registry.compatibilityMatrix?.[frontendId]?.[backendId];
    }

    async getRequiredNodeVersions(
        frontendId?: string,
        backendId?: string,
        dependencies?: string[],
        externalSystems?: string[],
        appBuilder?: string[]
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
        appBuilder?: string[]
    ): Promise<{ [version: string]: string }> {
        const mapping: { [version: string]: string } = {};

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
        selectedOptional: string[] = []
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
            ...selected
        ];

        return {
            required,
            optional,
            selected,
            all: allDependencies
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
            warnings
        };
    }

    async generateConfiguration(
        frontend: ComponentDefinition,
        backend: ComponentDefinition,
        dependencies: ComponentDefinition[]
    ): Promise<Record<string, any>> {
        const config: Record<string, any> = {};

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
                envVars['MESH_ENDPOINT'] = '${MESH_ENDPOINT}';
            }
            
            if (dep.id === 'demo-inspector') {
                envVars['DEMO_INSPECTOR_ENABLED'] = dep.configuration?.defaultEnabled ? 'true' : 'false';
            }

            // Add any dependency-specific env vars
            if (dep.configuration?.envVars) {
                dep.configuration.envVars.forEach(varName => {
                    envVars[varName] = '${' + varName + '}';
                });
            }
        }

        config.envVars = envVars;
        config.frontend = {
            id: frontend.id,
            port: frontend.configuration?.port || 3000,
            nodeVersion: frontend.configuration?.nodeVersion || '20'
        };
        config.backend = {
            id: backend.id,
            configuration: backend.configuration?.required || {}
        };
        config.dependencies = dependencies.map(d => ({
            id: d.id,
            type: d.subType || d.type,
            configuration: d.configuration || {}
        }));

        return config;
    }
}

export function createComponentRegistryManager(extensionPath: string): ComponentRegistryManager {
    return new ComponentRegistryManager(extensionPath);
}

export function createDependencyResolver(registryManager: ComponentRegistryManager): DependencyResolver {
    return new DependencyResolver(registryManager);
}