/**
 * GitHub Repository Operations Tests
 *
 * Tests for repository operations extracted from GitHubService.
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

describe('GitHub Repository Operations', () => {
    let GitHubRepoOperations: any;
    let mockTokenService: any;

    beforeEach(async () => {
        jest.clearAllMocks();
        jest.resetModules();

        mockTokenService = {
            getToken: jest.fn().mockResolvedValue({ token: 'ghp_test' }),
            clearToken: jest.fn(),
        };

        const module = await import('@/features/eds/services/githubRepoOperations');
        GitHubRepoOperations = module.GitHubRepoOperations;
    });

    describe('createFromTemplate', () => {
        it('should create repository from template', async () => {
            // Given: Valid token and successful API call
            const service = new GitHubRepoOperations(mockTokenService);
            mockOctokitRequest.mockResolvedValue({
                data: {
                    id: 12345,
                    name: 'new-repo',
                    full_name: 'user/new-repo',
                    html_url: 'https://github.com/user/new-repo',
                    clone_url: 'https://github.com/user/new-repo.git',
                    default_branch: 'main',
                },
            });

            // When: Creating from template
            const result = await service.createFromTemplate(
                'adobe',
                'citisignal-template',
                'new-repo'
            );

            // Then: Repository info should be returned
            expect(result.id).toBe(12345);
            expect(result.name).toBe('new-repo');
            expect(result.fullName).toBe('user/new-repo');
        });

        it('should throw "Repository name already exists" for 422 with name error', async () => {
            // Given: API returns 422 with name exists error
            const service = new GitHubRepoOperations(mockTokenService);
            mockOctokitRequest.mockRejectedValue({
                status: 422,
                errors: [{ message: 'name already exists on this account' }],
            });

            // When/Then: Should throw specific error
            await expect(
                service.createFromTemplate('adobe', 'template', 'existing-repo')
            ).rejects.toThrow('Repository name already exists');
        });

        it('should throw "Not authenticated" when no token', async () => {
            // Given: No token
            mockTokenService.getToken.mockResolvedValue(undefined);
            const service = new GitHubRepoOperations(mockTokenService);

            // When/Then: Should throw not authenticated
            await expect(
                service.createFromTemplate('adobe', 'template', 'new-repo')
            ).rejects.toThrow('Not authenticated');
        });
    });

    describe('listUserRepositories', () => {
        it('should return list of repositories with push access', async () => {
            // Given: API returns repos
            const service = new GitHubRepoOperations(mockTokenService);
            mockOctokitRequest.mockResolvedValue({
                data: [
                    {
                        id: 1,
                        name: 'repo1',
                        full_name: 'user/repo1',
                        html_url: 'https://github.com/user/repo1',
                        clone_url: 'https://github.com/user/repo1.git',
                        default_branch: 'main',
                        permissions: { push: true },
                    },
                    {
                        id: 2,
                        name: 'repo2',
                        full_name: 'user/repo2',
                        html_url: 'https://github.com/user/repo2',
                        clone_url: 'https://github.com/user/repo2.git',
                        default_branch: 'main',
                        permissions: { push: false }, // No push access
                    },
                ],
            });

            // When: Listing repos
            const result = await service.listUserRepositories();

            // Then: Only repos with push access returned
            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('repo1');
        });
    });

    describe('checkRepositoryAccess', () => {
        it('should return hasAccess true with push access', async () => {
            // Given: API returns repo with push access
            const service = new GitHubRepoOperations(mockTokenService);
            mockOctokitRequest.mockResolvedValue({
                data: {
                    id: 1,
                    name: 'repo',
                    full_name: 'owner/repo',
                    html_url: 'https://github.com/owner/repo',
                    clone_url: 'https://github.com/owner/repo.git',
                    default_branch: 'main',
                    permissions: { push: true },
                },
            });

            // When: Checking access
            const result = await service.checkRepositoryAccess('owner', 'repo');

            // Then: Should have access
            expect(result.hasAccess).toBe(true);
            expect(result.repo).toBeDefined();
        });

        it('should return hasAccess false for 404', async () => {
            // Given: Repo not found
            const service = new GitHubRepoOperations(mockTokenService);
            mockOctokitRequest.mockRejectedValue({ status: 404 });

            // When: Checking access
            const result = await service.checkRepositoryAccess('owner', 'missing');

            // Then: No access, repo not found
            expect(result.hasAccess).toBe(false);
            expect(result.error).toContain('not found');
        });

        it('should return hasAccess false without push permission', async () => {
            // Given: Repo exists but no push access
            const service = new GitHubRepoOperations(mockTokenService);
            mockOctokitRequest.mockResolvedValue({
                data: {
                    id: 1,
                    name: 'repo',
                    full_name: 'owner/repo',
                    permissions: { push: false },
                },
            });

            // When: Checking access
            const result = await service.checkRepositoryAccess('owner', 'repo');

            // Then: No access
            expect(result.hasAccess).toBe(false);
            expect(result.error).toContain('write access');
        });
    });

    describe('deleteRepository', () => {
        it('should delete repository successfully', async () => {
            // Given: Successful delete
            const service = new GitHubRepoOperations(mockTokenService);
            mockOctokitRequest.mockResolvedValue({});

            // When: Deleting
            await service.deleteRepository('owner', 'repo');

            // Then: API should be called
            expect(mockOctokitRequest).toHaveBeenCalledWith(
                'DELETE /repos/{owner}/{repo}',
                expect.objectContaining({ owner: 'owner', repo: 'repo' })
            );
        });

        it('should throw specific error for missing delete_repo scope', async () => {
            // Given: 403 forbidden
            const service = new GitHubRepoOperations(mockTokenService);
            mockOctokitRequest.mockRejectedValue({ status: 403 });

            // When/Then: Should throw scope error
            await expect(
                service.deleteRepository('owner', 'repo')
            ).rejects.toThrow('delete_repo scope');
        });
    });

    describe('archiveRepository', () => {
        it('should archive repository successfully', async () => {
            // Given: Successful archive
            const service = new GitHubRepoOperations(mockTokenService);
            mockOctokitRequest.mockResolvedValue({});

            // When: Archiving
            await service.archiveRepository('owner', 'repo');

            // Then: API should be called with archived: true
            expect(mockOctokitRequest).toHaveBeenCalledWith(
                'PATCH /repos/{owner}/{repo}',
                expect.objectContaining({ owner: 'owner', repo: 'repo', archived: true })
            );
        });
    });
});
