/**
 * GitHub File Operations Tests
 *
 * The Contents API half of what used to be one file: reads and writes of one file
 * at a time. The tree commits and the template reset have their own suites since
 * the 2026-10-08 split (EDS-8).
 */

import { createMockLogger } from '../../../../helpers/loggerFake';

export {};

import { mockRequest as mockOctokitRequest } from './githubFileOperations.testUtils';

// Mock logger

describe('isStaleShaFailure', () => {
    // Classifies the Contents API update-with-SHA rejection. Shared by the
    // publishers (brandAssetPublisher, pdp404HandlerPublisher) for their
    // re-read-and-retry-once handling.

    let isStaleShaFailure: any;

    beforeEach(async () => {
        jest.resetModules();
        const module = await import('@/features/eds/services/github/githubFileOperations');
        isStaleShaFailure = module.isStaleShaFailure;
    });

    it('matches GitHub\'s "does not match" stale-SHA rejection (case-insensitive)', () => {
        expect(isStaleShaFailure(new Error('styles/x.css does not match sha'))).toBe(true);
        expect(isStaleShaFailure(new Error('X Does Not Match Y'))).toBe(true);
    });

    it('does not match other failures', () => {
        expect(isStaleShaFailure(new Error('403 Forbidden'))).toBe(false);
        expect(isStaleShaFailure(new Error('Not Found'))).toBe(false);
    });

    it('is false for non-Error and message-less values', () => {
        expect(isStaleShaFailure(undefined)).toBe(false);
        expect(isStaleShaFailure('does not match')).toBe(false);
        expect(isStaleShaFailure({})).toBe(false);
    });
});

