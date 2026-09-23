/**
 * Unit tests for AuthenticationErrorFormatter
 * Tests error message formatting, user-friendly messages, and Adobe error translation
 *
 * Updated for new typed error system (Phase C of error handling consolidation):
 * - Uses ErrorCode enum for categorization instead of string matching
 * - Returns structured error with `code` field
 * - Uses consistent user-friendly messages from getErrorTitle()
 */

import {
    AuthenticationErrorFormatter,
    explainAdobeAccessFailure,
} from '@/features/authentication/services/authenticationErrorFormatter';
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

            // AppError.from now uses the error string as userMessage for consistency
            expect(result.message).toBe('Simple error string');
            expect(result.technical).toContain('Error: Simple error string');
            expect(result.code).toBe(ErrorCode.UNKNOWN);
        });

        it('should handle objects without message property', () => {
            const error = { code: 'ERR_001', details: 'Error details' };
            const context = { operation: 'Test' };

            const result = AuthenticationErrorFormatter.formatError(error, context);

            // toAppError converts objects without message to generic error
            // AppError.from now uses message as userMessage for consistency
            expect(result.message).toBe('Unknown error occurred');
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
                { error: null, expectedMessage: 'Unknown error occurred' },
                { error: undefined, expectedMessage: 'Unknown error occurred' },
            ];

            contexts.forEach(({ error, expectedMessage }) => {
                const result = AuthenticationErrorFormatter.formatError(
                    error as unknown,
                    { operation: 'Test' },
                );
                // toAppError converts null/undefined to generic error
                // AppError.from now uses message as userMessage for consistency
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

        it('passes a non-auth, non-general domain error through with its own user message', () => {
            // A mesh-category error reaches the formatter's fallback branch: the
            // title comes from the code and the message is the error's own userMessage,
            // not the auth or network copy.
            // A domain error carrying the FailureShape fields directly — which is what
            // replaced the central AppError hierarchy. Nothing inherits; the formatter
            // reads the shape.
            const error = Object.assign(new Error('mesh deploy exited 1'), {
                code: ErrorCode.MESH_DEPLOY_FAILED,
                userMessage: 'The mesh could not be deployed. Check the deploy log.',
                recoverable: false,
            });

            const result = AuthenticationErrorFormatter.formatError(error, { operation: 'DeployMesh' });

            expect(result).toEqual({
                title: 'Mesh deployment failed',
                message: 'The mesh could not be deployed. Check the deploy log.',
                technical: expect.stringContaining('Code: MESH_DEPLOY_FAILED'),
                code: ErrorCode.MESH_DEPLOY_FAILED,
            });
        });
    });
});

// The two Adobe refusals a deploy reaches with no sentence of its own. Inputs are the
// shapes read off real failures on 2026-09-17/18, with the user id replaced.
const LICENCE_403 =
    'App deployment failed: [CoreConsoleAPISDK:ERROR_GET_INTEGRATION_SECRETS] 403 - Forbidden ' +
    '({"messages":[{"template":"ERR_MSG_OPERATION_NOT_ALLOWED","message":"The user ' +
    "USER@AdobeID doesn't have the matching licenses for this application\"}]})";

const LICENCE_504 =
    '[CoreConsoleAPISDK:ERROR_GET_INTEGRATION] 504 - Gateway Timeout ({"messages":[{"message":' +
    '"Underlying service timed out: I/O error on GET request for licenses: Read timed out"}]})';

describe('explainAdobeAccessFailure', () => {
    it('names the missing product-profile access and who can grant it', () => {
        const message = explainAdobeAccessFailure(LICENCE_403);

        expect(message).toContain('not a developer on every product profile');
        expect(message).toContain('Admin Console');
    });

    it('recognises the refusal by its template alone', () => {
        expect(explainAdobeAccessFailure('403 ERR_MSG_OPERATION_NOT_ALLOWED')).toContain(
            'product profile',
        );
    });

    it("says a Console timeout is Adobe's side and worth retrying", () => {
        const message = explainAdobeAccessFailure(LICENCE_504);

        expect(message).toContain("Adobe's side");
        expect(message).toContain('try again');
    });

    it('leaves a timeout from anything other than Adobe Console alone', () => {
        expect(explainAdobeAccessFailure('npm install: 504 Gateway Timeout')).toBeUndefined();
    });

    it('leaves every other failure alone', () => {
        expect(explainAdobeAccessFailure('Build failed (exit 1): tsc: 3 errors')).toBeUndefined();
    });
});
