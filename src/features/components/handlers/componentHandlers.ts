/**
 * Component Handlers
 *
 * Handles component selection and management using modern MessageHandler pattern.
 * Each handler contains business logic and returns structured responses.
 *
 * Handlers:
 * - update-component-selection: Update current component selection
 * - update-components-data: Update components data cache
 * - loadComponents: Load component definitions
 * - get-components-data: Fetch component data
 * - checkCompatibility: Check component compatibility
 * - loadDependencies: Load component dependencies
 * - loadPreset: Load preset configuration
 * - validateSelection: Validate component selection
 */

import { ComponentRegistryManager, DependencyResolver } from '@/features/components/services/ComponentRegistryManager';
import { ComponentSelection } from '@/types/components';
import { HandlerContext, MessageHandler } from '@/types/handlers';

/**
 * Get or create ComponentRegistryManager from context
 */
function getRegistryManager(context: HandlerContext): ComponentRegistryManager {
    return new ComponentRegistryManager(context.context.extensionPath);
}

/**
 * Get or create DependencyResolver from context
 */
function getDependencyResolver(context: HandlerContext): DependencyResolver {
    const registryManager = getRegistryManager(context);
    return new DependencyResolver(registryManager);
}

/**
 * update-component-selection - Update current component selection
 *
 * Stores the user's current component selection in context state.
 */
export const handleUpdateComponentSelection: MessageHandler = async (
    context: HandlerContext,
    payload?: unknown,
) => {
    const selection = payload as ComponentSelection;
    context.sharedState.currentComponentSelection = selection;
    context.logger.debug(`Updated component selection: ${selection.frontend || 'none'}/${selection.backend || 'none'} + ${selection.dependencies?.length || 0} deps + ${selection.services?.length || 0} services`);
    return { success: true };
};

/**
 * update-components-data - Update components data cache
 *
 * Stores the components data in context state.
 */
export const handleUpdateComponentsData: MessageHandler = async (
    context: HandlerContext,
    payload?: unknown,
) => {
    const componentsData = payload as import('../../../types/components').ComponentConfigs;
    context.sharedState.componentsData = componentsData;
    context.logger.debug('Updated components data');
    return { success: true };
};

/**
 * loadComponents - Load component definitions
 *
 * Loads component definitions from the component registry and returns them.
 */
export const handleLoadComponents: MessageHandler = async (context: HandlerContext) => {
    try {
        const registryManager = getRegistryManager(context);

        const frontends = await registryManager.getFrontends();
        const backends = await registryManager.getBackends();
        const integrations = await registryManager.getIntegrations();
        const appBuilder = await registryManager.getAppBuilder();
        const dependencies = await registryManager.getDependencies();
        const presets = await registryManager.getPresets();

        const componentsData = {
            frontends: frontends.map(f => ({
                id: f.id,
                name: f.name,
                description: f.description,
                features: f.features,
                configuration: f.configuration,
                recommended: f.id === 'citisignal-nextjs',
            })),
            backends: backends.map(b => ({
                id: b.id,
                name: b.name,
                description: b.description,
                configuration: b.configuration,
            })),
            integrations: integrations.map(e => ({
                id: e.id,
                name: e.name,
                description: e.description,
                configuration: e.configuration,
            })),
            appBuilder: appBuilder.map(a => ({
                id: a.id,
                name: a.name,
                description: a.description,
                configuration: a.configuration,
            })),
            dependencies: dependencies.map(d => ({
                id: d.id,
                name: d.name,
                description: d.description,
                configuration: d.configuration,
            })),
            presets,
        };

        return {
            success: true,
            type: 'componentsLoaded',
            data: componentsData,
        };
    } catch (error) {
        context.logger.error('Failed to load components:', error as Error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            message: 'Failed to load components',
        };
    }
};

/**
 * get-components-data - Fetch component data with full configuration
 *
 * Retrieves component data including dependency relationships and env vars.
 * Uses flat structure (requiredEnvVars/optionalEnvVars) throughout.
 */
