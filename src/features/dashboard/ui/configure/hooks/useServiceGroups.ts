/**
 * useServiceGroups Hook
 *
 * Extracts the service groups computation from ConfigureScreen.
 * Handles field deduplication and organization by service group.
 */

import { useMemo } from 'react';
import type { ComponentsData, UniqueField, ServiceGroup } from '../configureTypes';
import type { SelectedComponent } from './useSelectedComponents';
import { toServiceGroupWithSortedFields, SERVICE_GROUP_DEFINITIONS } from '@/features/components/services/serviceGroupTransforms';

interface UseServiceGroupsProps {
    selectedComponents: SelectedComponent[];
    componentsData: ComponentsData;
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
            data.configuration?.requiredEnvVars?.forEach(envVarKey => {
                const envVarDef = envVarDefs[envVarKey];
                if (envVarDef) {
                    if (!fieldMap.has(envVarKey)) {
                        fieldMap.set(envVarKey, {
                            ...envVarDef,
                            key: envVarKey,
                            componentIds: [id],
                        });
                    } else {
                        const existing = fieldMap.get(envVarKey)!;
                        if (!existing.componentIds.includes(id)) {
                            existing.componentIds.push(id);
                        }
                    }
                }
            });

            data.configuration?.optionalEnvVars?.forEach(envVarKey => {
                const envVarDef = envVarDefs[envVarKey];
                if (envVarDef) {
                    if (!fieldMap.has(envVarKey)) {
                        fieldMap.set(envVarKey, {
                            ...envVarDef,
                            key: envVarKey,
                            componentIds: [id],
                        });
                    } else {
                        const existing = fieldMap.get(envVarKey)!;
                        if (!existing.componentIds.includes(id)) {
                            existing.componentIds.push(id);
                        }
                    }
                }
            });
        });

        const groups: Record<string, UniqueField[]> = {};

        fieldMap.forEach((field) => {
            const metadata = field as UniqueField & { group?: string };
            const groupKey = metadata.group || 'other';

            if (!groups[groupKey]) {
                groups[groupKey] = [];
            }
            groups[groupKey].push(field);
        });

        const orderedGroups = SERVICE_GROUP_DEFINITIONS
            .map(def => toServiceGroupWithSortedFields(def, groups))
            .filter(group => group.fields.length > 0)
            .sort((a, b) => {
                const aOrder = SERVICE_GROUP_DEFINITIONS.find(d => d.id === a.id)?.order ?? 99;
                const bOrder = SERVICE_GROUP_DEFINITIONS.find(d => d.id === b.id)?.order ?? 99;
                return aOrder - bOrder;
            });

        return orderedGroups;
    }, [selectedComponents, componentsData.envVars]);
}
