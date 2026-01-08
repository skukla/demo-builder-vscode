/**
 * Environment Variable Resolver
 * 
 * Resolves all environment variables for a component, including:
 * - Component's own required/optional env vars
 * - Backend-specific service env vars (when component requires services)
 * 
 * IMPORTANT: Service env vars are only added if not already explicitly declared
 * by the component. This prevents duplication (e.g., mesh explicitly declares
 * ADOBE_CATALOG_SERVICE_ENDPOINT, so it won't get PAAS_CATALOG_SERVICE_ENDPOINT
 * from the catalog-service even though it's listed in component config).
 * 
 * This centralizes the logic that was previously duplicated across:
 * - UI config display (useComponentConfig.ts)
 * - Backend .env generation (envFileGenerator.ts)
 * - Backend JSON config generation (envFileGenerator.ts)
 */

import { TransformedComponentDefinition, ComponentRegistry } from '@/types/components';
import { Logger } from '@/utils/logger';

export interface EnvVarResolutionOptions {
    componentDef: TransformedComponentDefinition;
    registry: ComponentRegistry;
    backendId?: string;
    logger?: Logger;
}

export interface EnvVarResolutionResult {
    /** All environment variable keys (component vars + resolved service vars) */
    allEnvVarKeys: string[];
    /** Only the service-related env var keys that were added */
    serviceEnvVarKeys: string[];
}

/**
 * Resolves all environment variable keys for a component, including backend-specific service env vars.
 * 
 * Service env vars are only added if NOT already explicitly declared by the component.
 * This prevents duplication where a component declares a derived variable
 * (e.g., ADOBE_CATALOG_SERVICE_ENDPOINT) but would also get the backend-specific
 * source variable (e.g., PAAS_CATALOG_SERVICE_ENDPOINT) from the service.
 * 
 * @param options - Resolution options
 * @returns All env var keys needed for this component
 * 
 * @example
 * // Mesh component with PaaS backend
 * const registry = await registryManager.loadRegistry();
 * const result = resolveComponentEnvVars({
 *   componentDef: meshDef,  // has ADOBE_CATALOG_SERVICE_ENDPOINT explicitly
 *   registry,
 *   backendId: 'adobe-commerce-paas',
 *   logger
 * });
 * // result.allEnvVarKeys includes: ADOBE_COMMERCE_URL, ADOBE_CATALOG_SERVICE_ENDPOINT, etc.
 * // result.allEnvVarKeys does NOT include PAAS_CATALOG_SERVICE_ENDPOINT (already has derived version)
 * // result.serviceEnvVarKeys includes only the vars that were actually added from services
 */
export function resolveComponentEnvVars(options: EnvVarResolutionOptions): EnvVarResolutionResult {
    const { componentDef, registry, backendId, logger } = options;
    
    // Start with component's own env vars
    const requiredKeys = componentDef.configuration?.requiredEnvVars || [];
    const optionalKeys = componentDef.configuration?.optionalEnvVars || [];
    const explicitKeys = new Set([...requiredKeys, ...optionalKeys]); // For deduplication check
    const allEnvVarKeys = [...requiredKeys, ...optionalKeys];
    const serviceEnvVarKeys: string[] = [];
    
    // Add backend-specific service env vars if component requires services
    // ONLY add vars that are NOT already explicitly declared by the component
    if (componentDef.configuration?.requiredServices && backendId) {
        try {
            for (const serviceId of componentDef.configuration.requiredServices) {
                const serviceDef = registry.services?.[serviceId];
            
                if (serviceDef?.backendSpecific && serviceDef.requiredEnvVarsByBackend) {
                    // Backend-specific service env vars
                    const backendSpecificVars = serviceDef.requiredEnvVarsByBackend[backendId];
                    if (backendSpecificVars) {
                        // Filter out vars already explicitly declared
                        const newVars = backendSpecificVars.filter(v => !explicitKeys.has(v));
                        if (newVars.length > 0) {
                            allEnvVarKeys.push(...newVars);
                            serviceEnvVarKeys.push(...newVars);
                            logger?.debug(
                                `[Env Var Resolver] Added backend-specific vars for ${serviceId} (${backendId}): ${newVars.join(', ')}`
                            );
                        }
                        const skipped = backendSpecificVars.filter(v => explicitKeys.has(v));
                        if (skipped.length > 0) {
                            logger?.debug(
                                `[Env Var Resolver] Skipped duplicate vars for ${serviceId} (already explicit): ${skipped.join(', ')}`
                            );
                        }
                    }
                } else if (serviceDef?.requiredEnvVars) {
                    // Generic service env vars (fallback)
                    const newVars = serviceDef.requiredEnvVars.filter(v => !explicitKeys.has(v));
                    if (newVars.length > 0) {
                        allEnvVarKeys.push(...newVars);
                        serviceEnvVarKeys.push(...newVars);
                        logger?.debug(
                            `[Env Var Resolver] Added generic service vars for ${serviceId}: ${newVars.join(', ')}`
                        );
                    }
                }
            }
        } catch (error) {
            logger?.error(`[Env Var Resolver] Failed to resolve service env vars: ${(error as Error).message}`);
            logger?.error(`[Env Var Resolver] ComponentDef: ${componentDef.id}, BackendId: ${backendId}`);
            logger?.error(`[Env Var Resolver] Error details:`, error);
            // Continue with component's own env vars even if service resolution fails
        }
    }
    
    return {
        allEnvVarKeys,
        serviceEnvVarKeys,
    };
}
