/**
 * AEM content-source field validation (Slice 2, Step 07).
 *
 * Wizard-side validation for the joiner's AEM Sites content source: the author
 * URL must be https, the content path is required and URL-path-safe. Mirrors
 * the constructor rules of `AemContentSource` (the backend seam) so invalid
 * values are caught before Continue, not at registration time.
 */

import {
    isAemContentSourceValid,
    validateAemAuthorUrlUI,
    validateAemContentPathUI,
} from '@/features/eds/ui/helpers/aemContentSourceValidation';

describe('validateAemAuthorUrlUI', () => {
    it('accepts an https AEM-as-Cloud-Service author URL', () => {
        const result = validateAemAuthorUrlUI('https://author-p57319-e1619941.adobeaemcloud.com');
        expect(result.isValid).toBe(true);
        expect(result.message).toBe('');
    });

    it('rejects an empty author URL as required', () => {
        const result = validateAemAuthorUrlUI('');
        expect(result.isValid).toBe(false);
        expect(result.message.toLowerCase()).toContain('required');
    });

    it('rejects a non-https URL (mirrors AemContentSource https rule)', () => {
        const result = validateAemAuthorUrlUI('http://author.example.com');
        expect(result.isValid).toBe(false);
        expect(result.message).toContain('https');
    });

    it('rejects a malformed URL', () => {
        expect(validateAemAuthorUrlUI('not a url').isValid).toBe(false);
    });
});

describe('validateAemContentPathUI', () => {
    it('accepts an authored content tree root', () => {
        const result = validateAemContentPathUI('/content/citisignal');
        expect(result.isValid).toBe(true);
        expect(result.message).toBe('');
    });

    it('accepts a path without a leading slash (normalized by the backend seam)', () => {
        expect(validateAemContentPathUI('content/citisignal').isValid).toBe(true);
    });

    it('rejects an empty content path as required', () => {
        const result = validateAemContentPathUI('');
        expect(result.isValid).toBe(false);
        expect(result.message.toLowerCase()).toContain('required');
    });

    it('rejects whitespace in the path (mirrors AemContentSource path-safety rule)', () => {
        expect(validateAemContentPathUI('/content/citi signal').isValid).toBe(false);
    });
});

describe('isAemContentSourceValid', () => {
    it('is true only when both fields validate', () => {
        expect(isAemContentSourceValid({
            authorUrl: 'https://author-p57319-e1619941.adobeaemcloud.com',
            contentPath: '/content/citisignal',
        })).toBe(true);
    });

    it('is false for a missing source or a failing field', () => {
        expect(isAemContentSourceValid(undefined)).toBe(false);
        expect(isAemContentSourceValid({ authorUrl: '', contentPath: '/content/citisignal' })).toBe(false);
        expect(isAemContentSourceValid({ authorUrl: 'http://x.com', contentPath: '/content/citisignal' })).toBe(false);
        expect(isAemContentSourceValid({ authorUrl: 'https://x.com', contentPath: '' })).toBe(false);
    });
});
