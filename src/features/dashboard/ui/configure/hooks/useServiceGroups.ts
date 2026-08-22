/**
 * useServiceGroups Hook
 *
 * Extracts the service groups computation from ConfigureScreen.
 * Handles field deduplication and organization by service group.
 */

import { useMemo } from 'react';
import type { ComponentsData, UniqueField, ServiceGroup } from '../configureTypes';
import type { SelectedComponent } from './useSelectedComponents';
import {
    toServiceGroupWithSortedFields,
    SERVICE_GROUP_DEFINITIONS,
} from '@/features/components/services/serviceGroupTransforms';
import type { EnvVarDefinition } from '@/types/components';

interface UseServiceGroupsProps {
    selectedComponents: SelectedComponent[];
    componentsData: ComponentsData;
}

/**
 * Record one component's declared env vars into the shared field map.
 *
 * A field declared by several components is stored ONCE and accumulates their ids, which
 * is what lets an edit fan out to every component that needs the value. Required and
 * optional vars are collected identically — the `required` flag rides on the env-var
 * definition itself, so there is nothing for the caller to differentiate here.
 *
 * @param fieldMap - Accumulator, keyed by env-var name
 * @param envVarKeys - The env-var names this component declares
 * @param envVarDefs - All known env-var definitions
 * @param componentId - The component declaring them
 */
function collectFields(
    fieldMap: Map<string, UniqueField>,
    envVarKeys: string[] | undefined,
    envVarDefs: Record<string, EnvVarDefinition>,
    componentId: string,
): void {
    for (const envVarKey of envVarKeys ?? []) {
        const envVarDef = envVarDefs[envVarKey];
        if (!envVarDef) continue;

        const existing = fieldMap.get(envVarKey);
        if (!existing) {
            fieldMap.set(envVarKey, { ...envVarDef, key: envVarKey, componentIds: [componentId] });
        } else if (!existing.componentIds.includes(componentId)) {
            existing.componentIds.push(componentId);
        }
    }
}

/**
 * Hook to compute service groups from selected components
 */
export function useServiceGroups({
    selectedComponents,
    componentsData,
}: UseServiceGroupsProps): ServiceGroup[] {
    return useMemo(() => {
        const fieldMap = new Map<string, UniqueField>();
        const envVarDefs = componentsData.envVars || {};

        selectedComponents.forEach(({ id, data }) => {
            collectFields(fieldMap, data.configuration?.requiredEnvVars, envVarDefs, id);
            collectFields(fieldMap, data.configuration?.optionalEnvVars, envVarDefs, id);
        });

        // MESH_ENDPOINT never renders. It is optional, auto-populated from the
        // keyed mesh entry by the deploy, and display-locked to that value — so a
        // mesh project got a whole rail tab holding one control nobody can use,
        // and a non-mesh project got the same tab holding an empty row.
        //
        // The mesh's real controls are the Integrations grid, where it is the
        // first peer card (`deriveMeshCard`). The wizard has always filtered this
        // field out entirely (`useComponentConfig`); Configure now agrees.
        //
        // The `mesh` group stays in SERVICE_GROUP_DEFINITIONS — it simply never
        // populates, and the empty-group filter below drops the tab.
        fieldMap.delete('MESH_ENDPOINT');

        // A DERIVED var is computed by the generator, never typed. Rendering one
        // invites a value that `envFileGenerator` will overwrite — and in the
        // Catalog tab it did worse: `ADOBE_CATALOG_SERVICE_ENDPOINT` is optional
        // and blank and sorted ABOVE the required field it derives from, so the
        // field a user reached for first was the computed one.
        //
        // Same treatment the App Builder field model already gives its derivedFrom
        // bucket (appBuilderComponentFieldModel.ts) — dropped, not rendered.
        for (const [key, field] of fieldMap) {
            if (field.derivedFrom?.length) {
                fieldMap.delete(key);
            }
        }

        const groups: Record<string, UniqueField[]> = {};

        fieldMap.forEach((field) => {
            const metadata = field as UniqueField & { group?: string };
            const groupKey = metadata.group || 'other';

            if (!groups[groupKey]) {
                groups[groupKey] = [];
            }
            groups[groupKey].push(field);
        });

        const orderedGroups = SERVICE_GROUP_DEFINITIONS.map((def) =>
            toServiceGroupWithSortedFields(def, groups),
        )
            .filter((group) => group.fields.length > 0)
            .sort((a, b) => {
                const aOrder = SERVICE_GROUP_DEFINITIONS.find((d) => d.id === a.id)?.order ?? 99;
                const bOrder = SERVICE_GROUP_DEFINITIONS.find((d) => d.id === b.id)?.order ?? 99;
                return aOrder - bOrder;
            });

        return orderedGroups;
    }, [selectedComponents, componentsData.envVars]);
}
