/**
 * Component Registry Manager
 *
 * Manages loading and accessing component definitions from src/features/components/config/components.json.
 * Provides methods for:
 * - Loading and transforming component registry
 * - Accessing frontends, backends, dependencies, integrations, and app builder components
 * - Node.js version resolution with security validation
 * - Component compatibility checking
 *
 * The DependencyResolver class (re-exported here for backward compatibility)
 * handles dependency resolution logic.
 */

import * as path from 'path';
import { ConfigurationLoader } from '@/core/config/ConfigurationLoader';
import { validateNodeVersion } from '@/core/validation';
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

// Re-export DependencyResolver for backward compatibility
export { DependencyResolver } from './DependencyResolver';

export class ComponentRegistryManager {
    private rawLoader: ConfigurationLoader<RawComponentRegistry>;
    private transformedRegistry: ComponentRegistry | null = null;

    constructor(extensionPath: string) {
        const registryPath = path.join(extensionPath, 'src', 'features', 'components', 'config', 'components.json');
        this.rawLoader = new ConfigurationLoader<RawComponentRegistry>(registryPath);
    }

    /**
     * Formats validation error with component context
     *
     * Helper method to provide consistent error messages when Node.js version validation
     * fails, helping developers quickly identify and fix issues in components.json.
     *
     * @param componentName - Name of the component with invalid version
     * @param componentType - Type of component (e.g., "component", "infrastructure")
     * @param originalError - Original validation error from validateNodeVersion
     * @returns Formatted error with component context and fix instructions
     */
    private formatNodeVersionError(
        componentName: string,
        componentType: string,
        originalError: Error,
    ): Error {
        return new Error(
            `Invalid Node version in ${componentType} "${componentName}": ${originalError.message}\n` +
            `Please edit src/features/components/config/components.json and ensure nodeVersion uses valid format (e.g., "20", "20.11.0").`,
        );
    }

    /**
     * Validates and adds a Node.js version to a collection
     *
     * SECURITY: Defense-in-depth validation for CWE-77 (Command Injection)
     * - Validates nodeVersion from components.json before it reaches CommandExecutor
     * - Catches malicious versions from manually-edited configuration files
     * - Prevents command injection attacks via fnm/nvm version parameters
     *
     * Error Context: Includes component name to help developers identify and fix issues
     *
     * @param version - Node.js version string to validate and add
     * @param versions - Set to add the validated version to
     * @param componentName - Component name for error context
     * @param componentType - Component type (e.g., "component", "infrastructure") for error messages
     * @throws Error with component context if validation fails
     *
     * @example
     * // Valid version - added to set
     * this.validateAndAddNodeVersion('20', nodeVersions, 'Frontend', 'component');
     *
     * @example
     * // Invalid version - throws error with context
     * this.validateAndAddNodeVersion('20; rm -rf /', nodeVersions, 'Frontend', 'component');
     * // Throws: "Invalid Node version in component "Frontend": Invalid Node.js version format..."
     */
    private validateAndAddNodeVersion(
        version: string,
        versions: Set<string>,
        componentName: string,
        componentType: string = 'component',
    ): void {
        try {
            // SECURITY: Validate nodeVersion from components.json (defense-in-depth for CWE-77)
            // This validation happens at the SOURCE (component registry) before values reach
            // CommandExecutor, providing an additional layer of security against command injection.
            validateNodeVersion(version);
            versions.add(version);
        } catch (error) {
            throw this.formatNodeVersionError(componentName, componentType, error as Error);
        }
    }

