/**
 * AEM content-source field validation (Slice 2, Step 07)
 *
 * Wizard-side validation for the joiner's declared AEM Sites content source.
 * Mirrors the constructor rules of `AemContentSource` (https-only author URL,
 * required URL-path-safe content path) so invalid values are caught before
 * Continue rather than at registration time.
 *
 * @module features/eds/ui/helpers/aemContentSourceValidation
 */

import type { FieldValidation } from '@/core/validation/fieldValidation';

/**
 * Validate the AEM author URL: required, https-only, well-formed.
 */
export function validateAemAuthorUrlUI(value: string): FieldValidation {
    if (!value || value.trim() === '') {
        return { isValid: false, message: 'AEM author URL is required' };
    }
    let parsed: URL;
    try {
        parsed = new URL(value);
    } catch {
        return { isValid: false, message: 'Invalid URL format. Must be an https URL' };
    }
    if (parsed.protocol !== 'https:') {
        return { isValid: false, message: 'AEM author URL must use https' };
    }
    return { isValid: true, message: '' };
}

/**
 * Validate the authored content tree root: required, no whitespace/control
 * characters (same path-safety rule the backend seam enforces). A missing
 * leading slash is fine — `AemContentSource` normalizes it.
 */
export function validateAemContentPathUI(value: string): FieldValidation {
    if (!value || value.trim() === '') {
        return { isValid: false, message: 'Content path is required (e.g., /content/<site>)' };
    }
    if (/[\n\r\t\f\v ]/.test(value)) {
        return { isValid: false, message: 'Content path cannot contain spaces or control characters' };
    }
    return { isValid: true, message: '' };
}

/**
 * Whole-source validity — the Continue gate for an AEM-Sites selection.
 */
export function isAemContentSourceValid(
    source: { authorUrl?: string; contentPath?: string } | undefined,
): boolean {
    if (!source) return false;
    return validateAemAuthorUrlUI(source.authorUrl ?? '').isValid
        && validateAemContentPathUI(source.contentPath ?? '').isValid;
}
