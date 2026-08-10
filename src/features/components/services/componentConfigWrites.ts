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

import type { ComponentConfigs } from '@/types/webview';

/** The shape both surfaces agree on: a field and the components that declare it. */
export interface FieldRef {
    /** Env-var name. */
    key: string;
    /** Every component that declares this env var. */
    componentIds: string[];
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
): ComponentConfigs {
    return writeToComponents(configs, field.componentIds, { [field.key]: value });
}
