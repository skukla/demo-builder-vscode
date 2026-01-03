/**
 * useFieldValidation Hook
 *
 * Extracts the field validation logic from ConfigureScreen.
 * Handles validation of all fields based on their types and requirements.
 * Uses composable validators from @/core/validation for URL and pattern validation.
 */

import { useEffect, Dispatch, SetStateAction } from 'react';
import type { ServiceGroup } from '../configureTypes';
import { url, pattern } from '@/core/validation/Validator';
import { ComponentConfigs } from '@/types/webview';

interface UseFieldValidationProps {
    serviceGroups: ServiceGroup[];
    componentConfigs: ComponentConfigs;
    setValidationErrors: Dispatch<SetStateAction<Record<string, string>>>;
}

// Create validators with consistent error messages
const urlValidator = url('Please enter a valid URL');

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
                        componentConfigs[compId]?.[field.key],
                    );

                    if (!hasValue) {
                        errors[field.key] = `${field.label} is required`;
                    }
                }

                // URL validation using core validator
                if (field.type === 'url') {
                    const firstComponentWithValue = field.componentIds.find(compId =>
                        componentConfigs[compId]?.[field.key],
                    );

                    if (firstComponentWithValue) {
                        const value = componentConfigs[firstComponentWithValue][field.key] as string;
                        const result = urlValidator(value);
                        if (!result.valid && result.error) {
                            errors[field.key] = result.error;
                        }
                    }
                }

                // Pattern validation using core validator
                if (field.validation?.pattern) {
                    const firstComponentWithValue = field.componentIds.find(compId =>
                        componentConfigs[compId]?.[field.key],
                    );

                    if (firstComponentWithValue) {
                        const value = componentConfigs[firstComponentWithValue][field.key] as string;
                        const patternValidator = pattern(
                            new RegExp(field.validation.pattern),
                            field.validation.message || 'Invalid format',
                        );
                        const result = patternValidator(value);
                        if (!result.valid && result.error) {
                            errors[field.key] = result.error;
                        }
                    }
                }
            });
        });

        setValidationErrors(errors);
    }, [componentConfigs, serviceGroups, setValidationErrors]);
}
