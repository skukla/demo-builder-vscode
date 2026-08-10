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

import { useCallback, useEffect, useState } from 'react';
import type { UniqueField } from '../configureTypes';
import { normalizeUrl } from '@/core/validation/Validator';
import { PAAS_URL, PAAS_GRAPHQL_ENDPOINT } from '@/features/components/config/envVarKeys';
import {
    findFieldValue,
    writeToComponents,
} from '@/features/components/services/componentConfigWrites';
import { deriveGraphqlEndpoint } from '@/features/components/services/envVarHelpers';
import type { Project } from '@/types/base';
import { getMeshEndpointUrl, hasEntries } from '@/types/typeGuards';
import type { ComponentConfigs } from '@/types/webview';

/** MESH_ENDPOINT is read from the deployed mesh, never from componentConfigs. */
const MESH_ENDPOINT = 'MESH_ENDPOINT';

export interface UseConfigureFieldValuesProps {
    /** The project (supplies the deployed mesh endpoint and the seed configs). */
    project: Project;
    /** Values resolved by the extension, when it has them. */
    existingEnvValues?: Record<string, Record<string, string>>;
}

export interface UseConfigureFieldValuesReturn {
    /** Every section's values, keyed by component id. Save sends this whole map. */
    componentConfigs: ComponentConfigs;
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
    stageAppBuilderComponentValue: (componentId: string, varName: string, value: string) => void;
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
    const [touchedFields, setTouchedFields] = useState<Set<string>>(new Set());

    // Seed from whichever source has values. Re-opening Configure re-sends `init`
    // without remounting React, so this runs again and resets the configs.
    useEffect(() => {
        if (hasEntries(existingEnvValues)) {
            setComponentConfigs(existingEnvValues);
        } else if (project.componentConfigs) {
            setComponentConfigs(project.componentConfigs);
        }
    }, [existingEnvValues, project.componentConfigs]);

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
            // MESH_ENDPOINT comes from the keyed mesh entry (authoritative; the accessor
            // carries the legacy meshState fallback).
            const deployedMeshEndpoint = getMeshEndpointUrl(project);
            if (field.key === MESH_ENDPOINT && deployedMeshEndpoint) {
                return deployedMeshEndpoint;
            }

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
                return field.default;
            }

            return '';
        },
        [componentConfigs, getValueFromConfigs, project, touchedFields],
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

            setComponentConfigs((prev) => {
                const writes: Record<string, string | boolean> = { [field.key]: value };

                // Linked field: PAAS_URL → PAAS_GRAPHQL_ENDPOINT, unless the user has
                // already typed a GraphQL endpoint of their own.
                if (field.key === PAAS_URL && typeof value === 'string') {
                    if (!touchedFields.has(PAAS_GRAPHQL_ENDPOINT)) {
                        writes[PAAS_GRAPHQL_ENDPOINT] = deriveGraphqlEndpoint(value);
                    }
                }

                return writeToComponents(prev, field.componentIds, writes);
            });
        },
        [touchedFields],
    );

    // Stage an App Builder component's bucket-3 value under its own id. Text values flow
    // through save-configuration → .env unchanged. Secret values ride the SAME payload
    // transiently, but the backend (splitAppBuilderComponentSecrets) lifts them into
    // SecretStorage and strips them before anything reaches the .env/manifest.
    const stageAppBuilderComponentValue = useCallback(
        (componentId: string, varName: string, value: string) => {
            setComponentConfigs((prev) => ({
                ...prev,
                [componentId]: { ...(prev[componentId] ?? {}), [varName]: value },
            }));
        },
        [],
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

            setComponentConfigs((prev) =>
                writeToComponents(prev, field.componentIds, { [field.key]: normalized }),
            );
        },
        [componentConfigs],
    );

    return {
        componentConfigs,
        touchedFields,
        getFieldValue,
        getValueFromConfigs,
        isFieldComplete,
        updateField,
        normalizeUrlField,
        stageAppBuilderComponentValue,
    };
}
