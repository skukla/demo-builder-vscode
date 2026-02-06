/**
 * useServiceGroups Hook
 *
 * Extracts the service groups computation from ConfigureScreen.
 * Handles field deduplication and organization by service group.
 */

import { useMemo } from 'react';
import type { ComponentsData, UniqueField, ServiceGroup } from '../configureTypes';
import type { SelectedComponent } from './useSelectedComponents';
import { toServiceGroupWithSortedFields } from '@/features/components/services/serviceGroupTransforms';

interface ServiceGroupDefinition {
    id: string;
    label: string;
    order: number;
    fieldOrder?: string[];
}

/**
 * Service group definitions with field ordering
 */
const SERVICE_GROUP_DEFINITIONS: ServiceGroupDefinition[] = [
    {
        id: 'accs',
        label: 'Adobe Commerce Cloud Service',
        order: 0,
        fieldOrder: [
            'ACCS_GRAPHQL_ENDPOINT',
            'ACCS_WEBSITE_CODE',
            'ACCS_STORE_CODE',
            'ACCS_STORE_VIEW_CODE',
            'ACCS_CUSTOMER_GROUP',
        ],
    },
    {
        id: 'adobe-commerce',
        label: 'Adobe Commerce',
        order: 1,
        fieldOrder: [
            'ADOBE_COMMERCE_URL',
            'ADOBE_COMMERCE_GRAPHQL_ENDPOINT',
            'ADOBE_COMMERCE_WEBSITE_CODE',
            'ADOBE_COMMERCE_STORE_CODE',
            'ADOBE_COMMERCE_STORE_VIEW_CODE',
            'ADOBE_COMMERCE_CUSTOMER_GROUP',
            'ADOBE_COMMERCE_ADMIN_USERNAME',
            'ADOBE_COMMERCE_ADMIN_PASSWORD',
        ],
    },
    {
        id: 'catalog-service',
        label: 'Catalog Service',
        order: 2,
        fieldOrder: [
            'ADOBE_CATALOG_SERVICE_ENDPOINT',
            'ADOBE_COMMERCE_ENVIRONMENT_ID',
            'ADOBE_CATALOG_API_KEY',
        ],
    },
    { id: 'mesh', label: 'API Mesh', order: 3 },
    { id: 'adobe-assets', label: 'Adobe Assets', order: 4 },
    { id: 'integration-service', label: 'Kukla Integration Service', order: 5 },
    { id: 'experience-platform', label: 'Experience Platform', order: 6 },
    { id: 'other', label: 'Additional Settings', order: 99 },
];

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
