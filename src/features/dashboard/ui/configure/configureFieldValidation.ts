/**
 * Configure Field Validation
 *
 * The GLOBAL validation pass for the Configure screen: it walks every service group,
 * not the one currently on screen. That is load-bearing now that the rail renders one
 * section at a time — an error the user cannot see must still disable Save, and
 * `buildConfigureSections` turns these keys into the marker on the offending rail tab.
 *
 * Pure: takes a value accessor rather than the configs, so it validates exactly the
 * value the field DISPLAYS (shared env vars resolve across components, defaults count
 * as present) instead of re-deriving a second, subtly different lookup.
 *
 * This logic was previously extracted as `useFieldValidation`, which forked and drifted —
 * it lost the default handling and the shared-component lookup, and nothing imported it.
 * That hook was retired rather than revived; this module replaces it.
 *
 * @module features/dashboard/ui/configure/configureFieldValidation
 */

import type { ServiceGroup, UniqueField } from './configureTypes';
import { url, pattern } from '@/core/validation/Validator';

const urlValidator = url('Please enter a valid URL');

/** The resolved value of a field, as the form displays it. */
export type FieldValueLookup = (field: UniqueField) => string | number | boolean | undefined;

/**
 * Whether a field is a secret the project already holds in the keychain. Such a field
 * reads empty (the screen never sees the value) and is satisfied: the field row shows
 * "Saved — type to replace" and no error, so validation must not count it missing.
 */
export type StoredSecretCheck = (field: UniqueField) => boolean;

/**
 * Validate one field, returning its error message or undefined.
 *
 * @param field - The field to validate
 * @param getValue - Resolves the field's current value
 * @param isStoredSecret - Whether the field is a secret the project already holds
 * @returns The error message, or undefined when the field is fine
 */
function validateField(
    field: UniqueField,
    getValue: FieldValueLookup,
    isStoredSecret: StoredSecretCheck,
): string | undefined {
    const value = getValue(field);
    const hasValue = value !== undefined && value !== '';
    const hasDefault = field.default !== undefined && field.default !== '';

    // A required stored secret counted as missing used to disable Save while its
    // field showed no error at all (PL-76).
    if (field.required && !hasValue && !hasDefault && !isStoredSecret(field)) {
        return `${field.label} is required`;
    }

    // Format checks only apply to a real, typed-in value — never to a default.
    if (!hasValue || typeof value !== 'string') return undefined;

    if (field.type === 'url') {
        const result = urlValidator(value);
        if (!result.valid && result.error) return result.error;
    }

    if (field.validation?.pattern) {
        const patternValidator = pattern(
            new RegExp(field.validation.pattern),
            field.validation.message || 'Invalid format',
        );
        const result = patternValidator(value);
        if (!result.valid && result.error) return result.error;
    }

    return undefined;
}

/**
 * Validate every field in every service group.
 *
 * @param serviceGroups - All service groups, whether or not they are on screen
 * @param getValue - Resolves a field's current value (the same lookup the form displays)
 * @param isStoredSecret - Whether a field is a secret the project already holds
 * @returns Errors keyed by field key; empty when everything is valid
 */
export function validateServiceGroups(
    serviceGroups: ServiceGroup[],
    getValue: FieldValueLookup,
    isStoredSecret: StoredSecretCheck,
): Record<string, string> {
    const errors: Record<string, string> = {};

    for (const group of serviceGroups) {
        for (const field of group.fields) {
            const error = validateField(field, getValue, isStoredSecret);
            if (error !== undefined) errors[field.key] = error;
        }
    }

    return errors;
}
