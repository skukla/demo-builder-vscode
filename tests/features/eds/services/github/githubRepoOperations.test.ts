/**
 * GitHub Repository Operations Tests — the reads (list, access check).
 *
 * The create/delete/archive tests this file held until 2026-10-08 moved with the
 * code to githubRepoLifecycle.test.ts (EDS-8).
 */

export {};

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

        const module = await import('@/features/eds/services/github/githubRepoOperations');
        GitHubRepoOperations = module.GitHubRepoOperations;
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
});
