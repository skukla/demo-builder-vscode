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
