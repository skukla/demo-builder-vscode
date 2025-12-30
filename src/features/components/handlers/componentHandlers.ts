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

import { toComponentDataArray, toDependencyData } from '../services/componentTransforms';
import { ComponentRegistryManager, DependencyResolver } from '@/features/components/services/ComponentRegistryManager';
import { ComponentSelection } from '@/types/components';
import { toAppError } from '@/types/errors';
import { HandlerContext, MessageHandler } from '@/types/handlers';
import { getEntryCount } from '@/types/typeGuards';

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
            frontends: toComponentDataArray(frontends, { recommendedId: 'headless', includeFeatures: true }),
            backends: toComponentDataArray(backends),
            integrations: toComponentDataArray(integrations),
            appBuilder: toComponentDataArray(appBuilder),
            dependencies: toComponentDataArray(dependencies),
            presets,
        };

        return {
            success: true,
            type: 'componentsLoaded',
            data: componentsData,
        };
    } catch (error) {
        const appError = toAppError(error);
        context.logger.error('Failed to load components:', appError);
        return {
            success: false,
            error: appError.userMessage,
            code: appError.code,
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
            frontends: toComponentDataArray(frontends, { includeDependencies: true }),
            backends: toComponentDataArray(backends, { includeDependencies: true }),
            integrations: toComponentDataArray(integrations, { includeDependencies: true }),
            appBuilder: toComponentDataArray(appBuilder, { includeDependencies: true }),
            dependencies: toComponentDataArray(dependencies, { includeDependencies: true }),
            envVars: registry.envVars || {},
            services: registry.services || {},
        };

        // Log summary at debug level (concise)
        context.logger.debug(`[Components] Sending components-data: ${frontends.length} frontends, ${backends.length} backends, ${dependencies.length} deps, ${getEntryCount(registry.envVars)} envVars`);

        return {
            success: true,
            type: 'components-data',
            data: componentsData,
        };
    } catch (error) {
        const appError = toAppError(error);
        context.logger.error('Failed to load component configurations:', appError);
        return {
            success: false,
            error: appError.userMessage,
            code: appError.code,
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
        const appError = toAppError(error);
        context.logger.error('Failed to check compatibility:', appError);
        return {
            success: false,
            error: appError.userMessage,
            code: appError.code,
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
            ...resolved.required.map(d => toDependencyData(d, true)),
            ...resolved.optional.map(d => toDependencyData(d, false)),
        ];

        return {
            success: true,
            type: 'dependenciesLoaded',
            data: { dependencies },
        };
    } catch (error) {
        const appError = toAppError(error);
        context.logger.error('Failed to load dependencies:', appError);
        return {
            success: false,
            error: appError.userMessage,
            code: appError.code,
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
        const appError = toAppError(error);
        context.logger.error('Failed to load preset:', appError);
        return {
            success: false,
            error: appError.userMessage,
            code: appError.code,
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
        const appError = toAppError(error);
        context.logger.error('Failed to validate selection:', appError);
        return {
            success: false,
            error: appError.userMessage,
            code: appError.code,
            message: 'Failed to validate selection',
        };
    }
};