export const handleGetComponentsData: MessageHandler = async (context: HandlerContext) => {
    try {
        const registryManager = getRegistryManager(context);

        const frontends = await registryManager.getFrontends();
        const backends = await registryManager.getBackends();
        const integrations = await registryManager.getIntegrations();
        const appBuilder = await registryManager.getAppBuilder();
        const dependencies = await registryManager.getDependencies();
        const registry = await registryManager.loadRegistry();

        const componentsData = {
            frontends: frontends.map(f => ({
                id: f.id,
                name: f.name,
                description: f.description,
                dependencies: f.dependencies,
                configuration: f.configuration,
            })),
            backends: backends.map(b => ({
                id: b.id,
                name: b.name,
                description: b.description,
                dependencies: b.dependencies,
                configuration: b.configuration,
            })),
            integrations: integrations.map(e => ({
                id: e.id,
                name: e.name,
                description: e.description,
                dependencies: e.dependencies,
                configuration: e.configuration,
            })),
            appBuilder: appBuilder.map(a => ({
                id: a.id,
                name: a.name,
                description: a.description,
                dependencies: a.dependencies,
                configuration: a.configuration,
            })),
            dependencies: dependencies.map(d => ({
                id: d.id,
                name: d.name,
                description: d.description,
                dependencies: d.dependencies,
                configuration: d.configuration,
            })),
            envVars: registry.envVars || {},
        };

        context.logger.debug('[componentHandlers] Sending components-data:', {
            frontendsCount: frontends.length,
            backendsCount: backends.length,
            dependenciesCount: dependencies.length,
            integrationsCount: integrations.length,
            appBuilderCount: appBuilder.length,
            envVarsCount: Object.keys(registry.envVars || {}).length,
            envVarsSample: Object.keys(registry.envVars || {}).slice(0, 5),
            sampleFrontendConfig: frontends[0]?.configuration,
        });

        return {
            success: true,
            type: 'components-data',
            data: componentsData,
        };
    } catch (error) {
        context.logger.error('Failed to load component configurations:', error as Error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            message: 'Failed to load component configurations',
        };
    }
};

/**
 * checkCompatibility - Check component compatibility
 *
 * Validates that selected components are compatible with each other.
 */
export const handleCheckCompatibility: MessageHandler = async (
    context: HandlerContext,
    payload?: unknown,
) => {
    try {
        const { frontend, backend } = payload as { frontend: string; backend: string };
        const registryManager = getRegistryManager(context);

        const compatible = await registryManager.checkCompatibility(frontend, backend);

        return {
            success: true,
            type: 'compatibilityResult',
            data: { compatible },
        };
    } catch (error) {
        context.logger.error('Failed to check compatibility:', error as Error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            message: 'Failed to check compatibility',
        };
    }
};

/**
 * loadDependencies - Load component dependencies
 *
 * Loads dependencies for the selected components.
 */
export const handleLoadDependencies: MessageHandler = async (
    context: HandlerContext,
    payload?: unknown,
) => {
    try {
        const { frontend, backend } = payload as { frontend: string; backend: string };
        const dependencyResolver = getDependencyResolver(context);

        const resolved = await dependencyResolver.resolveDependencies(frontend, backend);

        const dependencies = [
            ...resolved.required.map(d => ({
                id: d.id,
                name: d.name,
                description: d.description,
                required: true,
                impact: d.configuration?.impact,
            })),
            ...resolved.optional.map(d => ({
                id: d.id,
                name: d.name,
                description: d.description,
                required: false,
                impact: d.configuration?.impact,
            })),
        ];

        return {
            success: true,
            type: 'dependenciesLoaded',
            data: { dependencies },
        };
    } catch (error) {
        context.logger.error('Failed to load dependencies:', error as Error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            message: 'Failed to load dependencies',
        };
    }
};

/**
 * loadPreset - Load preset configuration
 *
 * Loads a preset configuration of components.
 */
export const handleLoadPreset: MessageHandler = async (
    context: HandlerContext,
    payload?: unknown,
) => {
    try {
        const { presetId } = payload as { presetId: string };
        const registryManager = getRegistryManager(context);

        const presets = await registryManager.getPresets();
        const preset = presets.find(p => p.id === presetId);

        if (!preset) {
            throw new Error(`Preset ${presetId} not found`);
        }

        return {
            success: true,
            type: 'presetLoaded',
            data: {
                frontend: preset.selections.frontend,
                backend: preset.selections.backend,
                dependencies: preset.selections.dependencies,
            },
        };
    } catch (error) {
        context.logger.error('Failed to load preset:', error as Error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            message: 'Failed to load preset',
        };
    }
};

/**
 * validateSelection - Validate component selection
 *
 * Validates the current component selection is valid.
 */
export const handleValidateSelection: MessageHandler = async (
    context: HandlerContext,
    payload?: unknown,
) => {
    try {
        const { frontend, backend, dependencies } = payload as {
            frontend: string;
            backend: string;
            dependencies: string[];
        };
        const dependencyResolver = getDependencyResolver(context);

        const resolved = await dependencyResolver.resolveDependencies(
            frontend,
            backend,
            dependencies,
        );

        const validation = await dependencyResolver.validateDependencyChain(resolved.all);

        return {
            success: true,
            type: 'validationResult',
            data: validation,
        };
    } catch (error) {
        context.logger.error('Failed to validate selection:', error as Error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            message: 'Failed to validate selection',
        };
    }
};
