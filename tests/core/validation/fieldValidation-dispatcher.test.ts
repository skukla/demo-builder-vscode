/**
 * Field Validation Tests - Dispatcher
 *
 * Tests for validateFieldUI dispatcher function.
 * Routes field validation requests to appropriate validators.
 *
 * Target Coverage: 90%+
 */

import { validateFieldUI } from '@/core/validation/fieldValidation';

describe('validateFieldUI', () => {
    describe('projectName field', () => {
        it('should route to validateProjectNameUI', () => {
            const result = validateFieldUI('projectName', 'valid-project');
            expect(result.isValid).toBe(true);
            expect(result.message).toBe('');
        });

        it('should return error for invalid project name', () => {
            const result = validateFieldUI('projectName', 'invalid project');
            expect(result.isValid).toBe(false);
            expect(result.message).toContain('can only contain');
        });

        it('should handle empty project name', () => {
            const result = validateFieldUI('projectName', '');
            expect(result.isValid).toBe(false);
            expect(result.message).toBe('Project name is required');
        });
    });

    describe('commerceUrl field', () => {
        it('should route to validateCommerceUrlUI', () => {
            const result = validateFieldUI('commerceUrl', 'https://example.com');
            expect(result.isValid).toBe(true);
            expect(result.message).toBe('');
        });

        it('should return error for invalid URL', () => {
            const result = validateFieldUI('commerceUrl', 'not-a-url');
            expect(result.isValid).toBe(false);
            expect(result.message).toBe('Invalid URL format. Must start with http:// or https://');
        });

        it('should accept empty commerce URL', () => {
            const result = validateFieldUI('commerceUrl', '');
            expect(result.isValid).toBe(true);
            expect(result.message).toBe('');
        });
    });

    describe('unknown fields', () => {
        it('should return valid for unknown field types', () => {
            const result = validateFieldUI('unknownField', 'any value');
            expect(result.isValid).toBe(true);
            expect(result.message).toBe('');
        });

        it('should not validate unknown fields', () => {
            const result = validateFieldUI('customField', '<script>alert(1)</script>');
            expect(result.isValid).toBe(true);
            expect(result.message).toBe('');
        });

        it('should handle empty string for unknown fields', () => {
            const result = validateFieldUI('otherField', '');
            expect(result.isValid).toBe(true);
            expect(result.message).toBe('');
        });
    });

    describe('case sensitivity', () => {
        it('should match field names case-sensitively', () => {
            // Capital P should not match
            const result = validateFieldUI('ProjectName', 'valid-project');
            expect(result.isValid).toBe(true); // Falls through to default
            expect(result.message).toBe('');
        });

        it('should not match camelCase variants', () => {
            const result = validateFieldUI('project_name', 'valid-project');
            expect(result.isValid).toBe(true); // Falls through to default
            expect(result.message).toBe('');
        });
    });

    describe('edge cases', () => {
        it('should handle null field name gracefully', () => {
            // Type assertion for testing edge case - validateFieldUI expects string
            const result = validateFieldUI(null as unknown as string, 'value');
            expect(result.isValid).toBe(true); // Falls through to default
            expect(result.message).toBe('');
        });

        it('should handle undefined field name gracefully', () => {
            // Type assertion for testing edge case - validateFieldUI expects string
            const result = validateFieldUI(undefined as unknown as string, 'value');
            expect(result.isValid).toBe(true); // Falls through to default
            expect(result.message).toBe('');
        });

        it('should handle empty field name', () => {
            const result = validateFieldUI('', 'value');
            expect(result.isValid).toBe(true); // Falls through to default
            expect(result.message).toBe('');
        });
    });

    describe('comprehensive validation', () => {
        it('should validate multiple fields independently', () => {
            const projectResult = validateFieldUI('projectName', 'my-project');
            const urlResult = validateFieldUI('commerceUrl', 'https://example.com');

            expect(projectResult.isValid).toBe(true);
            expect(urlResult.isValid).toBe(true);
        });

        it('should handle mixed valid/invalid fields', () => {
            const validProject = validateFieldUI('projectName', 'valid-project');
            const invalidProject = validateFieldUI('projectName', 'invalid project');
            const validUrl = validateFieldUI('commerceUrl', 'https://example.com');
            const invalidUrl = validateFieldUI('commerceUrl', 'not-url');

            expect(validProject.isValid).toBe(true);
            expect(invalidProject.isValid).toBe(false);
            expect(validUrl.isValid).toBe(true);
            expect(invalidUrl.isValid).toBe(false);
        });
    });
});