    /**
     * Validates and adds a Node.js version to a mapping
     *
     * SECURITY: Defense-in-depth validation for CWE-77 (Command Injection)
     * - Validates nodeVersion from components.json before it reaches CommandExecutor
     * - Catches malicious versions from manually-edited configuration files
     * - Prevents command injection attacks via fnm/nvm version parameters
     *
     * Error Context: Includes component name to help developers identify and fix issues
     *
     * @param version - Node.js version string to validate
     * @param componentName - Component name to map to the version
     * @param mapping - Record to add the validated version mapping to
     * @param componentType - Component type (e.g., "component", "infrastructure") for error messages
     * @throws Error with component context if validation fails
     *
     * @example
     * // Valid version - added to mapping
     * this.validateAndMapNodeVersion('20', 'Frontend', mapping, 'component');
     * // Result: mapping['20'] = 'Frontend'
     *
     * @example
     * // Multiple components with same version - aggregated
     * this.validateAndMapNodeVersion('20', 'Frontend', mapping, 'component');
     * this.validateAndMapNodeVersion('20', 'Backend', mapping, 'component');
     * // Result: mapping['20'] = 'Frontend, Backend'
     *
     * @example
     * // Invalid version - throws error with context
     * this.validateAndMapNodeVersion('20; rm -rf /', 'Frontend', mapping, 'component');
     * // Throws: "Invalid Node version in component "Frontend": Invalid Node.js version format..."
     */
    private validateAndMapNodeVersion(
        version: string,
        componentName: string,
        mapping: Record<string, string>,
        componentType: string = 'component',
    ): void {
        try {
            // SECURITY: Validate nodeVersion from components.json (defense-in-depth for CWE-77)
            // This validation happens at the SOURCE (component registry) before values reach
            // CommandExecutor, providing an additional layer of security against command injection.
            validateNodeVersion(version);

            // Aggregate component names when multiple components require the same Node version
            // This provides accurate labeling (e.g., "Edge Delivery Services, Adobe Commerce PaaS")
            // instead of showing only the last-processed component
            if (mapping[version]) {
                // Avoid duplicates (same component might be referenced multiple times)
                const existingNames = mapping[version].split(', ');
                if (!existingNames.includes(componentName)) {
                    mapping[version] = `${mapping[version]}, ${componentName}`;
                }
            } else {
                mapping[version] = componentName;
            }
        } catch (error) {
            throw this.formatNodeVersionError(componentName, componentType, error as Error);
        }
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
            integrations: TransformedComponentDefinition[];
            appBuilder: TransformedComponentDefinition[];
        } = {
            frontends: [],
            backends: [],
            dependencies: [],
            mesh: [],
            integrations: [],
            appBuilder: [],
        };

        const groups = raw.selectionGroups || {};

