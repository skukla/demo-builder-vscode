/**
 * useConfigValidation Hook
 *
 * Validates component configuration fields using composable validators
 * from @/core/validation for URL and pattern validation.
 */
import { useMemo } from 'react';
import { ServiceGroup } from '../ComponentConfigStep';
import { ComponentConfigs } from '@/types/webview';
import { url, pattern } from '@/core/validation/Validator';

interface ConfigValidationResult {
    isValid: boolean;
    errors: Record<string, string>;
}

// Create validators with consistent error messages
const urlValidator = url('Please enter a valid URL');

export function useConfigValidation(
    serviceGroups: ServiceGroup[],
    componentConfigs: ComponentConfigs,
): ConfigValidationResult {
    return useMemo(() => {
        let allValid = true;
        const errors: Record<string, string> = {};

        for (const group of serviceGroups) {
            for (const field of group.fields) {
                // Skip deferred fields (auto-filled later)
                if (field.key === 'MESH_ENDPOINT') {
                    continue;
                }

                // Required field validation
                if (field.required) {
                    const hasValue = field.componentIds.some(compId =>
                        componentConfigs[compId]?.[field.key],
                    );

                    if (!hasValue) {
                        allValid = false;
                        errors[field.key] = `${field.label} is required`;
                        continue; // Skip further validation if required field is empty
                    }
                }

                // Get first component with a value for type validation
                const firstComponentWithValue = field.componentIds.find(compId =>
                    componentConfigs[compId]?.[field.key],
                );

                if (!firstComponentWithValue) {
                    continue; // No value to validate
                }

                const value = componentConfigs[firstComponentWithValue][field.key] as string;

                // URL validation using core validator
                if (field.type === 'url') {
                    const result = urlValidator(value);
                    if (!result.valid && result.error) {
                        allValid = false;
                        errors[field.key] = result.error;
                    }
                }

                // Custom pattern validation using core validator
                if (field.validation?.pattern) {
                    const patternValidator = pattern(
                        new RegExp(field.validation.pattern),
                        field.validation.message || 'Invalid format'
                    );
                    const result = patternValidator(value);
                    if (!result.valid && result.error) {
                        allValid = false;
                        errors[field.key] = result.error;
                    }
                }
            }
        }

        return { isValid: allValid, errors };
    }, [serviceGroups, componentConfigs]);
}
