/**
 * Component Handlers
 *
 * Handles component selection and management using modern MessageHandler pattern.
 * Each handler contains business logic and returns structured responses.
 *
 * Handlers:
 * - get-components-data: Fetch component data
 * - checkCompatibility: Check component compatibility
 * - loadDependencies: Load component dependencies
 * - validateSelection: Validate component selection
 */

import {
    toComponentDataArray,
    toDependencyData,
    withEnvVarKeys,
} from '../services/componentTransforms';
import { extractErrorMessage } from '@/core/errors';
import { componentRegistryFrom } from '@/features/components/services/componentRegistryAccess';
import {
    ComponentRegistryManager,
    DependencyResolver,
} from '@/features/components/services/ComponentRegistryManager';
import { ErrorCode } from '@/types/errorCodes';
import { HandlerContext, MessageHandler } from '@/types/handlers';
import { getEntryCount } from '@/types/typeGuards';
import type { ComponentsDataPayload, GetComponentsDataResponse } from '@/types/webviewRequests';

/**
 * Create a ComponentRegistryManager for the current extension context
 */
function createRegistryManager(context: HandlerContext): ComponentRegistryManager {
    return componentRegistryFrom(context);
}

/**
 * Create a DependencyResolver backed by a fresh ComponentRegistryManager
 */
function createDependencyResolver(context: HandlerContext): DependencyResolver {
    const registryManager = createRegistryManager(context);
    return new DependencyResolver(registryManager);
}

/**
 * get-components-data - Fetch component data with full configuration
 *
 * Retrieves component data including dependency relationships and env vars.
 * Uses flat structure (requiredEnvVars/optionalEnvVars) throughout.
 */
export const handleGetComponentsData: MessageHandler = async (context: HandlerContext) => {
    try {
        const registryManager = createRegistryManager(context);

        const frontends = await registryManager.getFrontends();
        const backends = await registryManager.getBackends();
        const integrations = await registryManager.getIntegrations();
        const dependencies = await registryManager.getDependencies();
        const mesh = await registryManager.getMesh();
        const registry = await registryManager.loadRegistry();

        const componentsData: ComponentsDataPayload = {
            frontends: toComponentDataArray(frontends, { includeDependencies: true }),
            backends: toComponentDataArray(backends, { includeDependencies: true }),
            integrations: toComponentDataArray(integrations, { includeDependencies: true }),
            dependencies: toComponentDataArray(dependencies, { includeDependencies: true }),
            mesh: toComponentDataArray(mesh, { includeDependencies: true }),
            envVars: withEnvVarKeys(registry.envVars),
            services: registry.services || {},
        };

        // Log summary at debug level (concise)
        context.logger.debug(
            `[Components] Sending components-data: ${frontends.length} frontends, ${backends.length} backends, ${dependencies.length} deps, ${mesh.length} mesh, ${getEntryCount(registry.envVars)} envVars`,
        );

        return {
            success: true,
            type: 'components-data',
            data: componentsData,
        } satisfies GetComponentsDataResponse;
    } catch (error) {
        context.logger.error('Failed to load component configurations:', error);
        return {
            success: false,
            error: extractErrorMessage(error),
            // DELIBERATE, not inferred from the message text. Nothing consumes a
            // code from these handlers -- checked 2026-09-11, the only consumers of
            // TIMEOUT/NETWORK codes are on the auth surface -- so guessing one from
            // words in the error bought nothing and claimed knowledge we lack.
            code: ErrorCode.UNKNOWN,
            message: 'Failed to load component configurations',
        };
    }
};

/**
 * The frontend/backend pair a selection handler is asked about, or undefined
 * when the payload is not an object carrying both as strings. Every handler
 * below refuses with the same 'Invalid payload' on undefined.
 */
function readStackPayload(payload: unknown): { frontend: string; backend: string } | undefined {
    if (!payload || typeof payload !== 'object') {
        return undefined;
    }
    const { frontend, backend } = payload as { frontend?: unknown; backend?: unknown };
    if (typeof frontend !== 'string' || typeof backend !== 'string') {
        return undefined;
    }
    return { frontend, backend };
}

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
        const stack = readStackPayload(payload);
        if (!stack) {
            return { success: false, error: 'Invalid payload' };
        }
        const { frontend, backend } = stack;
        const registryManager = createRegistryManager(context);

        const compatible = await registryManager.checkCompatibility(frontend, backend);

        return {
            success: true,
            type: 'compatibilityResult',
            data: { compatible },
        };
    } catch (error) {
        context.logger.error('Failed to check compatibility:', error);
        return {
            success: false,
            error: extractErrorMessage(error),
            // DELIBERATE, not inferred from the message text. Nothing consumes a
            // code from these handlers -- checked 2026-09-11, the only consumers of
            // TIMEOUT/NETWORK codes are on the auth surface -- so guessing one from
            // words in the error bought nothing and claimed knowledge we lack.
            code: ErrorCode.UNKNOWN,
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
        const stack = readStackPayload(payload);
        if (!stack) {
            return { success: false, error: 'Invalid payload' };
        }
        const { frontend, backend } = stack;
        const dependencyResolver = createDependencyResolver(context);

        const resolved = await dependencyResolver.resolveDependencies(frontend, backend);

        const dependencies = [
            ...resolved.required.map((d) => toDependencyData(d, true)),
            ...resolved.optional.map((d) => toDependencyData(d, false)),
        ];

        return {
            success: true,
            type: 'dependenciesLoaded',
            data: { dependencies },
        };
    } catch (error) {
        context.logger.error('Failed to load dependencies:', error);
        return {
            success: false,
            error: extractErrorMessage(error),
            // DELIBERATE, not inferred from the message text. Nothing consumes a
            // code from these handlers -- checked 2026-09-11, the only consumers of
            // TIMEOUT/NETWORK codes are on the auth surface -- so guessing one from
            // words in the error bought nothing and claimed knowledge we lack.
            code: ErrorCode.UNKNOWN,
            message: 'Failed to load dependencies',
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
        const stack = readStackPayload(payload);
        if (!stack) {
            return { success: false, error: 'Invalid payload' };
        }
        const { dependencies } = payload as { dependencies?: string[] };
        if (!Array.isArray(dependencies)) {
            return { success: false, error: 'Invalid payload' };
        }
        const { frontend, backend } = stack;
        const dependencyResolver = createDependencyResolver(context);

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
        context.logger.error('Failed to validate selection:', error);
        return {
            success: false,
            error: extractErrorMessage(error),
            // DELIBERATE, not inferred from the message text. Nothing consumes a
            // code from these handlers -- checked 2026-09-11, the only consumers of
            // TIMEOUT/NETWORK codes are on the auth surface -- so guessing one from
            // words in the error bought nothing and claimed knowledge we lack.
            code: ErrorCode.UNKNOWN,
            message: 'Failed to validate selection',
        };
    }
};
