/**
 * Unit Tests: Code Sync Error Types
 *
 * Phase 3: Enhance AEM Code Sync Verification
 *
 * Tests verify:
 * 1. CodeSyncError base class structure
 * 2. Specific error types (timeout, permission, not-found, verification)
 * 3. Error context properties
 * 4. Error inheritance hierarchy
 */

// Import error types that will be created
import {
    CodeSyncError,
    CodeSyncTimeoutError,
    CodeSyncPermissionError,
    CodeSyncNotFoundError,
    CodeSyncVerificationError,
} from '@/features/eds/services/codeSyncErrors';

describe('Code Sync Error Types', () => {
    describe('CodeSyncError (base class)', () => {
        it('should create error with message and context', () => {
            const context = { owner: 'testuser', repo: 'testrepo' };
            const error = new CodeSyncError('Code sync failed', context);

            expect(error.message).toBe('Code sync failed');
            expect(error.context).toEqual(context);
            expect(error.name).toBe('CodeSyncError');
            expect(error instanceof Error).toBe(true);
        });

        it('should have proper Error inheritance', () => {
            const error = new CodeSyncError('Test', {});
            expect(error.stack).toBeDefined();
            expect(error instanceof Error).toBe(true);
        });
    });

    describe('CodeSyncTimeoutError', () => {
        it('should create timeout error with attempts count', () => {
            const context = { owner: 'testuser', repo: 'testrepo', attempts: 25 };
            const error = new CodeSyncTimeoutError(
                'Code sync timed out after 25 attempts',
                context
            );

            expect(error.name).toBe('CodeSyncTimeoutError');
            expect(error.context.attempts).toBe(25);
            expect(error.context.owner).toBe('testuser');
            expect(error.context.repo).toBe('testrepo');
            expect(error instanceof CodeSyncError).toBe(true);
        });

        it('should include timeout duration in message', () => {
            const error = new CodeSyncTimeoutError(
                'Code sync timed out. The GitHub App may be slow or misconfigured.',
                { owner: 'test', repo: 'test', attempts: 25, durationMs: 60000 }
            );

            expect(error.message).toContain('timed out');
        });
    });

    describe('CodeSyncPermissionError', () => {
        it('should create permission error with status code', () => {
            const context = { owner: 'testuser', repo: 'testrepo', statusCode: 403 };
            const error = new CodeSyncPermissionError(
                'Code sync returned 403. Check GitHub App permissions.',
                context
            );

            expect(error.name).toBe('CodeSyncPermissionError');
            expect(error.context.statusCode).toBe(403);
            expect(error instanceof CodeSyncError).toBe(true);
        });

        it('should handle 401 unauthorized case', () => {
            const error = new CodeSyncPermissionError(
                'Authentication required',
                { owner: 'test', repo: 'test', statusCode: 401 }
            );

            expect(error.context.statusCode).toBe(401);
        });
    });

    describe('CodeSyncNotFoundError', () => {
        it('should create not-found error with URL', () => {
            const context = {
                owner: 'testuser',
                repo: 'testrepo',
                url: 'https://admin.hlx.page/testuser/testrepo/main/scripts/aem.js'
            };
            const error = new CodeSyncNotFoundError(
                'Repository not found on Helix. Verify the GitHub App has access.',
                context
            );

            expect(error.name).toBe('CodeSyncNotFoundError');
            expect(error.context.url).toContain('admin.hlx.page');
            expect(error instanceof CodeSyncError).toBe(true);
        });
    });

    describe('CodeSyncVerificationError', () => {
        it('should create verification error when content not accessible', () => {
            const context = {
                owner: 'testuser',
                repo: 'testrepo',
                url: 'https://main--testrepo--testuser.aem.page/scripts/aem.js',
                statusCode: 502,
            };
            const error = new CodeSyncVerificationError(
                'Code sync reported success but content is not accessible.',
                context
            );

            expect(error.name).toBe('CodeSyncVerificationError');
            expect(error.context.url).toContain('aem.page');
            expect(error.context.statusCode).toBe(502);
            expect(error instanceof CodeSyncError).toBe(true);
        });

        it('should distinguish from admin sync success vs CDN access', () => {
            // Verification errors occur when:
            // - admin.hlx.page returned OK (sync "success")
            // - But actual CDN URL (*.aem.page) is not accessible
            const error = new CodeSyncVerificationError(
                'Sync succeeded but CDN not propagated yet',
                { owner: 'test', repo: 'test', url: 'https://main--test--test.aem.page/', statusCode: 404 }
            );

            expect(error.message).toContain('Sync succeeded');
        });
    });

    describe('Error type identification', () => {
        it('should allow instanceof checks for error type routing', () => {
            const timeoutError = new CodeSyncTimeoutError('timeout', { owner: 'a', repo: 'b', attempts: 25 });
            const permissionError = new CodeSyncPermissionError('permission', { owner: 'a', repo: 'b', statusCode: 403 });
            const notFoundError = new CodeSyncNotFoundError('not found', { owner: 'a', repo: 'b', url: 'x' });
            const verificationError = new CodeSyncVerificationError('verification', { owner: 'a', repo: 'b', url: 'x', statusCode: 502 });

            // All should be CodeSyncError
            expect(timeoutError instanceof CodeSyncError).toBe(true);
            expect(permissionError instanceof CodeSyncError).toBe(true);
            expect(notFoundError instanceof CodeSyncError).toBe(true);
            expect(verificationError instanceof CodeSyncError).toBe(true);

            // But also identifiable by specific type
            expect(timeoutError instanceof CodeSyncTimeoutError).toBe(true);
            expect(timeoutError instanceof CodeSyncPermissionError).toBe(false);

            // All should be Error
            expect(timeoutError instanceof Error).toBe(true);
            expect(permissionError instanceof Error).toBe(true);
        });
    });
});
