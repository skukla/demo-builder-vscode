/**
 * Service Resolution Utility
 *
 * Resolves which services are provided vs. required in a stack configuration.
 * This enables intelligent service dependency management:
 * - ACCS backend provides catalog-service and live-search built-in
 * - ACO addon provides catalog-service and live-search when included
 * - PaaS backend requires these services unless ACO is present
 *
 * @example
 * // PaaS + ACO = no additional services needed
 * const missing = resolveServices(paasBackend, [acoAddon], []);
 * // Result: missing = [] (ACO provides all)
 *
 * // PaaS alone = needs explicit services
 * const missing = resolveServices(paasBackend, [], []);
 * // Result: missing = ['catalog-service', 'live-search']
 *
 * // ACCS = no additional services needed
 * const missing = resolveServices(accsBackend, [], []);
 * // Result: missing = [] (ACCS provides all built-in)
 */

import { RawComponentDefinition } from '@/types/components';
import { Logger } from '@/utils/logger';

export interface ServiceResolutionResult {
    /** Services that still need to be satisfied (prompt user for these) */
    missingServices: string[];
    /** Services that are provided by the current configuration */
    providedServices: string[];
    /** Services that are required by the current configuration */
    requiredServices: string[];
    /** Details about where each service comes from */
    serviceProviders: Map<string, string[]>; // serviceId -> component IDs that provide it
}

/**
 * Resolves service dependencies for a given stack configuration.
 *
 * @param backend - The selected backend component
 * @param addons - Array of selected addon components
 * @param explicitServices - Services explicitly selected by the user
 * @param logger - Optional logger for debugging
 * @returns ServiceResolutionResult with missing/provided/required services
 */
export function resolveServices(
    backend: RawComponentDefinition,
    addons: RawComponentDefinition[],
    explicitServices: string[] = [],
    logger?: Logger,
): ServiceResolutionResult {
    // Collect all required services from backend
    const requiredServices = backend.configuration?.requiredServices || [];

    // Collect all provided services from backend, addons, and explicit services
    const providedServices = new Set<string>([
        ...(backend.configuration?.providesServices || []),
        ...addons.flatMap((addon) => addon.configuration?.providesServices || []),
        ...explicitServices,
    ]);

    // Build provider map for transparency
    const serviceProviders = new Map<string, string[]>();

    // Add backend providers
    backend.configuration?.providesServices?.forEach((serviceId) => {
        if (!serviceProviders.has(serviceId)) {
            serviceProviders.set(serviceId, []);
        }
        serviceProviders.get(serviceId)!.push(backend.id);
    });

    // Add addon providers
    addons.forEach((addon) => {
        addon.configuration?.providesServices?.forEach((serviceId) => {
            if (!serviceProviders.has(serviceId)) {
                serviceProviders.set(serviceId, []);
            }
            serviceProviders.get(serviceId)!.push(addon.id);
        });
    });

    // Add explicit service providers
    explicitServices.forEach((serviceId) => {
        if (!serviceProviders.has(serviceId)) {
            serviceProviders.set(serviceId, []);
        }
        serviceProviders.get(serviceId)!.push('explicit-selection');
    });

    // Determine missing services
    const missingServices = requiredServices.filter((serviceId) => !providedServices.has(serviceId));

    // Log resolution details
    if (logger) {
        logger.debug(`[Service Resolution] Backend: ${backend.id}`);
        logger.debug(`[Service Resolution] Addons: ${addons.map((a) => a.id).join(', ') || 'none'}`);
        logger.debug(`[Service Resolution] Required: ${requiredServices.join(', ') || 'none'}`);
        logger.debug(`[Service Resolution] Provided: ${Array.from(providedServices).join(', ') || 'none'}`);
        logger.debug(`[Service Resolution] Missing: ${missingServices.join(', ') || 'none'}`);

        if (serviceProviders.size > 0) {
            logger.debug('[Service Resolution] Providers:');
            serviceProviders.forEach((providers, serviceId) => {
                logger.debug(`  - ${serviceId}: ${providers.join(', ')}`);
            });
        }
    }

    return {
        missingServices,
        providedServices: Array.from(providedServices),
        requiredServices,
        serviceProviders,
    };
}

/**
 * Checks if a specific service is provided by the current configuration.
 *
 * @param serviceId - The service ID to check
 * @param backend - The selected backend component
 * @param addons - Array of selected addon components
 * @returns true if the service is provided, false otherwise
 */
export function isServiceProvided(
    serviceId: string,
    backend: RawComponentDefinition,
    addons: RawComponentDefinition[],
): boolean {
    const providedServices = [
        ...(backend.configuration?.providesServices || []),
        ...addons.flatMap((addon) => addon.configuration?.providesServices || []),
    ];

    return providedServices.includes(serviceId);
}

/**
 * Gets the list of components that provide a specific service.
 *
 * @param serviceId - The service ID to check
 * @param components - All available components to check
 * @returns Array of component IDs that provide this service
 */
export function getServiceProviders(
    serviceId: string,
    components: RawComponentDefinition[],
): string[] {
    return components
        .filter((component) => component.configuration?.providesServices?.includes(serviceId))
        .map((component) => component.id);
}
