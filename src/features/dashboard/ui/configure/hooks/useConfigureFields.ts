/**
 * useConfigureFields Hook
 *
 * Extracts the field value management logic from ConfigureScreen.
 * Handles getting, setting, and checking field values.
 */

import { useCallback, Dispatch, SetStateAction } from 'react';
import type { UniqueField } from '../configureTypes';
import type { Project } from '@/types/base';
import { ComponentConfigs } from '@/types/webview';

interface UseConfigureFieldsProps {
    componentConfigs: ComponentConfigs;
    setComponentConfigs: Dispatch<SetStateAction<ComponentConfigs>>;
    setTouchedFields: Dispatch<SetStateAction<Set<string>>>;
    project: Project;
}

interface UseConfigureFieldsReturn {
    updateField: (field: UniqueField, value: string | boolean) => void;
    getFieldValue: (field: UniqueField) => string | boolean | undefined;
    isFieldComplete: (field: UniqueField) => boolean;
}

/**
 * Hook to manage field values in the configure screen
 */
export function useConfigureFields({
    componentConfigs,
    setComponentConfigs,
    setTouchedFields,
    project,
}: UseConfigureFieldsProps): UseConfigureFieldsReturn {
    const updateField = useCallback((field: UniqueField, value: string | boolean) => {
        setTouchedFields(prev => new Set(prev).add(field.key));

        setComponentConfigs(prev => {
            const newConfigs = { ...prev };

            field.componentIds.forEach(componentId => {
                if (!newConfigs[componentId]) {
                    newConfigs[componentId] = {};
                }
                newConfigs[componentId][field.key] = value;
            });

            return newConfigs;
        });
    }, [setComponentConfigs, setTouchedFields]);

    const getFieldValue = useCallback((field: UniqueField): string | boolean | undefined => {
        // Special handling for MESH_ENDPOINT - read from meshState (authoritative)
        // with fallback to componentInstance for backward compatibility
        if (field.key === 'MESH_ENDPOINT') {
            // Primary: meshState.endpoint (authoritative location)
            if (project.meshState?.endpoint) {
                return project.meshState.endpoint;
            }
            // Fallback: componentInstances (legacy, for old projects)
            const meshComponent = project.componentInstances?.['commerce-mesh'];
            if (meshComponent?.endpoint) {
                return meshComponent.endpoint;
            }
        }

        // Check component configs for value
        for (const componentId of field.componentIds) {
            const value = componentConfigs[componentId]?.[field.key];
            if (value !== undefined && value !== '') {
                return typeof value === 'number' ? String(value) : value;
            }
        }

        // Check other components that might have the value
        for (const [componentId, config] of Object.entries(componentConfigs)) {
            if (!field.componentIds.includes(componentId)) {
                const value = config[field.key];
                if (value !== undefined && value !== '') {
                    return typeof value === 'number' ? String(value) : value;
                }
            }
        }

        // Return default value if available
        if (field.default !== undefined && field.default !== '') {
            return field.default;
        }

        return '';
    }, [componentConfigs, project]);

    const isFieldComplete = useCallback((field: UniqueField): boolean => {
        const value = getFieldValue(field);
        return value !== undefined && value !== '';
    }, [getFieldValue]);

    return {
        updateField,
        getFieldValue,
        isFieldComplete,
    };
}
