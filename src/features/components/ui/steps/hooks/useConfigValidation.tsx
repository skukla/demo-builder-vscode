import { useMemo } from 'react';
import { ServiceGroup } from '../ComponentConfigStep';
import { ComponentConfigs } from '@/types/webview';

interface ValidationResult {
    isValid: boolean;
    errors: Record<string, string>;
}

export function useConfigValidation(
    serviceGroups: ServiceGroup[],
    componentConfigs: ComponentConfigs,
): ValidationResult {
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

                // URL validation
                if (field.type === 'url') {
                    try {
                        new URL(value);
                    } catch {
                        allValid = false;
                        errors[field.key] = 'Please enter a valid URL';
                    }
                }

                // Custom pattern validation
                if (field.validation?.pattern) {
                    const pattern = new RegExp(field.validation.pattern);
                    if (!pattern.test(value)) {
                        allValid = false;
                        errors[field.key] = field.validation.message || 'Invalid format';
                    }
                }
            }
        }

        return { isValid: allValid, errors };
    }, [serviceGroups, componentConfigs]);
}
