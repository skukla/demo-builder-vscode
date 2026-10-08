/**
 * GitHubRepoOperations — the Octokit-driven read paths.
 *
 * The mirror suite covers the happy paths of list and access. This one covers
 * `getRepository`, pagination and its safety limit, the permission-shaped
 * denials, and the cached client's lifecycle. The create, content-poll and delete
 * paths moved with the code to githubRepoLifecycle-apiPaths.test.ts (2026-10-08).
 *
 * Assertions are on the ARGUMENTS a collaborator receives — the request route and
 * body — because that is the only thing a mocked collaborator can be wrong about.
 */

import {
    apiRepo,
    createTokenService,
    GitHubRepoOperations,
    mockOctokitConstructor,
    mockRequest,
} from './githubRepoOperations.testUtils';
import { createMockLogger } from '../../../../helpers/loggerFake';
import type { GitHubTokenService } from '@/features/eds/services/github/githubTokenService';

describe('GitHubRepoOperations — Octokit paths', () => {
    let logger: ReturnType<typeof createMockLogger>;

    beforeEach(() => {
        jest.clearAllMocks();
        logger = createMockLogger();
    });

    const build = (tokenService: GitHubTokenService = createTokenService()) =>
        new GitHubRepoOperations(tokenService, logger);

    describe('getRepository', () => {
        it('maps the API response onto the repo shape', async () => {
            // Given: a repository the user can read
            mockRequest.mockResolvedValue({ data: apiRepo({ id: 42, name: 'demo' }) });

            // When: fetching it
            const result = await build().getRepository('owner', 'demo');

            // Then: the request is scoped to that repo and every field is mapped
            expect(mockRequest).toHaveBeenCalledWith('GET /repos/{owner}/{repo}', {
                owner: 'owner',
                repo: 'demo',
            });
            expect(result).toEqual({
                id: 42,
                name: 'demo',
                fullName: 'owner/repo',
                htmlUrl: 'https://github.com/owner/repo',
                cloneUrl: 'https://github.com/owner/repo.git',
                defaultBranch: 'main',
                isTemplate: false,
                isPrivate: false,
            });
        });

        it('turns a 404 into "Repository not found"', async () => {
            // Given: no such repository
            mockRequest.mockRejectedValue({ status: 404 });

            // When/Then
            await expect(build().getRepository('owner', 'gone')).rejects.toThrow(
                'Repository not found'
            );
        });

        it('turns a 403 into an access-denied error', async () => {
            // Given: the repository exists but is not readable
            mockRequest.mockRejectedValue({ status: 403 });

            // When/Then
            await expect(build().getRepository('owner', 'private')).rejects.toThrow(
                'Access denied to this repository'
            );
        });

        it('rethrows a status it has no message for', async () => {
            // Given: a server-side failure
            mockRequest.mockRejectedValue(Object.assign(new Error('gateway'), { status: 502 }));

            // When/Then: the original error survives
            await expect(build().getRepository('owner', 'repo')).rejects.toThrow('gateway');
        });
    });

    describe('listUserRepositories', () => {
        it('requests the first page sorted by recency across owned and collaborating repos', async () => {
            // Given: a single short page
            mockRequest.mockResolvedValue({ data: [apiRepo()] });

            // When: listing
            await build().listUserRepositories();

            // Then: the query pins sort, direction, page size and affiliation
            expect(mockRequest).toHaveBeenCalledWith('GET /user/repos', {
                sort: 'updated',
                direction: 'desc',
                per_page: 100,
                page: 1,
                affiliation: 'owner,collaborator',
            });
        });

        it('keeps paging while a page comes back full, and stops on a short one', async () => {
            // Given: a full first page and a short second page
            const fullPage = Array.from({ length: 100 }, (_, i) =>
                apiRepo({ id: i, name: `r${i}` })
            );
            mockRequest
                .mockResolvedValueOnce({ data: fullPage })
                .mockResolvedValueOnce({ data: [apiRepo({ id: 999, name: 'last' })] });

            // When: listing
            const result = await build().listUserRepositories();

            // Then: exactly two pages were fetched, the second by number, and both accumulate
            expect(mockRequest).toHaveBeenCalledTimes(2);
            expect(mockRequest).toHaveBeenNthCalledWith(
                2,
                'GET /user/repos',
                expect.objectContaining({ page: 2 })
            );
            expect(result).toHaveLength(101);
            expect(result[100].name).toBe('last');
        });

        it('stops at the ten-page safety limit even when pages stay full', async () => {
            // Given: every page comes back full, so the short-page exit never fires
            const fullPage = Array.from({ length: 100 }, (_, i) =>
                apiRepo({ id: i, name: `r${i}` })
            );
            mockRequest.mockResolvedValue({ data: fullPage });

            // When: listing
            const result = await build().listUserRepositories();

            // Then: ten pages, not an unbounded crawl
            expect(mockRequest).toHaveBeenCalledTimes(10);
            expect(result).toHaveLength(1000);
        });

        it('maps description, updatedAt and privacy alongside the core fields', async () => {
            // Given: a repo carrying the list-only fields
            mockRequest.mockResolvedValue({
                data: [
                    apiRepo({
                        description: 'a demo store',
                        updated_at: '2026-05-05T00:00:00Z',
                        private: true,
                    }),
                ],
            });

            // When: listing
            const result = await build().listUserRepositories();

            // Then: the list shape carries all three
            expect(result[0]).toEqual({
                id: 1,
                name: 'repo',
                fullName: 'owner/repo',
                htmlUrl: 'https://github.com/owner/repo',
                cloneUrl: 'https://github.com/owner/repo.git',
                defaultBranch: 'main',
                description: 'a demo store',
                updatedAt: '2026-05-05T00:00:00Z',
                isPrivate: true,
            });
        });

        it('drops repos with no push permission block at all', async () => {
            // Given: one repo whose permissions are absent entirely
            mockRequest.mockResolvedValue({ data: [apiRepo({ permissions: undefined })] });

            // When/Then: it is filtered out rather than treated as writable
            await expect(build().listUserRepositories()).resolves.toStrictEqual([]);
        });

        it('wraps a listing failure with its cause', async () => {
            // Given: the API fails
            mockRequest.mockRejectedValue(
                Object.assign(new Error('bad credentials'), { status: 401 })
            );

            // When/Then: the caller gets a wrapped message naming the cause
            await expect(build().listUserRepositories()).rejects.toThrow(
                'Failed to list repositories: bad credentials'
            );
        });
    });

    describe('checkRepositoryAccess', () => {
        it('reports access and the mapped repo when the user can push', async () => {
            // Given: a repository the user has write access to
            mockRequest.mockResolvedValue({ data: apiRepo({ id: 7, name: 'demo' }) });

            // When: checking access
            const result = await build().checkRepositoryAccess('owner', 'demo');

            // Then: the lookup is scoped to that repo, and the caller gets the
            // mapped repo rather than the raw API payload
            expect(mockRequest).toHaveBeenCalledWith('GET /repos/{owner}/{repo}', {
                owner: 'owner',
                repo: 'demo',
            });
            expect(result).toEqual({
                hasAccess: true,
                repo: {
                    id: 7,
                    name: 'demo',
                    fullName: 'owner/repo',
                    htmlUrl: 'https://github.com/owner/repo',
                    cloneUrl: 'https://github.com/owner/repo.git',
                    defaultBranch: 'main',
                    isTemplate: false,
                    isPrivate: false,
                },
            });
        });

        it('reports no access for a 403', async () => {
            // Given: access is refused
            mockRequest.mockRejectedValue({ status: 403 });

            // When: checking
            const result = await build().checkRepositoryAccess('owner', 'repo');

            // Then: a denial, not a throw
            expect(result).toEqual({
                hasAccess: false,
                error: 'Access denied to this repository',
            });
        });

        it('reports no access when the response carries no permissions block', async () => {
            // Given: a repo with permissions missing
            mockRequest.mockResolvedValue({ data: apiRepo({ permissions: undefined }) });

            // When: checking
            const result = await build().checkRepositoryAccess('owner', 'repo');

            // Then: absent permissions default to no write access
            expect(result).toEqual({
                hasAccess: false,
                error: 'You need write access to this repository',
            });
        });

        it('rethrows a status it cannot interpret', async () => {
            // Given: a server error
            mockRequest.mockRejectedValue(Object.assign(new Error('gateway'), { status: 502 }));

            // When/Then
            await expect(build().checkRepositoryAccess('owner', 'repo')).rejects.toThrow('gateway');
        });
    });

    describe('the cached Octokit', () => {
        it('builds one client and reuses it across calls', async () => {
            // Given: a service that has already made a request
            mockRequest.mockResolvedValue({ data: apiRepo() });
            const tokenService = createTokenService();
            const service = build(tokenService);
            await service.getRepository('owner', 'repo');

            // When: a second call is made
            await service.getRepository('owner', 'repo');

            // Then: the token is re-read each time (it can be revoked) but the
            // client is constructed only once
            expect(tokenService.getToken).toHaveBeenCalledTimes(2);
            expect(mockOctokitConstructor).toHaveBeenCalledTimes(1);
            expect(mockRequest).toHaveBeenCalledTimes(2);
        });

        it('rechecks the token on every call and refuses once it is gone', async () => {
            // Given: a service that worked once, then lost its token
            mockRequest.mockResolvedValue({ data: apiRepo() });
            const getToken = jest
                .fn()
                .mockResolvedValueOnce({ token: 'ghp_test' })
                .mockResolvedValueOnce(undefined);
            const service = build({ getToken } as unknown as GitHubTokenService);
            await service.getRepository('owner', 'repo');

            // When/Then: the cached client does not paper over the missing token
            await expect(service.getRepository('owner', 'repo')).rejects.toThrow(
                'Not authenticated'
            );
        });

        it('drops the cached client when it is invalidated', async () => {
            // Given: a service with a cached client
            mockRequest.mockResolvedValue({ data: apiRepo() });
            const service = build();
            await service.getRepository('owner', 'repo');

            // When: the client is invalidated and used again
            service.invalidateOctokit();
            await service.getRepository('owner', 'repo');

            // Then: a second client is built — without the drop, a client holding a
            // stale token would keep answering
            expect(mockOctokitConstructor).toHaveBeenCalledTimes(2);
            expect(mockRequest).toHaveBeenCalledTimes(2);
        });
    });
});