        // Build unified components map from v3.0.0 sections OR v2.0 components
        // This supports both the new sectioned structure and legacy unified structure
        const componentsMap: Record<string, RawComponentDefinition> = {
            ...(raw.components || {}),      // v2.0 legacy structure
            ...(raw.frontends || {}),       // v3.0.0: frontends section
            ...(raw.backends || {}),        // v3.0.0: backends section
            ...(raw.mesh || {}),            // v3.0.0: mesh section (contains commerce-mesh)
            ...(raw.dependencies || {}),    // v3.0.0: dependencies section
            ...(raw.appBuilderApps || {}),  // v3.0.0: appBuilderApps section
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
        addComponents(groups.appBuilderApps, components.appBuilder);
        addComponents(groups.integrations, components.integrations);
        addComponents(groups.dependencies, components.dependencies);

        // Mesh components are loaded directly from mesh section (not via selectionGroups)
        if (raw.mesh) {
            for (const id of Object.keys(raw.mesh)) {
                const enhanced = enhanceComponent(id);
                if (enhanced) components.mesh.push(enhanced);
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

    private buildServicesForComponent(
        serviceIds: string[],
        services: Record<string, ServiceDefinition>,
        sharedEnvVars: Record<string, Omit<EnvVarDefinition, 'key'>>,
    ): ServiceDefinition[] {
        const expandedServices: ServiceDefinition[] = [];

        for (const serviceId of serviceIds) {
            const service = services[serviceId];
            if (service) {
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

    async getIntegrations(): Promise<TransformedComponentDefinition[]> {
        const registry = await this.loadRegistry();
        return registry.components.integrations || [];
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
            ...(registry.components.mesh || []),
            ...(registry.components.integrations || []),
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

    /**
     * Gets all required Node.js versions for selected components
     *
     * SECURITY: Validates all Node.js versions from components.json to prevent
     * command injection attacks (CWE-77). This provides defense-in-depth by
     * catching malicious versions at the source before they reach CommandExecutor.
     *
     * @param frontendId - Frontend component ID (optional)
     * @param backendId - Backend component ID (optional)
     * @param dependencies - Array of dependency component IDs (optional)
     * @param integrations - Array of integration component IDs (optional)
     * @param appBuilder - Array of App Builder component IDs (optional)
     * @returns Set of Node.js version strings required by all components
     * @throws Error if any component has an invalid nodeVersion format
     */
    async getRequiredNodeVersions(
        frontendId?: string,
        backendId?: string,
        dependencies?: string[],
        integrations?: string[],
        appBuilder?: string[],
    ): Promise<Set<string>> {
        const nodeVersions = new Set<string>();

        // Check frontend node version
        if (frontendId) {
            const frontend = await this.getComponentById(frontendId);
            if (frontend?.configuration?.nodeVersion) {
                this.validateAndAddNodeVersion(
                    frontend.configuration.nodeVersion,
                    nodeVersions,
                    frontend.name,
                );
            }
        }

        // Check backend node version
        if (backendId) {
            const backend = await this.getComponentById(backendId);
            if (backend?.configuration?.nodeVersion) {
                this.validateAndAddNodeVersion(
                    backend.configuration.nodeVersion,
                    nodeVersions,
                    backend.name,
                );
            }
        }

        // Check dependencies node versions (e.g., API Mesh requires Node 18)
        if (dependencies) {
            for (const depId of dependencies) {
                const dep = await this.getComponentById(depId);
                if (dep?.configuration?.nodeVersion) {
                    this.validateAndAddNodeVersion(
                        dep.configuration.nodeVersion,
                        nodeVersions,
                        dep.name,
                    );
                }
            }
        }

        // Check app builder node versions (typically Node 22)
        if (appBuilder) {
            for (const appId of appBuilder) {
                const app = await this.getComponentById(appId);
                if (app?.configuration?.nodeVersion) {
                    this.validateAndAddNodeVersion(
                        app.configuration.nodeVersion,
                        nodeVersions,
                        app.name,
                    );
                }
            }
        }

        return nodeVersions;
    }

    /**
     * Gets a mapping of Node.js versions to component names
     *
     * SECURITY: Validates all Node.js versions from components.json to prevent
     * command injection attacks (CWE-77). This provides defense-in-depth by
     * catching malicious versions at the source before they reach CommandExecutor.
     *
     * @param frontendId - Frontend component ID (optional)
     * @param backendId - Backend component ID (optional)
     * @param dependencies - Array of dependency component IDs (optional)
     * @param integrations - Array of integration component IDs (optional)
     * @param appBuilder - Array of App Builder component IDs (optional)
     * @returns Record mapping Node.js versions to component names (e.g., {"20": "Frontend", "22": "App Builder"})
     * @throws Error if any component has an invalid nodeVersion format
     */
    async getNodeVersionToComponentMapping(
        frontendId?: string,
        backendId?: string,
        dependencies?: string[],
        integrations?: string[],
        appBuilder?: string[],
    ): Promise<Record<string, string>> {
        const mapping: Record<string, string> = {};

        // Check infrastructure node versions (always required)
        const registry = await this.loadRegistry();
        if (registry.infrastructure) {
            for (const infra of registry.infrastructure) {
                if (infra.configuration?.nodeVersion) {
                    this.validateAndMapNodeVersion(
                        infra.configuration.nodeVersion,
                        infra.name,
                        mapping,
                        'infrastructure',
                    );
                }
            }
        }

        // Check frontend node version
        if (frontendId) {
            const frontend = await this.getComponentById(frontendId);
            if (frontend?.configuration?.nodeVersion) {
                this.validateAndMapNodeVersion(
                    frontend.configuration.nodeVersion,
                    frontend.name,
                    mapping,
                );
            }
        }

        // Check backend node version
        if (backendId) {
            const backend = await this.getComponentById(backendId);
            if (backend?.configuration?.nodeVersion) {
                this.validateAndMapNodeVersion(
                    backend.configuration.nodeVersion,
                    backend.name,
                    mapping,
                );
            }
        }

        // Check dependencies node versions
        if (dependencies) {
            for (const depId of dependencies) {
                const dep = await this.getComponentById(depId);
                if (dep?.configuration?.nodeVersion) {
                    this.validateAndMapNodeVersion(
                        dep.configuration.nodeVersion,
                        dep.name,
                        mapping,
                    );
                }
            }
        }

        // Check app builder node versions
        if (appBuilder) {
            for (const appId of appBuilder) {
                const app = await this.getComponentById(appId);
                if (app?.configuration?.nodeVersion) {
                    this.validateAndMapNodeVersion(
                        app.configuration.nodeVersion,
                        app.name,
                        mapping,
                    );
                }
            }
        }

        return mapping;
    }
}