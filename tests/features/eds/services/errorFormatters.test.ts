/**
 * Unit Tests: EDS Error Formatters
 *
 * Tests for error formatting utilities that transform technical errors
 * into user-friendly messages for GitHub, DA.live, and Helix operations.
 *
 * Coverage: 21 tests across 3 categories
 * - GitHub Error Formatting (7 tests)
 * - DA.live Error Formatting (7 tests)
 * - Helix Error Formatting (7 tests)
 */

import {
    formatGitHubError,
    formatDaLiveError,
    formatHelixError,
} from '@/features/eds/services/errorFormatters';

describe('EDS Error Formatters', () => {
    // ==========================================================
    // GitHub Error Formatting (7 tests)
    // ==========================================================
    describe('formatGitHubError', () => {
        it('should format OAuth cancelled error by code', () => {
            // Given: Error with OAUTH_CANCELLED code
            const error = new Error('User cancelled the flow');
            (error as any).code = 'OAUTH_CANCELLED';

            // When: Formatting the error
            const result = formatGitHubError(error);

            // Then: Should return user-friendly message
            expect(result.code).toBe('OAUTH_CANCELLED');
            expect(result.userMessage).toMatch(/sign.?in.*cancel/i);
            expect(result.recoveryHint).toBeDefined();
        });

        it('should format repo exists error by message pattern', () => {
            // Given: Error with "already exists" in message
            const error = new Error('Repository name already exists');

            // When: Formatting the error
            const result = formatGitHubError(error);

            // Then: Should detect REPO_EXISTS pattern
            expect(result.code).toBe('REPO_EXISTS');
            expect(result.userMessage).toMatch(/already exists|different name/i);
        });

        it('should format auth expired error by code', () => {
            // Given: Error with AUTH_EXPIRED code
            const error = new Error('Bad credentials');
            (error as any).code = 'AUTH_EXPIRED';
            (error as any).status = 401;

            // When: Formatting the error
            const result = formatGitHubError(error);

            // Then: Should return session expired message
            expect(result.code).toBe('AUTH_EXPIRED');
            expect(result.userMessage).toMatch(/session.*expired|sign in again/i);
            expect(result.technicalDetails).toContain('401');
        });

        it('should format rate limit error by message pattern', () => {
            // Given: Error with "rate limit" in message
            const error = new Error('API rate limit exceeded');

            // When: Formatting the error
            const result = formatGitHubError(error);

            // Then: Should detect RATE_LIMITED pattern
            expect(result.code).toBe('RATE_LIMITED');
            expect(result.userMessage).toMatch(/too many requests|minutes/i);
        });

        it('should format network error by message pattern', () => {
            // Given: Error with "timeout" in message
            const error = new Error('Network timeout occurred');

            // When: Formatting the error
            const result = formatGitHubError(error);

            // Then: Should detect NETWORK_ERROR pattern
            expect(result.code).toBe('NETWORK_ERROR');
            expect(result.userMessage).toMatch(/connect|internet/i);
        });

        it('should return unknown code for unrecognized errors', () => {
            // Given: Error with unrecognized message
            const error = new Error('Some random unexpected error');

            // When: Formatting the error
            const result = formatGitHubError(error);

            // Then: Should fall back to UNKNOWN
            expect(result.code).toBe('UNKNOWN');
            expect(result.userMessage).toMatch(/unexpected error/i);
            expect(result.message).toBe('Some random unexpected error');
        });

        it('should handle empty error message', () => {
            // Given: Error with empty message
            const error = new Error('');

            // When: Formatting the error
            const result = formatGitHubError(error);

            // Then: Should fall back to UNKNOWN
            expect(result.code).toBe('UNKNOWN');
            expect(result.message).toBe('');
        });
    });

    // ==========================================================
    // DA.live Error Formatting (7 tests)
    // ==========================================================
    describe('formatDaLiveError', () => {
        it('should format access denied error by code', () => {
            // Given: Error with ACCESS_DENIED code
            const error = new Error('Access forbidden');
            (error as any).code = 'ACCESS_DENIED';
            (error as any).statusCode = 403;

            // When: Formatting the error
            const result = formatDaLiveError(error);

            // Then: Should return permission message
            expect(result.code).toBe('ACCESS_DENIED');
            expect(result.userMessage).toMatch(/permission|access/i);
            expect(result.technicalDetails).toContain('403');
        });

        it('should format access denied by message pattern', () => {
            // Given: Error with "forbidden" in message
            const error = new Error('Request forbidden by server');

            // When: Formatting the error
            const result = formatDaLiveError(error);

            // Then: Should detect ACCESS_DENIED pattern
            expect(result.code).toBe('ACCESS_DENIED');
            expect(result.recoveryHint).toMatch(/administrator|request access/i);
        });

        it('should format network error by code', () => {
            // Given: Error with NETWORK_ERROR code
            const error = new Error('The operation was aborted');
            (error as any).code = 'NETWORK_ERROR';

            // When: Formatting the error
            const result = formatDaLiveError(error);

            // Then: Should return connection message
            expect(result.code).toBe('NETWORK_ERROR');
            expect(result.userMessage).toMatch(/connect|timeout|interrupted/i);
        });

        it('should format timeout error by message pattern', () => {
            // Given: Error with "timeout" in message
            const error = new Error('Request timed out');

            // When: Formatting the error
            const result = formatDaLiveError(error);

            // Then: Should detect TIMEOUT pattern
            // Note: NETWORK_ERROR patterns include 'timeout' but TIMEOUT is checked first
            expect(result.code).toBe('TIMEOUT');
            expect(result.userMessage).toMatch(/took too long|timed out/i);
        });

        it('should format not found error by message pattern', () => {
            // Given: Error with "404" in message
            const error = new Error('Response status 404');

            // When: Formatting the error
            const result = formatDaLiveError(error);

            // Then: Should detect NOT_FOUND pattern
            expect(result.code).toBe('NOT_FOUND');
            expect(result.userMessage).toMatch(/could not be found/i);
        });

        it('should return unknown code for unrecognized errors', () => {
            // Given: Error with unrecognized message
            const error = new Error('Unexpected server behavior');

            // When: Formatting the error
            const result = formatDaLiveError(error);

            // Then: Should fall back to UNKNOWN
            expect(result.code).toBe('UNKNOWN');
            expect(result.userMessage).toMatch(/unexpected error/i);
        });

        it('should handle error with code and statusCode in technical details', () => {
            // Given: Error with explicit code and statusCode
            const error = new Error('Server error');
            (error as any).code = 'ACCESS_DENIED';
            (error as any).statusCode = 403;

            // When: Formatting the error
            const result = formatDaLiveError(error);

            // Then: Should include status in technical details
            expect(result.code).toBe('ACCESS_DENIED');
            expect(result.technicalDetails).toContain('403');
        });
    });

    // ==========================================================
    // Helix Error Formatting (7 tests)
    // ==========================================================
    describe('formatHelixError', () => {
        it('should format service unavailable error by code', () => {
            // Given: Error with SERVICE_UNAVAILABLE code
            const error = new Error('Service temporarily unavailable');
            (error as any).code = 'SERVICE_UNAVAILABLE';
            (error as any).status = 503;

            // When: Formatting the error
            const result = formatHelixError(error);

            // Then: Should return service unavailable message
            expect(result.code).toBe('SERVICE_UNAVAILABLE');
            expect(result.userMessage).toMatch(/temporarily unavailable/i);
            expect(result.technicalDetails).toContain('503');
        });

        it('should format service unavailable by message pattern', () => {
            // Given: Error with "503" in message
            const error = new Error('Response status 503');

            // When: Formatting the error
            const result = formatHelixError(error);

            // Then: Should detect SERVICE_UNAVAILABLE pattern
            expect(result.code).toBe('SERVICE_UNAVAILABLE');
            expect(result.recoveryHint).toMatch(/try again|few minutes/i);
        });

        it('should format sync timeout error by code', () => {
            // Given: Error with SYNC_TIMEOUT code
            const error = new Error('Code sync timeout');
            (error as any).code = 'SYNC_TIMEOUT';

            // When: Formatting the error
            const result = formatHelixError(error);

            // Then: Should return sync timeout message
            expect(result.code).toBe('SYNC_TIMEOUT');
            expect(result.userMessage).toMatch(/synchronization|longer than expected/i);
        });

        it('should format config failed by message pattern', () => {
            // Given: Error with "500" in message
            const error = new Error('Response status 500 from config');

            // When: Formatting the error
            const result = formatHelixError(error);

            // Then: Should detect CONFIG_FAILED pattern
            expect(result.code).toBe('CONFIG_FAILED');
            expect(result.userMessage).toMatch(/server encountered an error/i);
        });

        it('should format network error by message pattern', () => {
            // Given: Error with "abort" in message
            const error = new Error('The operation was aborted');

            // When: Formatting the error
            const result = formatHelixError(error);

            // Then: Should detect NETWORK_ERROR pattern
            expect(result.code).toBe('NETWORK_ERROR');
            expect(result.userMessage).toMatch(/connect|internet/i);
        });

        it('should return unknown code for unrecognized errors', () => {
            // Given: Error with unrecognized message
            const error = new Error('Unexpected helix behavior');

            // When: Formatting the error
            const result = formatHelixError(error);

            // Then: Should fall back to UNKNOWN
            expect(result.code).toBe('UNKNOWN');
            expect(result.userMessage).toMatch(/unexpected error/i);
        });

        it('should handle error with code and status in technical details', () => {
            // Given: Error with explicit code and status
            const error = new Error('Bad gateway');
            (error as any).code = 'SERVICE_UNAVAILABLE';
            (error as any).status = 502;

            // When: Formatting the error
            const result = formatHelixError(error);

            // Then: Should include status in technical details
            expect(result.code).toBe('SERVICE_UNAVAILABLE');
            expect(result.technicalDetails).toContain('502');
        });
    });
});
