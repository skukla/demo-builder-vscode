/**
 * Env var resolution: which keys a component's generated config holds, and what
 * value each key gets.
 *
 * Shared by the `.env` writer (`envFileGenerator.ts`) and the json config writer
 * (`componentConfigFiles.ts`); neither writes a file from here.
 */

import { resolveBackendOwnedScopeValue } from '@/core/config/backendOwnedScope';
import type { ComponentRegistry, EnvVarDefinition, TransformedComponentDefinition } from '@/types/components';

/**
 * Resolves all environment variable keys for a component, including backend-specific service env vars.
 * Service env vars are only added if NOT already explicitly declared by the component.
 */
export function resolveComponentEnvVars(
    componentDef: TransformedComponentDefinition,
    registry: ComponentRegistry,
    backendId?: string,
): string[] {
    const requiredKeys = componentDef.configuration?.requiredEnvVars || [];
    const optionalKeys = componentDef.configuration?.optionalEnvVars || [];
    const explicitKeys = new Set([...requiredKeys, ...optionalKeys]);
    const allEnvVarKeys = [...requiredKeys, ...optionalKeys];

    // Add backend-specific service env vars if component requires services
    if (componentDef.configuration?.requiredServices && backendId) {
        for (const serviceId of componentDef.configuration.requiredServices) {
            const serviceDef = registry.services?.[serviceId];

            if (serviceDef?.backendSpecific && serviceDef.requiredEnvVarsByBackend) {
                const backendSpecificVars = serviceDef.requiredEnvVarsByBackend[backendId];
                if (backendSpecificVars) {
                    const newVars = backendSpecificVars.filter((v) => !explicitKeys.has(v));
                    allEnvVarKeys.push(...newVars);
                }
            } else if (serviceDef?.requiredEnvVars) {
                const newVars = serviceDef.requiredEnvVars.filter((v) => !explicitKeys.has(v));
                allEnvVarKeys.push(...newVars);
            }
        }
    }

    return allEnvVarKeys;
}

/**
 * Minimal context interface for env file generation.
 *
 * ProjectSetupContext (project creation) implements it, and
 * `envFileRegeneration.ts` builds one from a saved project.
 */
export interface EnvGenerationContext {
    /** Component registry with definitions and env vars */
    registry: ComponentRegistry;
    /** Logger for debug output */
    logger: { debug: (message: string, ...args: unknown[]) => void };
    /** Get the selected backend component ID */
    getBackendId(): string | undefined;
    /** Get all component configurations (values from all components) */
    getComponentConfigs():
        | Record<string, Record<string, string | number | boolean | undefined>>
        | undefined;
    /** Get shared env var definitions from registry */
    getEnvVarDefinitions(): Record<string, Omit<EnvVarDefinition, 'key'>>;
    /** Get mesh endpoint if available */
    getMeshEndpoint(): string | undefined;
}

/**
 * Resolve one env var from the project's component configs.
 *
 * Scope keys come from the BACKEND component first. Every other key keeps the
 * historical "first component that defines it wins" behaviour.
 *
 * Why the special case: mesh (and other) component configs carry a duplicate
 * copy of website / store / store view, and only the backend's copy is updated
 * when the user changes them. Iteration order then decides the winner, and on
 * 2026-08-10 it picked the stale one — the mesh deployed against the previous
 * Commerce website while the manifest said otherwise, so PDPs rendered empty.
 * See BACKEND_OWNED_SCOPE_KEYS.
 *
 * @param key - env var name
 * @param context - generation context
 * @returns the resolved value, or undefined when no component defines it
 */
export function resolveFromComponentConfigs(
    key: string,
    context: EnvGenerationContext,
): string | undefined {
    const componentConfigs = context.getComponentConfigs();
    if (!componentConfigs) return undefined;

    const backendId = context.getBackendId();
    const fromBackend = resolveBackendOwnedScopeValue(
        key,
        backendId ? componentConfigs[backendId] : undefined,
    );
    if (fromBackend !== undefined) return String(fromBackend);

    for (const compId in componentConfigs) {
        const configValue = componentConfigs[compId]?.[key];
        if (configValue !== undefined) return String(configValue);
    }
    return undefined;
}

/**
 * Resolve the value for a single env var using priority order:
 * 1. Derived/computed values
 * 2. Runtime values (MESH_ENDPOINT)
 * 3. User-provided values from componentConfigs
 * 4. Default value from definition
 * 5. Empty string
 */
export function resolveEnvVarValue(
    envVar: EnvVarDefinition,
    derivedValues: Map<string, string>,
    context: EnvGenerationContext,
): string {
    const key = envVar.key;

    if (derivedValues.has(key)) {
        return derivedValues.get(key) ?? '';
    }

    if (key === 'MESH_ENDPOINT') {
        return context.getMeshEndpoint() || '';
    }

    const fromConfigs = resolveFromComponentConfigs(key, context);
    if (fromConfigs !== undefined) {
        return fromConfigs;
    }

    if (envVar.default !== undefined) {
        return String(envVar.default);
    }

    return '';
}
