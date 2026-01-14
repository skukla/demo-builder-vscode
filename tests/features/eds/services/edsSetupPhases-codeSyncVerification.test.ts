/**
 * Unit Tests: Code Sync Verification Logic
 *
 * Phase 3: Enhance AEM Code Sync Verification
 *
 * Tests verify the LOGIC for:
 * 1. Mapping HTTP status codes to error types
 * 2. CDN URL construction for verification
 * 3. Error context population
 */

import {
    CodeSyncError,
    CodeSyncTimeoutError,
    CodeSyncPermissionError,
    CodeSyncNotFoundError,
    CodeSyncVerificationError,
} from '@/features/eds/services/codeSyncErrors';

describe('Code Sync Verification Logic', () => {
    describe('HTTP Status Code to Error Type Mapping', () => {
        /**
         * These tests verify the logic that should be used in verifyCodeSync
         * to map different HTTP responses to specific error types.
         */

        // Helper function that represents the mapping logic
        const mapErrorToType = (statusCode: number | undefined, isTimeout: boolean, owner: string, repo: string): CodeSyncError => {
            if (isTimeout) {
                return new CodeSyncTimeoutError(
                    'Code sync timed out. The GitHub App may be slow or misconfigured.',
                    { owner, repo, attempts: 25 }
                );
            }

            if (statusCode === 403 || statusCode === 401) {
                return new CodeSyncPermissionError(
                    `Code sync returned ${statusCode}. Check GitHub App permissions.`,
                    { owner, repo, statusCode }
                );
            }

            if (statusCode === 404) {
                return new CodeSyncNotFoundError(
                    'Repository not found on Helix. Verify the GitHub App has access.',
                    { owner, repo, url: `https://admin.hlx.page/${owner}/${repo}/main` }
                );
            }

            // Generic error for other cases
            return new CodeSyncError(
                `Code sync failed with status ${statusCode}`,
                { owner, repo, statusCode }
            );
        };

        it('should map timeout to CodeSyncTimeoutError', () => {
            const error = mapErrorToType(undefined, true, 'testuser', 'testrepo');
            expect(error).toBeInstanceOf(CodeSyncTimeoutError);
            expect(error.message).toContain('timed out');
        });

        it('should map 403 to CodeSyncPermissionError', () => {
            const error = mapErrorToType(403, false, 'testuser', 'testrepo');
            expect(error).toBeInstanceOf(CodeSyncPermissionError);
            expect(error.message).toContain('403');
        });

        it('should map 401 to CodeSyncPermissionError', () => {
            const error = mapErrorToType(401, false, 'testuser', 'testrepo');
            expect(error).toBeInstanceOf(CodeSyncPermissionError);
            expect(error.message).toContain('401');
        });

        it('should map 404 to CodeSyncNotFoundError', () => {
            const error = mapErrorToType(404, false, 'testuser', 'testrepo');
            expect(error).toBeInstanceOf(CodeSyncNotFoundError);
            expect(error.message).toContain('not found');
        });

        it('should map other status codes to generic CodeSyncError', () => {
            const error = mapErrorToType(500, false, 'testuser', 'testrepo');
            expect(error).toBeInstanceOf(CodeSyncError);
            expect(error).not.toBeInstanceOf(CodeSyncTimeoutError);
            expect(error).not.toBeInstanceOf(CodeSyncPermissionError);
        });
    });

    describe('CDN URL Construction', () => {
        /**
         * Tests verify the URL pattern used for post-sync verification.
         * CDN URL format: https://main--{repo}--{owner}.aem.page/scripts/aem.js
         */

        const constructCdnUrl = (owner: string, repo: string, branch = 'main'): string => {
            return `https://${branch}--${repo}--${owner}.aem.page/scripts/aem.js`;
        };

        const constructAdminUrl = (owner: string, repo: string, branch = 'main'): string => {
            return `https://admin.hlx.page/code/${owner}/${repo}/${branch}/scripts/aem.js`;
        };

        it('should construct correct CDN URL', () => {
            const url = constructCdnUrl('testuser', 'testrepo');
            expect(url).toBe('https://main--testrepo--testuser.aem.page/scripts/aem.js');
        });

        it('should construct correct admin URL', () => {
            const url = constructAdminUrl('testuser', 'testrepo');
            expect(url).toBe('https://admin.hlx.page/code/testuser/testrepo/main/scripts/aem.js');
        });

        it('should handle different branches', () => {
            const url = constructCdnUrl('testuser', 'testrepo', 'develop');
            expect(url).toBe('https://develop--testrepo--testuser.aem.page/scripts/aem.js');
        });

        it('should handle owner and repo with hyphens', () => {
            const url = constructCdnUrl('test-org', 'test-repo-name');
            expect(url).toBe('https://main--test-repo-name--test-org.aem.page/scripts/aem.js');
        });
    });

    describe('Verification Error Creation', () => {
        /**
         * Tests for creating CodeSyncVerificationError when admin sync
         * succeeds but CDN content is not accessible.
         */

        const createVerificationError = (
            owner: string,
            repo: string,
            cdnStatusCode: number
        ): CodeSyncVerificationError => {
            const cdnUrl = `https://main--${repo}--${owner}.aem.page/scripts/aem.js`;
            return new CodeSyncVerificationError(
                'Code sync reported success but content is not accessible.',
                { owner, repo, url: cdnUrl, statusCode: cdnStatusCode }
            );
        };

        it('should create verification error with correct context', () => {
            const error = createVerificationError('testuser', 'testrepo', 502);

            expect(error).toBeInstanceOf(CodeSyncVerificationError);
            expect(error.context.statusCode).toBe(502);
            expect(error.context.url).toContain('aem.page');
            expect(error.context.owner).toBe('testuser');
            expect(error.context.repo).toBe('testrepo');
        });

        it('should handle different CDN failure status codes', () => {
            // 502 Bad Gateway - common CDN issue
            const error502 = createVerificationError('test', 'repo', 502);
            expect(error502.context.statusCode).toBe(502);

            // 503 Service Unavailable - CDN overloaded
            const error503 = createVerificationError('test', 'repo', 503);
            expect(error503.context.statusCode).toBe(503);

            // 504 Gateway Timeout - CDN timeout
            const error504 = createVerificationError('test', 'repo', 504);
            expect(error504.context.statusCode).toBe(504);
        });
    });

    describe('Error Recovery Suggestions', () => {
        /**
         * Tests verify that error messages contain helpful recovery information.
         */

        it('should include retry suggestion in timeout error', () => {
            const error = new CodeSyncTimeoutError(
                'Code sync timed out. The GitHub App may be slow or misconfigured.',
                { owner: 'test', repo: 'test', attempts: 25 }
            );
            expect(error.message).toMatch(/slow|misconfigured/i);
        });

        it('should include permission check in 403 error', () => {
            const error = new CodeSyncPermissionError(
                'Code sync returned 403. Check GitHub App permissions.',
                { owner: 'test', repo: 'test', statusCode: 403 }
            );
            expect(error.message).toMatch(/permission/i);
        });

        it('should include GitHub App mention in 404 error', () => {
            const error = new CodeSyncNotFoundError(
                'Repository not found on Helix. Verify the GitHub App has access.',
                { owner: 'test', repo: 'test', url: 'https://admin.hlx.page/test/test/main' }
            );
            expect(error.message).toMatch(/github app|not found/i);
        });

        it('should mention CDN in verification error', () => {
            const error = new CodeSyncVerificationError(
                'Code sync reported success but content is not accessible.',
                { owner: 'test', repo: 'test', url: 'https://main--test--test.aem.page/', statusCode: 502 }
            );
            expect(error.message).toMatch(/success.*not accessible/i);
        });
    });

    describe('Error Type Hierarchy', () => {
        /**
         * Tests verify the error inheritance chain for proper instanceof checks.
         */

        it('should all inherit from CodeSyncError', () => {
            const timeout = new CodeSyncTimeoutError('msg', { owner: 'a', repo: 'b', attempts: 1 });
            const permission = new CodeSyncPermissionError('msg', { owner: 'a', repo: 'b', statusCode: 403 });
            const notFound = new CodeSyncNotFoundError('msg', { owner: 'a', repo: 'b', url: 'x' });
            const verification = new CodeSyncVerificationError('msg', { owner: 'a', repo: 'b', url: 'x', statusCode: 502 });

            expect(timeout instanceof CodeSyncError).toBe(true);
            expect(permission instanceof CodeSyncError).toBe(true);
            expect(notFound instanceof CodeSyncError).toBe(true);
            expect(verification instanceof CodeSyncError).toBe(true);
        });

        it('should all inherit from Error', () => {
            const timeout = new CodeSyncTimeoutError('msg', { owner: 'a', repo: 'b', attempts: 1 });
            expect(timeout instanceof Error).toBe(true);
        });

        it('should be distinguishable by instanceof', () => {
            const timeout = new CodeSyncTimeoutError('msg', { owner: 'a', repo: 'b', attempts: 1 });
            const permission = new CodeSyncPermissionError('msg', { owner: 'a', repo: 'b', statusCode: 403 });

            expect(timeout instanceof CodeSyncTimeoutError).toBe(true);
            expect(timeout instanceof CodeSyncPermissionError).toBe(false);
            expect(permission instanceof CodeSyncPermissionError).toBe(true);
            expect(permission instanceof CodeSyncTimeoutError).toBe(false);
        });
    });
});
