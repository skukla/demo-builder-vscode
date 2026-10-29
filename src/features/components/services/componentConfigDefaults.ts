/**
 * Component Config Defaults
 *
 * Which settings a stack has, and how their defaults land in `componentConfigs`.
 * ONE rule for both doors that create a project.
 *
 * Both used to live only inside the wizard's `useComponentConfig` hook, which
 * fills every blank setting from the brand package and then the catalog when
 * the settings screen mounts. An agent's `create_project` never mounts that
 * screen, so its projects were saved with none of those defaults. Found live
 * on JustRite (2026-10-06): "Product Images from AEM Assets" defaults to
 * Enabled, Configure displayed Enabled, and the storefront published
 * `commerce-assets-enabled: false` — every product image broken.
 *
 * Pure — no React, no registry loading. Callers hand in what they have.
 *
 * @module features/components/services/componentConfigDefaults
 */

import { resolveWriteTargets, writeToComponents } from './componentConfigWrites';
import type { ServiceDefinition } from '@/types/components';
import type { ComponentConfigs } from '@/types/webview';

/** A component as far as its settings go: its own env vars and the services it needs. */
export interface ConfigFieldSource {
    id: string;
    data: {
        configuration?: {
            requiredEnvVars?: string[];
            optionalEnvVars?: string[];
            requiredServices?: string[];
        };
    };
}

/** An env var definition, with the components that declare it. */
export type ConfigField<D> = D & { key: string; componentIds: string[] };

/** What a fill needs from a field. */
export interface DefaultableField {
    key: string;
    componentIds: string[];
    default?: string | number | boolean;
}

/**
 * Every setting the given components declare, once each, in first-seen order.
 *
 * A component contributes its own required and optional env vars, plus those of
 * each service it requires — the backend-specific list when the service has one.
 * MESH_ENDPOINT is skipped: creation fills it from the deployed mesh.
 */
export function collectConfigFields<D extends object>(
    components: readonly ConfigFieldSource[],
    envVarDefs: Record<string, D>,
    services: Record<string, ServiceDefinition> | undefined,
    backendId: string | undefined,
): Array<ConfigField<D>> {
    const fields = new Map<string, ConfigField<D>>();

    for (const { id, data } of components) {
        const add = (key: string): void => {
            if (key === 'MESH_ENDPOINT') return;
            const def = envVarDefs[key];
            if (!def) return;
            const existing = fields.get(key);
            if (!existing) {
                fields.set(key, { ...def, key, componentIds: [id] });
            } else if (!existing.componentIds.includes(id)) {
                existing.componentIds.push(id);
            }
        };

        data.configuration?.requiredEnvVars?.forEach(add);
        data.configuration?.optionalEnvVars?.forEach(add);

        if (data.configuration?.requiredServices && backendId) {
            for (const serviceId of data.configuration.requiredServices) {
                const service = services?.[serviceId];
                if (service?.backendSpecific && service.requiredEnvVarsByBackend) {
                    service.requiredEnvVarsByBackend[backendId]?.forEach(add);
                } else {
                    service?.requiredEnvVars?.forEach(add);
                }
            }
        }
    }

    return [...fields.values()];
}

/** Undefined or '' — NOT falsy: a stored `false` or `0` is a value. */
export const isBlankValue = (value: unknown): boolean => value === undefined || value === '';

/** Absent only: '' is a value the user deliberately cleared. */
export const isAbsentValue = (value: unknown): boolean => value === undefined;

/**
 * Fill settings from the brand package's defaults, else the catalog's.
 *
 * FILL-only: a stored value is never overridden. Package defaults used to
 * override, which stomped a user's saved Business Structure scope back to the
 * brand's codes every time the wizard loaded a project (2026-08-13,
 * leah-b2b-demo). A real package SWITCH clears the old package's keys first
 * (`removeKeysFromComponents`) so this fill applies the new ones.
 *
 * Writes through {@link writeToComponents} to {@link resolveWriteTargets}, so the
 * store scope lands on the backend only and the input is never mutated.
 *
 * @param isBlank - What counts as unset. The wizard's form fills `''` too, on
 *   load; creation fills only absent keys, so a field the user cleared stays clear.
 * @returns The same object when nothing was filled
 */
export function applyFieldDefaults(
    configs: ComponentConfigs,
    fields: readonly DefaultableField[],
    packageDefaults: Record<string, string> | undefined,
    backendId: string | undefined,
    isBlank: (value: unknown) => boolean = isBlankValue,
): ComponentConfigs {
    let next = configs;
    for (const field of fields) {
        const value = packageDefaults?.[field.key] ?? field.default;
        if (value === undefined || value === '') continue;

        // Per component because STORAGE is per component, not because divergent
        // copies are wanted — every write path fans one value to all of them.
        const targets = resolveWriteTargets(field, backendId).filter((componentId) =>
            isBlank(next[componentId]?.[field.key]),
        );
        if (targets.length === 0) continue;

        next = writeToComponents(next, targets, { [field.key]: value });
    }
    return next;
}
