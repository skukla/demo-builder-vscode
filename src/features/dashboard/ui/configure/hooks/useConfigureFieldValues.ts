/**
 * useConfigureFieldValues Hook
 *
 * Owns the Configure screen's field VALUES: the `componentConfigs` map, which fields the
 * user has touched, and every read/write against them. ConfigureScreen keeps this state
 * lifted through one hook so it spans all sections — the rail renders one section at a
 * time, and an edit made in a section the user has navigated away from must still reach
 * Save. Nothing here is scoped to the visible section.
 *
 * Extracted from ConfigureScreen when the rail refactor pushed it past the component
 * size limit. It is the LIVE logic, moved verbatim; an older extraction of the same idea
 * (`useConfigureFields`) had forked, lost the default handling and the shared-component
 * lookup, and was imported by nothing — it was deleted rather than revived.
 *
 * @module features/dashboard/ui/configure/hooks/useConfigureFieldValues
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { UniqueField } from '../configureTypes';
import { normalizeUrl } from '@/core/validation/Validator';
import {
    applyFieldUpdate,
    findFieldValue,
    writeFieldValue,
} from '@/features/components/services/componentConfigWrites';
import { diffConfigs } from '@/features/dashboard/services/configureConfigChanges';
import type { Project } from '@/types/base';
import { hasEntries } from '@/types/typeGuards';
import type { ComponentConfigs } from '@/types/webview';

export interface UseConfigureFieldValuesProps {
    /** The project (supplies the deployed mesh endpoint and the seed configs). */
    project: Project;
    /** Values resolved by the extension, when it has them. */
    existingEnvValues?: Record<string, Record<string, string>>;
}

export interface UseConfigureFieldValuesReturn {
    /** Every section's values, keyed by component id. */
    componentConfigs: ComponentConfigs;
    /** Only the values that differ from what the screen loaded. Save sends this. */
    configChanges: ComponentConfigs;
    /** Field keys the user has edited. */
    touchedFields: Set<string>;
    /** The value the form should DISPLAY for a field (defaults included). */
    getFieldValue: (field: UniqueField) => string | boolean | undefined;
    /** The raw stored value, ignoring defaults — what validation judges. */
    getValueFromConfigs: (field: UniqueField) => string | number | boolean | undefined;
    /** Whether a field currently holds a value. */
    isFieldComplete: (field: UniqueField) => boolean;
    /** Write a field's value to every component that declares it. */
    updateField: (field: UniqueField, value: string | boolean) => void;
    /** Trim a URL field's trailing slash on blur. */
    normalizeUrlField: (field: UniqueField) => void;
    /** Stage an App Builder component's value under its own component id. */
}

/**
 * Manage the Configure screen's field values.
 *
 * @param props - the project and the extension-resolved env values
 * @returns the configs, the touched set, and the accessors/mutators over them
 */
export function useConfigureFieldValues({
    project,
    existingEnvValues,
}: UseConfigureFieldValuesProps): UseConfigureFieldValuesReturn {
    const [componentConfigs, setComponentConfigs] = useState<ComponentConfigs>({});
    // What the screen was seeded with: Save sends only what differs from it (PL-76).
    const [loadedConfigs, setLoadedConfigs] = useState<ComponentConfigs>({});
    const [touchedFields, setTouchedFields] = useState<Set<string>>(new Set());

    // The backend owns the store-scope keys, so those writes land only there
    // (`resolveWriteTargets`). Every other field still writes to each component
    // that declares it.
    const backendId = project.componentSelections?.backend;

    // Seed from whichever source has values. The screen is remounted on every
    // `init` (the Configure entry keys it on the payload), so this seeds once.
    useEffect(() => {
        const seed = hasEntries(existingEnvValues) ? existingEnvValues : project.componentConfigs;
        if (!seed) return;
        setComponentConfigs(seed);
        setLoadedConfigs(seed);
    }, [existingEnvValues, project.componentConfigs]);

    const configChanges = useMemo(
        () => diffConfigs(loadedConfigs, componentConfigs),
        [loadedConfigs, componentConfigs],
    );

    const getValueFromConfigs = useCallback(
        (field: UniqueField): string | number | boolean | undefined => {
            // The field's own components first…
            const own = findFieldValue(componentConfigs, field);
            if (own !== undefined) return own;

            // …then anywhere else, because some env vars are shared across components.
            // (This second sweep is Configure-only: the wizard reads declared components
            // exclusively, since nothing has been written outside them yet.)
            for (const [componentId, config] of Object.entries(componentConfigs)) {
                if (!field.componentIds.includes(componentId)) {
                    const value = config[field.key];
                    if (value !== undefined && value !== '') {
                        return value;
                    }
                }
            }

            return undefined;
        },
        [componentConfigs],
    );

    const getFieldValue = useCallback(
        (field: UniqueField): string | boolean | undefined => {
            // Once the user has touched a field, only its OWN components count — so
            // clearing it stays cleared instead of resurfacing another component's value.
            if (touchedFields.has(field.key)) {
                for (const componentId of field.componentIds) {
                    const value = componentConfigs[componentId]?.[field.key];
                    if (value !== undefined && value !== '') {
                        return typeof value === 'number' ? String(value) : value;
                    }
                }
                // Cleared on purpose — do not fall back to the default.
                return '';
            }

            const value = getValueFromConfigs(field);
            if (value !== undefined && value !== '') {
                return typeof value === 'number' ? String(value) : value;
            }

            // Defaults apply to untouched fields only.
            if (field.default !== undefined && field.default !== '') {
                // Same numeric handling as stored values above — the registry
                // type allows numeric defaults even though none exist today.
                return typeof field.default === 'number' ? String(field.default) : field.default;
            }

            return '';
        },
        [componentConfigs, getValueFromConfigs, touchedFields],
    );

    const isFieldComplete = useCallback(
        (field: UniqueField): boolean => {
            const value = getFieldValue(field);
            return value !== undefined && value !== '';
        },
        [getFieldValue],
    );

    const updateField = useCallback(
        (field: UniqueField, value: string | boolean) => {
            setTouchedFields((prev) => new Set(prev).add(field.key));

            // The write, and the PAAS_URL -> GraphQL endpoint link, live in
            // applyFieldUpdate; the wizard applies the same edit.
            setComponentConfigs((prev) =>
                applyFieldUpdate(prev, field, value, { backendId, touchedFields }),
            );
        },
        [touchedFields, backendId],
    );

    // Trim a URL's trailing slash on blur for visual feedback. The backend normalizes
    // again when it writes the .env, so this is cosmetic rather than load-bearing.
    const normalizeUrlField = useCallback(
        (field: UniqueField) => {
            if (field.type !== 'url') return;

            const currentValue = findFieldValue(componentConfigs, field);
            if (typeof currentValue !== 'string' || !currentValue) return;

            const normalized = normalizeUrl(currentValue);
            if (normalized === currentValue) return;

            setComponentConfigs((prev) => writeFieldValue(prev, field, normalized, backendId));
        },
        [componentConfigs, backendId],
    );

    return {
        componentConfigs,
        configChanges,
        touchedFields,
        getFieldValue,
        getValueFromConfigs,
        isFieldComplete,
        updateField,
        normalizeUrlField,
    };
}
