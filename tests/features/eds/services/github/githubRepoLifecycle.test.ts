/**
 * GitHub Repository Lifecycle Tests — create, delete, archive (public-API happy paths).
 *
 * Moved from githubRepoOperations.test.ts with the code on 2026-10-08 (EDS-8).
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

describe('GitHub Repository Lifecycle', () => {
    let GitHubRepoLifecycle: any;
    let mockTokenService: any;

    beforeEach(async () => {
        jest.clearAllMocks();
        jest.resetModules();

        mockTokenService = {
            getToken: jest.fn().mockResolvedValue({ token: 'ghp_test' }),
            clearToken: jest.fn(),
        };

        const module = await import('@/features/eds/services/github/githubRepoLifecycle');
        GitHubRepoLifecycle = module.GitHubRepoLifecycle;
    });

    describe('createFromTemplate', () => {
        it('should create repository from template', async () => {
            // Given: Valid token and successful API call
            const service = new GitHubRepoLifecycle(mockTokenService);
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
            const service = new GitHubRepoLifecycle(mockTokenService);
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
            const service = new GitHubRepoLifecycle(mockTokenService);

            // When/Then: Should throw not authenticated
            await expect(
                service.createFromTemplate('adobe', 'template', 'new-repo')
            ).rejects.toThrow('Not authenticated');
        });

        it('targets the team-org namespace when targetOwner is provided', async () => {
            // Given: a successful create, with targetOwner set to a team org
            const service = new GitHubRepoLifecycle(mockTokenService);
            mockOctokitRequest.mockResolvedValue({
                data: {
                    id: 99, name: 'leah-demo',
                    full_name: 'demo-system-stores/leah-demo',
                    html_url: 'https://github.com/demo-system-stores/leah-demo',
                    clone_url: 'https://github.com/demo-system-stores/leah-demo.git',
                    default_branch: 'main',
                },
            });

            // When: createFromTemplate is called with the team org as the target owner
            await service.createFromTemplate(
                'adobe', 'template', 'leah-demo', false, 'demo-system-stores',
            );

            // Then: GitHub generate API receives the owner override so the
            // repo is created under the team org rather than the authenticated user
            expect(mockOctokitRequest).toHaveBeenCalledWith(
                'POST /repos/{template_owner}/{template_repo}/generate',
                expect.objectContaining({ owner: 'demo-system-stores' }),
            );
        });

        it('omits the owner parameter when targetOwner is undefined (default: authenticated user)', async () => {
            // Given: a successful create with no targetOwner — back-compat path
            const service = new GitHubRepoLifecycle(mockTokenService);
            mockOctokitRequest.mockResolvedValue({
                data: {
                    id: 99, name: 'leah-demo',
                    full_name: 'leahrayard/leah-demo',
                    html_url: 'https://github.com/leahrayard/leah-demo',
                    clone_url: 'https://github.com/leahrayard/leah-demo.git',
                    default_branch: 'main',
                },
            });

            // When: createFromTemplate called without targetOwner
            await service.createFromTemplate('adobe', 'template', 'leah-demo');

            // Then: the API call body has no `owner` key — GitHub defaults to
            // creating under the authenticated user
            const requestBody = mockOctokitRequest.mock.calls[0][1];
            expect(requestBody.owner).toBeUndefined();
        });
    });

    describe('deleteRepository', () => {
        it('should delete repository successfully', async () => {
            // Given: Successful delete
            const service = new GitHubRepoLifecycle(mockTokenService);
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
            const service = new GitHubRepoLifecycle(mockTokenService);
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
            const service = new GitHubRepoLifecycle(mockTokenService);
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
