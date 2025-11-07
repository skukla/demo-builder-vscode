/**
 * Unit tests for AuthenticationErrorFormatter
 * Tests error message formatting, user-friendly messages, and Adobe error translation
 */

import { AuthenticationErrorFormatter } from '@/features/authentication/services/authenticationErrorFormatter';

describe('AuthenticationErrorFormatter', () => {
    describe('formatError', () => {
        it('should format timeout errors', () => {
            const error = new Error('Operation timed out');
            const context = { operation: 'Login', timeout: 5000 };

            const result = AuthenticationErrorFormatter.formatError(error, context);

            expect(result.title).toBe('Operation Timed Out');
            expect(result.message).toBe('Login timed out after 5000ms. Please try again.');
            expect(result.technical).toContain('Operation: Login');
            expect(result.technical).toContain('Error: Operation timed out');
        });

        it('should format timeout errors with "timeout" keyword', () => {
            const error = new Error('The request timeout after waiting');
            const context = { operation: 'GetOrganizations', timeout: 3000 };

            const result = AuthenticationErrorFormatter.formatError(error, context);

            expect(result.title).toBe('Operation Timed Out');
            expect(result.message).toBe('GetOrganizations timed out after 3000ms. Please try again.');
        });

        it('should format network errors', () => {
            const error = new Error('Network error occurred');
            const context = { operation: 'FetchProjects' };

            const result = AuthenticationErrorFormatter.formatError(error, context);

            expect(result.title).toBe('Network Error');
            expect(result.message).toBe('No internet connection. Please check your network and try again.');
        });

        it('should format ENOTFOUND errors as network errors', () => {
            const error = new Error('ENOTFOUND api.adobe.io');
            const context = { operation: 'API Call' };

            const result = AuthenticationErrorFormatter.formatError(error, context);

            expect(result.title).toBe('Network Error');
            expect(result.message).toBe('No internet connection. Please check your network and try again.');
        });

        it('should format authentication errors', () => {
            const error = new Error('Unauthorized access');
            const context = { operation: 'GetUserData' };

            const result = AuthenticationErrorFormatter.formatError(error, context);

            expect(result.title).toBe('Authentication Failed');
            expect(result.message).toBe('Authentication failed. Please try logging in again.');
        });

        it('should format errors with "auth" keyword', () => {
            const error = new Error('auth token expired');
            const context = { operation: 'ValidateToken' };

            const result = AuthenticationErrorFormatter.formatError(error, context);

            expect(result.title).toBe('Authentication Failed');
            expect(result.message).toBe('Authentication failed. Please try logging in again.');
        });

        it('should format generic errors', () => {
            const error = new Error('Something went wrong');
            const context = { operation: 'DoSomething' };

            const result = AuthenticationErrorFormatter.formatError(error, context);

            expect(result.title).toBe('Authentication Error');
            expect(result.message).toBe('Something went wrong');
        });

        it('should include stack trace in technical details', () => {
            const error = new Error('Test error');
            error.stack = 'Error: Test error\n  at test.ts:10:5';
            const context = { operation: 'Test' };

            const result = AuthenticationErrorFormatter.formatError(error, context);

            expect(result.technical).toContain('Stack: Error: Test error');
        });

        it('should handle errors without stack trace', () => {
            const error = new Error('Test error');
            delete error.stack;
            const context = { operation: 'Test' };

            const result = AuthenticationErrorFormatter.formatError(error, context);

            expect(result.technical).toContain('Stack: N/A');
        });

        it('should handle string errors', () => {
            const error = 'Simple error string';
            const context = { operation: 'Test' };

            const result = AuthenticationErrorFormatter.formatError(error, context);

            expect(result.message).toBe('Simple error string');
            expect(result.technical).toContain('Error: Simple error string');
        });

        it('should handle objects without message property', () => {
            const error = { code: 'ERR_001', details: 'Error details' };
            const context = { operation: 'Test' };

            const result = AuthenticationErrorFormatter.formatError(error, context);

            expect(result.message).toContain('[object Object]');
        });

        it('should be case-insensitive for error detection', () => {
            const errors = [
                { error: 'TIMEOUT ERROR', expectedTitle: 'Operation Timed Out' },
                { error: 'Network failure', expectedTitle: 'Network Error' },
                { error: 'AUTH FAILED', expectedTitle: 'Authentication Failed' },
            ];

            errors.forEach(({ error, expectedTitle }) => {
                const result = AuthenticationErrorFormatter.formatError(
                    new Error(error),
                    { operation: 'Test' },
                );
                expect(result.title).toBe(expectedTitle);
            });
        });

        it('should include operation name in technical details', () => {
            const error = new Error('Test error');
            const context = { operation: 'SelectWorkspace' };

            const result = AuthenticationErrorFormatter.formatError(error, context);

            expect(result.technical).toContain('Operation: SelectWorkspace');
        });

        it('should handle errors with multiple matching patterns', () => {
            // "timeout" should take priority over generic
            const error = new Error('network timeout');
            const context = { operation: 'Test', timeout: 5000 };

            const result = AuthenticationErrorFormatter.formatError(error, context);

            expect(result.title).toBe('Operation Timed Out');
        });

        it('should format errors without timeout context', () => {
            const error = new Error('timeout occurred');
            const context = { operation: 'Test' };

            const result = AuthenticationErrorFormatter.formatError(error, context);

            expect(result.title).toBe('Operation Timed Out');
            expect(result.message).toContain('timed out after undefinedms');
        });

        it('should handle empty error messages', () => {
            const error = new Error('');
            const context = { operation: 'Test' };

            const result = AuthenticationErrorFormatter.formatError(error, context);

            // Empty error message becomes 'Error' after toError conversion
            expect(result.message).toBe('Error');
            expect(result.technical).toContain('Error: Error');
        });

        it('should handle null and undefined errors', () => {
            const contexts = [
                { error: null, expected: 'null' },
                { error: undefined, expected: 'undefined' },
            ];

            contexts.forEach(({ error, expected }) => {
                const result = AuthenticationErrorFormatter.formatError(
                    error as any,
                    { operation: 'Test' },
                );
                expect(result.message).toBe(expected);
            });
        });
    });
});
