/**
 * useFieldValidation Hook
 *
 * Extracts the field validation logic from ConfigureScreen.
 * Handles validation of all fields based on their types and requirements.
 */

import { useEffect, Dispatch, SetStateAction } from 'react';
import { ComponentConfigs } from '@/types/webview';
import type { ServiceGroup } from '../configureTypes';

interface UseFieldValidationProps {
    serviceGroups: ServiceGroup[];
    componentConfigs: ComponentConfigs;
    setValidationErrors: Dispatch<SetStateAction<Record<string, string>>>;
}

/**
 * Hook to validate all fields and update validation errors
 */
export function useFieldValidation({
    serviceGroups,
    componentConfigs,
    setValidationErrors,
}: UseFieldValidationProps): void {
    useEffect(() => {
        const errors: Record<string, string> = {};

        serviceGroups.forEach(group => {
            group.fields.forEach(field => {
                const isDeferredField = field.key === 'MESH_ENDPOINT';

                // Required field validation
                if (field.required && !isDeferredField) {
                    const hasValue = field.componentIds.some(compId =>
                        componentConfigs[compId]?.[field.key]
                    );

                    if (!hasValue) {
                        errors[field.key] = `${field.label} is required`;
                    }
                }

                // URL validation
                if (field.type === 'url') {
                    const firstComponentWithValue = field.componentIds.find(compId =>
                        componentConfigs[compId]?.[field.key]
                    );

                    if (firstComponentWithValue) {
                        const value = componentConfigs[firstComponentWithValue][field.key] as string;
                        try {
                            new URL(value);
                        } catch {
                            errors[field.key] = 'Please enter a valid URL';
                        }
                    }
                }

                // Pattern validation
                if (field.validation?.pattern) {
                    const firstComponentWithValue = field.componentIds.find(compId =>
                        componentConfigs[compId]?.[field.key]
                    );

                    if (firstComponentWithValue) {
                        const value = componentConfigs[firstComponentWithValue][field.key] as string;
                        const pattern = new RegExp(field.validation.pattern);
                        if (!pattern.test(value)) {
                            errors[field.key] = field.validation.message || 'Invalid format';
                        }
                    }
                }
            });
        });

        setValidationErrors(errors);
    }, [componentConfigs, serviceGroups, setValidationErrors]);
}
