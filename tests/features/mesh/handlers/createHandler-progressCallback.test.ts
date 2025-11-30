/**
 * Tests for createProgressCallback Helper Function
 *
 * Tests progress callback creation for create and update operations.
 */

import { createProgressCallback } from '@/features/mesh/handlers/createHandlerHelpers';

describe('createProgressCallback', () => {
    describe('create operation', () => {
        it('should call onProgress with validating message when output contains "validating"', () => {
            // Given: Mock onProgress callback
            const onProgress = jest.fn();
            const callback = createProgressCallback('create', onProgress);

            // When: Callback receives data with "validating"
            callback('Validating mesh configuration...');

            // Then: onProgress called with create + validating message
            expect(onProgress).toHaveBeenCalledWith(
                'Creating API Mesh...',
                'Validating configuration'
            );
        });

        it('should call onProgress with creating message when output contains "creating"', () => {
            // Given: Mock onProgress callback
            const onProgress = jest.fn();
            const callback = createProgressCallback('create', onProgress);

            // When: Callback receives data with "creating"
            callback('Creating mesh instance...');

            // Then: onProgress called with create + creating message
            expect(onProgress).toHaveBeenCalledWith(
                'Creating API Mesh...',
                'Provisioning mesh infrastructure'
            );
        });

        it('should call onProgress with deploying message when output contains "deploying"', () => {
            // Given: Mock onProgress callback
            const onProgress = jest.fn();
            const callback = createProgressCallback('create', onProgress);

            // When: Callback receives data with "deploying"
            callback('Deploying mesh to Adobe infrastructure...');

            // Then: onProgress called with create + deploying message
            expect(onProgress).toHaveBeenCalledWith(
                'Creating API Mesh...',
                'Deploying mesh'
            );
        });

        it('should call onProgress with success message when output contains "success"', () => {
            // Given: Mock onProgress callback
            const onProgress = jest.fn();
            const callback = createProgressCallback('create', onProgress);

            // When: Callback receives data with "success"
            callback('Success! Mesh created');

            // Then: onProgress called with create + success message
            expect(onProgress).toHaveBeenCalledWith(
                'Creating API Mesh...',
                'Finalizing mesh setup'
            );
        });

        it('should accumulate output when outputAccumulator is provided', () => {
            // Given: Output accumulator and callback
            const outputAccumulator = { value: '' };
            const callback = createProgressCallback('create', undefined, outputAccumulator);

            // When: Callback receives multiple data chunks
            callback('First chunk\n');
            callback('Second chunk\n');
            callback('Third chunk');

            // Then: All chunks accumulated in outputAccumulator.value
            expect(outputAccumulator.value).toBe('First chunk\nSecond chunk\nThird chunk');
        });

        it('should handle case-insensitive matching', () => {
            // Given: Mock onProgress callback
            const onProgress = jest.fn();
            const callback = createProgressCallback('create', onProgress);

            // When: Callback receives UPPERCASE data
            callback('VALIDATING mesh configuration');

            // Then: onProgress called (case-insensitive match)
            expect(onProgress).toHaveBeenCalledWith(
                'Creating API Mesh...',
                'Validating configuration'
            );
        });

        it('should not throw when onProgress is undefined', () => {
            // Given: No onProgress callback
            const callback = createProgressCallback('create');

            // When/Then: Calling callback with data should not throw
            expect(() => callback('validating...')).not.toThrow();
        });
    });

    describe('update operation', () => {
        it('should call onProgress with validating message when output contains "validating"', () => {
            // Given: Mock onProgress callback for update
            const onProgress = jest.fn();
            const callback = createProgressCallback('update', onProgress);

            // When: Callback receives data with "validating"
            callback('Validating mesh configuration...');

            // Then: onProgress called with update + validating message
            expect(onProgress).toHaveBeenCalledWith(
                'Deploying API Mesh...',
                'Validating mesh configuration'
            );
        });

        it('should call onProgress with updating message when output contains "updating"', () => {
            // Given: Mock onProgress callback for update
            const onProgress = jest.fn();
            const callback = createProgressCallback('update', onProgress);

            // When: Callback receives data with "updating"
            callback('Updating mesh infrastructure...');

            // Then: onProgress called with update + updating message
            expect(onProgress).toHaveBeenCalledWith(
                'Deploying API Mesh...',
                'Updating mesh infrastructure'
            );
        });

        it('should call onProgress with deploying message when output contains "deploying"', () => {
            // Given: Mock onProgress callback for update
            const onProgress = jest.fn();
            const callback = createProgressCallback('update', onProgress);

            // When: Callback receives data with "deploying"
            callback('Deploying to Adobe infrastructure...');

            // Then: onProgress called with update + deploying message
            expect(onProgress).toHaveBeenCalledWith(
                'Deploying API Mesh...',
                'Deploying to Adobe infrastructure'
            );
        });

        it('should call onProgress with success message when output contains "success"', () => {
            // Given: Mock onProgress callback for update
            const onProgress = jest.fn();
            const callback = createProgressCallback('update', onProgress);

            // When: Callback receives data with "success"
            callback('Success! Mesh deployed');

            // Then: onProgress called with update + success message
            expect(onProgress).toHaveBeenCalledWith(
                'API Mesh Ready',
                'Mesh deployed successfully'
            );
        });

        it('should NOT accumulate output even when outputAccumulator is provided', () => {
            // Given: Output accumulator (should be ignored for update operation)
            const outputAccumulator = { value: '' };
            const callback = createProgressCallback('update', undefined, outputAccumulator);

            // When: Callback receives data
            callback('Update data chunk');

            // Then: outputAccumulator remains empty (update doesn't accumulate)
            expect(outputAccumulator.value).toBe('');
        });

        it('should handle case-insensitive matching', () => {
            // Given: Mock onProgress callback
            const onProgress = jest.fn();
            const callback = createProgressCallback('update', onProgress);

            // When: Callback receives UPPERCASE data
            callback('UPDATING infrastructure');

            // Then: onProgress called (case-insensitive match)
            expect(onProgress).toHaveBeenCalledWith(
                'Deploying API Mesh...',
                'Updating mesh infrastructure'
            );
        });

        it('should not throw when onProgress is undefined', () => {
            // Given: No onProgress callback
            const callback = createProgressCallback('update');

            // When/Then: Calling callback with data should not throw
            expect(() => callback('updating...')).not.toThrow();
        });
    });

    describe('edge cases', () => {
        it('should handle output with no matching keywords gracefully', () => {
            // Given: Mock onProgress callback
            const onProgress = jest.fn();
            const callback = createProgressCallback('create', onProgress);

            // When: Callback receives data without keywords
            callback('Some random output text');

            // Then: onProgress not called
            expect(onProgress).not.toHaveBeenCalled();
        });

        it('should handle empty string output', () => {
            // Given: Mock onProgress callback and accumulator
            const onProgress = jest.fn();
            const outputAccumulator = { value: 'initial' };
            const callback = createProgressCallback('create', onProgress, outputAccumulator);

            // When: Callback receives empty string
            callback('');

            // Then: onProgress not called, accumulator still works
            expect(onProgress).not.toHaveBeenCalled();
            expect(outputAccumulator.value).toBe('initial');
        });
    });
});
