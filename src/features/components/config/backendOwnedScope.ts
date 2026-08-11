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

/**
 * Drop backend-owned scope copies from every OTHER component's config.
 *
 * Existing manifests carry the same website / store / store view on the mesh and
 * frontend components as well as the backend, because the config surfaces used to
 * fan one field's value out to every component that declared it. Writes are now
 * narrowed to the backend (`resolveWriteTargets`), so those copies are inert — but
 * they stay on disk until something removes them, and while they exist a future
 * resolver can still read a stale one.
 *
 * **A copy is only dropped when the backend actually defines that key.** Without
 * that guard this deletes the value rather than the duplicate: nothing else holds
 * it, and `.env` generation would fall through to empty.
 *
 * Pure and in-place on the passed map; returns whether anything changed so the
 * caller can decide about persisting.
 *
 * @param componentConfigs - The project's componentConfigs map, mutated in place
 * @param backendId - The project's backend component id
 * @returns True when at least one duplicate was removed
 */
export function stripDuplicateBackendOwnedScope(
    componentConfigs: Record<string, Record<string, unknown>> | undefined,
    backendId: string | undefined,
): boolean {
    if (!componentConfigs || !backendId) return false;

    const backendConfig = componentConfigs[backendId];
    if (!backendConfig) return false;

    let changed = false;
    for (const componentId of Object.keys(componentConfigs)) {
        if (componentId === backendId) continue;

        const config = componentConfigs[componentId];
        if (!config) continue;

        for (const key of BACKEND_OWNED_SCOPE_KEYS) {
            // `in` on the backend, not a truthiness check: a key the backend
            // defines as blank is still the backend's answer, and the duplicate
            // must not survive to fill that gap.
            if (key in config && key in backendConfig) {
                delete config[key];
                changed = true;
            }
        }
    }
    return changed;
}
