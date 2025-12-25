/**
 * Validation Helpers Tests
 *
 * Tests for getValidationState helper that eliminates nested ternary operators.
 * Follows TDD methodology - tests written BEFORE implementation.
 *
 * This helper converts error/verified boolean pairs to Spectrum TextField validationState.
 */

import { getValidationState } from '@/features/eds/ui/helpers/validationHelpers';

describe('validationHelpers', () => {
    describe('getValidationState', () => {
        it('should return "invalid" when error is truthy', () => {
            // Given: An error message exists (error is truthy)
            const error = 'Repository not found';
            const verified = false;

            // When: Getting the validation state
            const result = getValidationState(error, verified);

            // Then: Should return 'invalid'
            expect(result).toBe('invalid');
        });

        it('should return "invalid" when error is truthy even if verified is true', () => {
            // Given: Error exists AND verified is true (edge case - error takes precedence)
            const error = 'Some error occurred';
            const verified = true;

            // When: Getting the validation state
            const result = getValidationState(error, verified);

            // Then: Should return 'invalid' (error takes precedence)
            expect(result).toBe('invalid');
        });

        it('should return "valid" when error is falsy and verified is true', () => {
            // Given: No error and verification succeeded
            const error = undefined;
            const verified = true;

            // When: Getting the validation state
            const result = getValidationState(error, verified);

            // Then: Should return 'valid'
            expect(result).toBe('valid');
        });

        it('should return undefined when error is falsy and verified is false', () => {
            // Given: No error and not yet verified
            const error = undefined;
            const verified = false;

            // When: Getting the validation state
            const result = getValidationState(error, verified);

            // Then: Should return undefined (neutral state)
            expect(result).toBeUndefined();
        });

        it('should return undefined when error is falsy and verified is undefined', () => {
            // Given: No error and verification status unknown
            const error = undefined;
            const verified = undefined;

            // When: Getting the validation state
            const result = getValidationState(error, verified);

            // Then: Should return undefined (neutral state)
            expect(result).toBeUndefined();
        });

        it('should treat empty string error as falsy', () => {
            // Given: Error is empty string (falsy) and verified is true
            const error = '';
            const verified = true;

            // When: Getting the validation state
            const result = getValidationState(error, verified);

            // Then: Should return 'valid' (empty string is falsy)
            expect(result).toBe('valid');
        });

        it('should treat null error as falsy', () => {
            // Given: Error is null (falsy) and verified is true
            const error = null as unknown as string | undefined;
            const verified = true;

            // When: Getting the validation state
            const result = getValidationState(error, verified);

            // Then: Should return 'valid'
            expect(result).toBe('valid');
        });

        it('should return undefined when both error and verified are falsy', () => {
            // Given: Both error and verified are falsy (initial state)
            const error = '';
            const verified = false;

            // When: Getting the validation state
            const result = getValidationState(error, verified);

            // Then: Should return undefined
            expect(result).toBeUndefined();
        });
    });
});
