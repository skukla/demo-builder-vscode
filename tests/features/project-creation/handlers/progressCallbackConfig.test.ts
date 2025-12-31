/**
 * progressCallbackConfig Tests
 *
 * Tests for the needsProgressCallback utility that identifies handlers
 * requiring progress callback support during long-running operations.
 *
 * Part of Step 3: Handler Registry Simplification
 */

import { needsProgressCallback } from '@/features/project-creation/handlers/progressCallbackConfig';

describe('needsProgressCallback', () => {
    describe('returns true for progress-enabled handlers', () => {
        it('should return true for create-api-mesh', () => {
            // Given: needsProgressCallback utility function
            // When: Called with 'create-api-mesh'
            const result = needsProgressCallback('create-api-mesh');

            // Then: Returns true
            expect(result).toBe(true);
        });
    });

    describe('returns false for standard handlers', () => {
        it('should return false for check-auth', () => {
            // Given: needsProgressCallback utility function
            // When: Called with 'check-auth'
            const result = needsProgressCallback('check-auth');

            // Then: Returns false
            expect(result).toBe(false);
        });

        it('should return false for validate', () => {
            // Given: needsProgressCallback utility function
            // When: Called with 'validate'
            const result = needsProgressCallback('validate');

            // Then: Returns false
            expect(result).toBe(false);
        });

        it('should return false for ready', () => {
            // Given: needsProgressCallback utility function
            // When: Called with 'ready'
            const result = needsProgressCallback('ready');

            // Then: Returns false
            expect(result).toBe(false);
        });

        it('should return false for check-api-mesh', () => {
            // Given: needsProgressCallback utility function
            // When: Called with 'check-api-mesh' (checking, not creating)
            const result = needsProgressCallback('check-api-mesh');

            // Then: Returns false
            expect(result).toBe(false);
        });

        it('should return false for delete-api-mesh', () => {
            // Given: needsProgressCallback utility function
            // When: Called with 'delete-api-mesh'
            const result = needsProgressCallback('delete-api-mesh');

            // Then: Returns false
            expect(result).toBe(false);
        });

        it('should return false for unknown message types', () => {
            // Given: needsProgressCallback utility function
            // When: Called with an unknown type
            const result = needsProgressCallback('unknown-type');

            // Then: Returns false
            expect(result).toBe(false);
        });
    });
});
