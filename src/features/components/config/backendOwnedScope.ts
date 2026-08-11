/**
 * Enforcement for BACKEND_OWNED_SCOPE_KEYS.
 *
 * The key list next door says "any new resolver over `componentConfigs` must
 * consult the backend first for these keys". A docstring cannot enforce that —
 * three resolvers each hand-rolled it, and the third got it wrong. These two
 * functions are the instruction in a form the compiler can point at.
 *
 * @module features/components/config/backendOwnedScope
 */

import { BACKEND_OWNED_SCOPE_KEYS } from './envVarKeys';

/**
 * Resolve one key from the backend component's own config.
 *
 * @param key - env var name
 * @param backendConfig - the BACKEND component's entry in componentConfigs
 * @returns the backend's value, or undefined when the key is not backend-owned,
 *          the backend does not define it, or there is no backend config —
 *          leaving the caller its own tiebreak for everything else
 */
export function resolveBackendOwnedScopeValue<T>(
    key: string,
    backendConfig: Record<string, T> | undefined,
): T | undefined {
    if (!backendConfig) return undefined;
    if (!BACKEND_OWNED_SCOPE_KEYS.includes(key)) return undefined;
    return backendConfig[key];
}

/**
 * Overlay every backend-owned key onto an already-merged config, in place.
 *
 * For callers that flatten all of `componentConfigs` into one record and would
 * otherwise let iteration order pick the winner.
 *
 * Uses `in` rather than an undefined check: a key the backend defines as blank is
 * still the backend's answer, and a duplicate copy on another component must not
 * fill the gap.
 *
 * @param merged - the flattened config, mutated in place
 * @param backendConfig - the BACKEND component's entry in componentConfigs
 * @returns the same `merged` record, for chaining
 */
export function applyBackendOwnedScope<T>(
    merged: Record<string, T>,
    backendConfig: Record<string, T> | undefined,
): Record<string, T> {
    if (!backendConfig) return merged;

    for (const key of BACKEND_OWNED_SCOPE_KEYS) {
        if (key in backendConfig) {
            merged[key] = backendConfig[key];
        }
    }
    return merged;
}
