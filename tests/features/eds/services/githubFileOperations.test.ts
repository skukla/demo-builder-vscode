/**
 * GitHub File Operations Tests
 *
 * Tests for file operations extracted from GitHubService.
 */

// Mock Octokit
const mockOctokitRequest = jest.fn();
jest.mock('@octokit/core', () => ({
    Octokit: {
        plugin: jest.fn(() =>
            jest.fn().mockImplementation(() => ({
                request: mockOctokitRequest,
            }))
        ),
    },
}));

jest.mock('@octokit/plugin-retry', () => ({
    retry: jest.fn(() => ({})),
}));

// Mock logger
jest.mock('@/core/logging', () => ({
    getLogger: jest.fn(() => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    })),
}));

describe('buildArchiveUrl', () => {
    // Test the SHA-vs-branch URL routing directly. The wider
    // `downloadRepoContents`/`resetRepoToTemplate` integration brings extensive
    // Octokit + zip-buffer mocking that obscures this one load-bearing branch.
    // ADR-006 Step 4: thin-layer reset passes the LKG SHA, forked reset passes `main`.

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let buildArchiveUrl: any;

    beforeEach(async () => {
        jest.resetModules();
        const module = await import('@/features/eds/services/githubFileOperations');
        buildArchiveUrl = module.buildArchiveUrl;
    });

    it('uses the branch URL shape for "main"', () => {
        const { url, isSha } = buildArchiveUrl('skukla', 'citisignal-b2b', 'main');
        expect(isSha).toBe(false);
        expect(url).toBe('https://github.com/skukla/citisignal-b2b/archive/refs/heads/main.zip');
    });

    it('uses the branch URL shape for any non-SHA ref (custom branches)', () => {
        const { url, isSha } = buildArchiveUrl('skukla', 'citisignal-b2b', 'feature/x');
        expect(isSha).toBe(false);
        expect(url).toBe('https://github.com/skukla/citisignal-b2b/archive/refs/heads/feature/x.zip');
    });

    it('uses the SHA URL shape for a full 40-hex commit SHA (lowercase)', () => {
        const sha = 'a1b2c3d4e5f6789012345678901234567890abcd';
        const { url, isSha } = buildArchiveUrl('skukla', 'citisignal-b2b', sha);
        expect(isSha).toBe(true);
        expect(url).toBe(`https://github.com/skukla/citisignal-b2b/archive/${sha}.zip`);
    });

    it('uses the SHA URL shape for a full 40-hex commit SHA (mixed case)', () => {
        const sha = 'A1B2C3D4E5F6789012345678901234567890ABCD';
        const { url, isSha } = buildArchiveUrl('skukla', 'citisignal-b2b', sha);
        expect(isSha).toBe(true);
        expect(url).toBe(`https://github.com/skukla/citisignal-b2b/archive/${sha}.zip`);
    });

    it('treats a short SHA (7 chars) as a branch ref, not a SHA', () => {
        // GitHub's archive URL endpoint only resolves full SHAs; short SHAs
        // would 404 there but work as a ref/branch in some contexts. Defensive
        // routing: if it's not exactly 40 hex chars, treat as branch.
        const { isSha } = buildArchiveUrl('skukla', 'citisignal-b2b', 'a1b2c3d');
        expect(isSha).toBe(false);
    });

    it('treats a 40-char non-hex string as a branch ref (defensive)', () => {
        const { isSha } = buildArchiveUrl('skukla', 'citisignal-b2b', 'g'.repeat(40));
        expect(isSha).toBe(false);
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

        const module = await import('@/features/eds/services/githubFileOperations');
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
