/**
 * Component Config Writes
 *
 * Reading and writing `componentConfigs` — the map of component id → env-var values that
 * BOTH commerce config surfaces edit: the wizard's `useComponentConfig` and the Configure
 * screen's `useConfigureFieldValues`.
 *
 * They had their own copies of this, and the copies shared a bug: `{...prev}` clones only
 * the outer object, so writing `next[componentId][key] = value` reached through into the
 * object the caller supplied and edited it in place. In the Configure screen that object
 * is the `existingEnvValues` PROP. Extracted here so the immutable write exists once and
 * both surfaces get the fix.
 *
 * Pure — no React, no state. The hooks own the state; this owns the transformation.
 *
 * @module features/components/services/componentConfigWrites
 */

import { BACKEND_OWNED_SCOPE_KEYS } from '@/core/config/envVarKeys';
import type { ComponentConfigs } from '@/types/webview';

/** The shape both surfaces agree on: a field and the components that declare it. */
export interface FieldRef {
    /** Env-var name. */
    key: string;
    /** Every component that declares this env var. */
    componentIds: string[];
}

/**
 * Which components a field's value should actually be WRITTEN to.
 *
 * Normally every component that declares the env var: each one renders its own
 * `.env`, and three consumers of one setting is not duplication.
 *
 * The exception is {@link BACKEND_OWNED_SCOPE_KEYS}. Website / store / store view
 * are project-level facts, and storing a copy per component means one fact with
 * several homes — which failed exactly as that shape does. On 2026-08-10 only the
 * backend's copy was updated and the answer depended on which copy a resolver
 * read: the mesh deployed against the previous website and every PDP returned 200
 * with an empty product block. `backendOwnedScope` was added to make the READS
 * agree; this makes the WRITE single, so there is no second copy to disagree with.
 *
 * `.env` generation is unaffected — `envFileGenerator.resolveFromComponentConfigs`
 * already resolves these keys from the backend before its fallback sweep, so a
 * mesh still gets the value in its own `.env`.
 *
 * Falls back to the declared list when the backend does not declare the field, so
 * a value can never be written nowhere.
 *
 * @param field - The field being edited
 * @param backendId - The project's backend component id, when known
 * @returns The component ids to write to
 */
export function resolveWriteTargets(field: FieldRef, backendId: string | undefined): string[] {
    if (!BACKEND_OWNED_SCOPE_KEYS.includes(field.key)) return field.componentIds;
    if (!backendId || !field.componentIds.includes(backendId)) return field.componentIds;
    return [backendId];
}

/**
 * The first non-empty value for a field across the components that declare it.
 *
 * @param configs - Current component configs
 * @param field - The field to read
 * @returns The value, or undefined when no declaring component holds one
 */
export function findFieldValue(
    configs: ComponentConfigs,
    field: FieldRef,
): string | number | boolean | undefined {
    for (const componentId of field.componentIds) {
        const value = configs[componentId]?.[field.key];
        if (value !== undefined && value !== '') {
            return value;
        }
    }
    return undefined;
}

/**
 * Apply values to several components at once, copying every level it touches.
 *
 * The per-component object is REPLACED, never written into — that is the whole point of
 * this helper. See the module note.
 *
 * @param configs - Current component configs
 * @param componentIds - The components to write to
 * @param values - Field key → value pairs to set on each of them
 * @returns A new configs object; the input is left exactly as it was
 */
export function writeToComponents(
    configs: ComponentConfigs,
    componentIds: string[],
    values: Record<string, string | boolean>,
): ComponentConfigs {
    const next = { ...configs };
    for (const componentId of componentIds) {
        next[componentId] = { ...(next[componentId] ?? {}), ...values };
    }
    return next;
}

/**
 * Write one value to every component that declares the field.
 *
 * @param configs - Current component configs
 * @param field - The field being edited
 * @param value - The new value
 * @returns A new configs object
 */
export function writeFieldValue(
    configs: ComponentConfigs,
    field: FieldRef,
    value: string | boolean,
    backendId?: string,
): ComponentConfigs {
    return writeToComponents(configs, resolveWriteTargets(field, backendId), {
        [field.key]: value,
    });
}

/**
 * Remove the named keys from every component's config.
 *
 * Exists for package switching: package configDefaults are FILL-only (they never
 * override a stored value — that is what stomped a user's saved store scope on
 * wizard load, 2026-08-13), so a real package change clears the outgoing and
 * incoming packages' keys here and lets the fill re-apply the new package's
 * values.
 *
 * @param configs - Current component configs
 * @param keys - Env-var keys to remove wherever they appear
 * @returns A new configs object, or the SAME object when no key was present
 */
export function removeKeysFromComponents(
    configs: ComponentConfigs,
    keys: readonly string[],
): ComponentConfigs {
    let next = configs;
    for (const [componentId, values] of Object.entries(configs)) {
        if (!values || !keys.some((key) => key in values)) continue;
        if (next === configs) next = { ...configs };
        const stripped = { ...values };
        for (const key of keys) delete stripped[key];
        next[componentId] = stripped;
    }
    return next;
}
