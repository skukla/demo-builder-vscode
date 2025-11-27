/**
 * Unit tests for AuthenticationErrorFormatter
 * Tests error message formatting, user-friendly messages, and Adobe error translation
 *
 * Updated for new typed error system (Phase C of error handling consolidation):
 * - Uses ErrorCode enum for categorization instead of string matching
 * - Returns structured error with `code` field
 * - Uses consistent user-friendly messages from getErrorTitle()
 */

import { AuthenticationErrorFormatter } from '@/features/authentication/services/authenticationErrorFormatter';
import { ErrorCode } from '@/types/errorCodes';

describe('AuthenticationErrorFormatter', () => {
    describe('formatError', () => {
        it('should format timeout errors', () => {
            const error = new Error('Operation timed out');
            const context = { operation: 'Login', timeout: 5000 };

            const result = AuthenticationErrorFormatter.formatError(error, context);

            expect(result.title).toBe('Operation timed out');
            expect(result.message).toBe('Login timed out after 5000ms. Please try again.');
            expect(result.technical).toContain('Operation: Login');
            expect(result.technical).toContain('Error: Operation timed out');
            expect(result.code).toBe(ErrorCode.TIMEOUT);
        });

        it('should format timeout errors with "timeout" keyword', () => {
            const error = new Error('The request timeout after waiting');
            const context = { operation: 'GetOrganizations', timeout: 3000 };

            const result = AuthenticationErrorFormatter.formatError(error, context);

            expect(result.title).toBe('Operation timed out');
            expect(result.message).toBe('GetOrganizations timed out after 3000ms. Please try again.');
            expect(result.code).toBe(ErrorCode.TIMEOUT);
        });

        it('should format network errors', () => {
            const error = new Error('Network error occurred');
            const context = { operation: 'FetchProjects' };

            const result = AuthenticationErrorFormatter.formatError(error, context);

            expect(result.title).toBe('Connection problem');
            expect(result.message).toBe('No internet connection. Please check your network and try again.');
            expect(result.code).toBe(ErrorCode.NETWORK);
        });

        it('should format ENOTFOUND errors as network errors', () => {
            const error = new Error('ENOTFOUND api.adobe.io');
            const context = { operation: 'API Call' };

            const result = AuthenticationErrorFormatter.formatError(error, context);

            expect(result.title).toBe('Connection problem');
            expect(result.message).toBe('No internet connection. Please check your network and try again.');
            expect(result.code).toBe(ErrorCode.NETWORK);
        });

        it('should format authentication errors', () => {
            const error = new Error('Unauthorized access');
            const context = { operation: 'GetUserData' };

            const result = AuthenticationErrorFormatter.formatError(error, context);

            expect(result.title).toBe('Sign in required');
            expect(result.message).toBe('Authentication failed. Please try logging in again.');
            expect(result.code).toBe(ErrorCode.AUTH_REQUIRED);
        });

        it('should format errors with "auth" keyword', () => {
            const error = new Error('auth token expired');
            const context = { operation: 'ValidateToken' };

            const result = AuthenticationErrorFormatter.formatError(error, context);

            expect(result.title).toBe('Sign in required');
            expect(result.message).toBe('Authentication failed. Please try logging in again.');
            expect(result.code).toBe(ErrorCode.AUTH_REQUIRED);
        });

        it('should format generic errors', () => {
            const error = new Error('Something went wrong');
            const context = { operation: 'DoSomething' };

            const result = AuthenticationErrorFormatter.formatError(error, context);

            expect(result.title).toBe('Something went wrong');
            expect(result.message).toBe('Something went wrong');
            expect(result.code).toBe(ErrorCode.UNKNOWN);
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

            expect(result.message).toBe('Something went wrong');
            expect(result.technical).toContain('Error: Simple error string');
            expect(result.code).toBe(ErrorCode.UNKNOWN);
        });

        it('should handle objects without message property', () => {
            const error = { code: 'ERR_001', details: 'Error details' };
            const context = { operation: 'Test' };

            const result = AuthenticationErrorFormatter.formatError(error, context);

            // toAppError converts objects without message to generic error
            expect(result.message).toBe('Something went wrong');
            expect(result.code).toBe(ErrorCode.UNKNOWN);
        });

        it('should be case-insensitive for error detection', () => {
            const errors = [
                { error: 'TIMEOUT ERROR', expectedTitle: 'Operation timed out', expectedCode: ErrorCode.TIMEOUT },
                { error: 'Network failure', expectedTitle: 'Connection problem', expectedCode: ErrorCode.NETWORK },
                { error: 'AUTH FAILED', expectedTitle: 'Sign in required', expectedCode: ErrorCode.AUTH_REQUIRED },
            ];

            errors.forEach(({ error, expectedTitle, expectedCode }) => {
                const result = AuthenticationErrorFormatter.formatError(
                    new Error(error),
                    { operation: 'Test' },
                );
                expect(result.title).toBe(expectedTitle);
                expect(result.code).toBe(expectedCode);
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

            expect(result.title).toBe('Operation timed out');
            expect(result.code).toBe(ErrorCode.TIMEOUT);
        });

        it('should format errors without timeout context', () => {
            const error = new Error('timeout occurred');
            const context = { operation: 'Test' };

            const result = AuthenticationErrorFormatter.formatError(error, context);

            expect(result.title).toBe('Operation timed out');
            expect(result.message).toContain('timed out after undefinedms');
            expect(result.code).toBe(ErrorCode.TIMEOUT);
        });

        it('should handle empty error messages', () => {
            const error = new Error('');
            const context = { operation: 'Test' };

            const result = AuthenticationErrorFormatter.formatError(error, context);

            // Empty error message uses default user message from AppError
            expect(result.message).toBe('Something went wrong');
            expect(result.code).toBe(ErrorCode.UNKNOWN);
        });

        it('should handle null and undefined errors', () => {
            const contexts = [
                { error: null, expectedMessage: 'Something went wrong' },
                { error: undefined, expectedMessage: 'Something went wrong' },
            ];

            contexts.forEach(({ error, expectedMessage }) => {
                const result = AuthenticationErrorFormatter.formatError(
                    error as unknown,
                    { operation: 'Test' },
                );
                // toAppError converts null/undefined to generic "Unknown error occurred"
                expect(result.message).toBe(expectedMessage);
                expect(result.code).toBe(ErrorCode.UNKNOWN);
            });
        });

        it('should include error code in technical details', () => {
            const error = new Error('timeout occurred');
            const context = { operation: 'Test', timeout: 5000 };

            const result = AuthenticationErrorFormatter.formatError(error, context);

            expect(result.technical).toContain('Code: TIMEOUT');
        });
    });
});