describe('GitHub File Operations', () => {
    let GitHubFileOperations: any;
    let mockTokenService: any;

    beforeEach(async () => {
        jest.clearAllMocks();
        jest.resetModules();

        mockTokenService = {
            getToken: jest.fn().mockResolvedValue({ token: 'ghp_test' }),
            clearToken: jest.fn(),
        };

        const module = await import('@/features/eds/services/github/githubFileOperations');
        GitHubFileOperations = module.GitHubFileOperations;
    });

    describe('getFileContent', () => {
        it('should return decoded file content', async () => {
            // Given: File exists in repo
            const service = new GitHubFileOperations(mockTokenService);
            const content = 'Hello World';
            const base64Content = Buffer.from(content).toString('base64');
            mockOctokitRequest.mockResolvedValue({
                data: {
                    content: base64Content,
                    sha: 'abc123',
                    path: 'README.md',
                    encoding: 'base64',
                },
            });

            // When: Getting file content
            const result = await service.getFileContent('owner', 'repo', 'README.md');

            // Then: Content should be decoded
            expect(result).not.toBeNull();
            expect(result!.content).toBe('Hello World');
            expect(result!.sha).toBe('abc123');
        });

        it('should return null for 404', async () => {
            // Given: File not found
            const service = new GitHubFileOperations(mockTokenService);
            mockOctokitRequest.mockRejectedValue({ status: 404 });

            // When: Getting non-existent file
            const result = await service.getFileContent('owner', 'repo', 'missing.txt');

            // Then: Should return null
            expect(result).toBeNull();
        });

        it('should support ref parameter for specific branch/commit', async () => {
            // Given: File on specific branch
            const service = new GitHubFileOperations(mockTokenService);
            mockOctokitRequest.mockResolvedValue({
                data: {
                    content: Buffer.from('branch content').toString('base64'),
                    sha: 'def456',
                    path: 'file.txt',
                    encoding: 'base64',
                },
            });

            // When: Getting file from specific ref
            await service.getFileContent('owner', 'repo', 'file.txt', 'feature-branch');

            // Then: Request should include ref
            expect(mockOctokitRequest).toHaveBeenCalledWith(
                'GET /repos/{owner}/{repo}/contents/{path}',
                expect.objectContaining({ ref: 'feature-branch' })
            );
        });
    });

    describe('createOrUpdateFile', () => {
        it('should create new file with base64 encoded content', async () => {
            // Given: API accepts file creation
            const service = new GitHubFileOperations(mockTokenService);
            mockOctokitRequest.mockResolvedValue({
                data: {
                    content: { sha: 'newsha' },
                    commit: { sha: 'commitsha' },
                },
            });

            // When: Creating file
            const result = await service.createOrUpdateFile(
                'owner',
                'repo',
                'new-file.txt',
                'File content',
                'Add new file'
            );

            // Then: Should return file and commit SHAs
            expect(result.sha).toBe('newsha');
            expect(result.commitSha).toBe('commitsha');

            // Verify content is base64 encoded
            const callArgs = mockOctokitRequest.mock.calls[0][1];
            expect(callArgs.content).toBe(Buffer.from('File content').toString('base64'));
        });

        /**
         * A real 2026-08-11 report died with GitHub's raw text — "Repository rule
         * violations found / Secret detected in content" — which names no file. This
         * pipeline writes eight of them, so the reporter could not tell which was
         * refused. The path is known right here; these pin that it reaches the message.
         */
        it('names the blocked file when push protection rejects the write', async () => {
            const service = new GitHubFileOperations(mockTokenService);
            const rejection = new Error(
                'Repository rule violations found\n\nSecret detected in content'
            ) as Error & { status?: number };
            rejection.status = 422;
            mockOctokitRequest.mockRejectedValue(rejection);

            await expect(
                service.createOrUpdateFile('owner', 'repo', 'fstab.yaml', 'body', 'msg')
            ).rejects.toThrow(/fstab\.yaml/);
        });

        it('says nothing was written, so the repo is not assumed half-updated', async () => {
            const service = new GitHubFileOperations(mockTokenService);
            const rejection = new Error('Repository rule violations found') as Error & {
                status?: number;
            };
            rejection.status = 422;
            mockOctokitRequest.mockRejectedValue(rejection);

            await expect(
                service.createOrUpdateFile('owner', 'repo', 'config.json', 'body', 'msg')
            ).rejects.toThrow(/nothing was written/i);
        });

        it('logs the full GitHub response body, not just the tidy message', async () => {
            // The block cannot be reproduced locally — it comes from policy on the
            // reporting user's account. What GitHub said is the only evidence there
            // will ever be, so it has to reach the debug log.
            const logger = createMockLogger();
            const service = new GitHubFileOperations(mockTokenService, logger);
            const rejection = new Error('Repository rule violations found') as Error & {
                status?: number;
                response?: unknown;
            };
            rejection.status = 422;
            rejection.response = {
                headers: { 'x-github-request-id': 'REQ:9' },
                data: {
                    message: 'Repository rule violations found',
                    errors: [{ resource: 'PushRule', message: 'Adobe Client Secret' }],
                },
            };
            mockOctokitRequest.mockRejectedValue(rejection);

            await expect(
                service.createOrUpdateFile('owner', 'repo', 'fstab.yaml', 'body', 'msg')
            ).rejects.toThrow(/fstab\.yaml/);

            // Debug channel only: User Logs keeps the clean headline, which already
            // names the secret. debugLogger.ts:100-104 defines that split.
            const logged = logger.debug.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
            expect(logged).toContain('Adobe Client Secret');
            expect(logged).toContain('REQ:9');
            expect(logged).toContain('422');
        });

        it('leaves an unrelated failure untouched', async () => {
            // 422 is also a stale-SHA conflict, which has a different remedy. Relabelling
            // it as a secret block would send the reader to the wrong place entirely.
            const service = new GitHubFileOperations(mockTokenService);
            const staleSha = new Error('is at abc123 but expected def456') as Error & {
                status?: number;
            };
            staleSha.status = 422;
            mockOctokitRequest.mockRejectedValue(staleSha);

            await expect(
                service.createOrUpdateFile('owner', 'repo', 'fstab.yaml', 'body', 'msg')
            ).rejects.toThrow('is at abc123 but expected def456');
        });

        it('should update existing file with SHA', async () => {
            // Given: Existing file SHA
            const service = new GitHubFileOperations(mockTokenService);
            mockOctokitRequest.mockResolvedValue({
                data: {
                    content: { sha: 'updatedsha' },
                    commit: { sha: 'commitsha2' },
                },
            });

            // When: Updating file
            await service.createOrUpdateFile(
                'owner',
                'repo',
                'existing.txt',
                'Updated content',
                'Update file',
                'existingsha'
            );

            // Then: Request should include SHA
            expect(mockOctokitRequest).toHaveBeenCalledWith(
                'PUT /repos/{owner}/{repo}/contents/{path}',
                expect.objectContaining({ sha: 'existingsha' })
            );
        });
    });
});
