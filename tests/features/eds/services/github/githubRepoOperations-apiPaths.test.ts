/**
 * GitHubRepoOperations — the Octokit-driven paths.
 *
 * The mirror suite covers the happy paths of create/list/access/delete. This one
 * covers what no test reached: `hasContent`, `waitForContent`, `getRepository`,
 * pagination and its safety limit, the permission-shaped denials, and the cached
 * client's lifecycle.
 *
 * Assertions are on the ARGUMENTS a collaborator receives — the request route and
 * body, the poll options — because that is the only thing a mocked collaborator can
 * be wrong about.
 */

import {
    apiRepo,
    createTokenService,
    GitHubRepoOperations,
    mockOctokitConstructor,
    mockPollUntilCondition,
    mockRequest,
} from './githubRepoOperations.testUtils';
import { createMockCommandExecutor } from '../../../../helpers/commandExecutorFake';
import { createMockLogger } from '../../../../helpers/loggerFake';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { GitHubTokenService } from '@/features/eds/services/github/githubTokenService';

describe('GitHubRepoOperations — Octokit paths', () => {
    let logger: ReturnType<typeof createMockLogger>;
    let executor: ReturnType<typeof createMockCommandExecutor>;

    beforeEach(() => {
        jest.clearAllMocks();
        logger = createMockLogger();
        executor = createMockCommandExecutor();
    });

    const build = (tokenService: GitHubTokenService = createTokenService()) =>
        new GitHubRepoOperations(tokenService, executor, logger);

    describe('hasContent', () => {
        it('asks for the repository root on the default branch', async () => {
            // Given: a root listing with one entry
            mockRequest.mockResolvedValue({ data: [{ name: 'README.md' }] });

            // When: content is checked with no branch argument
            const result = await build().hasContent('owner', 'repo');

            // Then: the request targets the root path on `main`
            expect(mockRequest).toHaveBeenCalledWith('GET /repos/{owner}/{repo}/contents/{path}', {
                owner: 'owner',
                repo: 'repo',
                path: '',
                ref: 'main',
            });
            expect(result).toBe(true);
        });

        it('uses the branch it was given as the ref', async () => {
            // Given: a populated root
            mockRequest.mockResolvedValue({ data: [{ name: 'README.md' }] });

            // When: an explicit branch is passed
            await build().hasContent('owner', 'repo', 'develop');

            // Then: that branch is the ref, not the default
            expect(mockRequest).toHaveBeenCalledWith(
                'GET /repos/{owner}/{repo}/contents/{path}',
                expect.objectContaining({ ref: 'develop' })
            );
        });

        it('reports no content for an empty directory listing', async () => {
            // Given: the root lists nothing
            mockRequest.mockResolvedValue({ data: [] });

            // When/Then: an empty array is not content
            await expect(build().hasContent('owner', 'repo')).resolves.toBe(false);
        });

        it('reports no content when the response is not a directory listing', async () => {
            // Given: GitHub returns a single file object rather than an array
            mockRequest.mockResolvedValue({ data: { name: 'README.md' } });

            // When/Then: a non-array response is not content
            await expect(build().hasContent('owner', 'repo')).resolves.toBe(false);
        });

        it('treats a 404 as an empty repository', async () => {
            // Given: the branch does not exist yet
            mockRequest.mockRejectedValue({ status: 404 });

            // When/Then: the absence is an answer, not a failure
            await expect(build().hasContent('owner', 'repo')).resolves.toBe(false);
        });

        it('rethrows any status other than 404', async () => {
            // Given: the API refuses the read
            mockRequest.mockRejectedValue(Object.assign(new Error('boom'), { status: 500 }));

            // When/Then: the caller sees the failure
            await expect(build().hasContent('owner', 'repo')).rejects.toThrow('boom');
        });
    });

    describe('waitForContent', () => {
        it('polls with the repo-scoped options and reports success', async () => {
            // Given: polling resolves
            mockPollUntilCondition.mockResolvedValue(undefined);
            const abortSignal = new AbortController().signal;

            // When: waiting for content
            const result = await build().waitForContent('owner', 'repo', abortSignal);

            // Then: the poll is named for the repo and carries the configured budget
            expect(mockPollUntilCondition).toHaveBeenCalledWith(expect.any(Function), {
                name: 'github-repo-owner/repo',
                maxAttempts: 10,
                initialDelay: TIMEOUTS.POLL.INTERVAL,
                maxDelay: TIMEOUTS.POLL.MAX,
                timeout: TIMEOUTS.NORMAL,
                abortSignal,
            });
            expect(result).toBe(true);
        });

        it('reports failure when polling gives up', async () => {
            // Given: polling times out
            mockPollUntilCondition.mockRejectedValue(new Error('Polling timeout'));

            // When/Then: the caller gets false rather than a throw
            await expect(build().waitForContent('owner', 'repo')).resolves.toBe(false);
        });

        it('passes no abort signal through when the caller gave none', async () => {
            // Given: polling resolves
            mockPollUntilCondition.mockResolvedValue(undefined);

            // When: waiting without a signal
            await build().waitForContent('owner', 'repo');

            // Then: abortSignal is absent rather than fabricated
            expect(mockPollUntilCondition.mock.calls[0][1].abortSignal).toBeUndefined();
        });

        it('the poll predicate answers with the content check', async () => {
            // Given: polling captures the predicate, and the root has content
            mockPollUntilCondition.mockResolvedValue(undefined);
            mockRequest.mockResolvedValue({ data: [{ name: 'README.md' }] });
            await build().waitForContent('owner', 'repo');
            const predicate = mockPollUntilCondition.mock.calls[0][0] as () => Promise<boolean>;

            // When: the predicate runs
            const answer = await predicate();

            // Then: it reports the content check's verdict for the default branch
            expect(answer).toBe(true);
            expect(mockRequest).toHaveBeenCalledWith(
                'GET /repos/{owner}/{repo}/contents/{path}',
                expect.objectContaining({ owner: 'owner', repo: 'repo', ref: 'main' })
            );
        });

        it('the poll predicate swallows a content-check failure so polling continues', async () => {
            // Given: the captured predicate, with the content check now failing hard
            mockPollUntilCondition.mockResolvedValue(undefined);
            mockRequest.mockResolvedValue({ data: [] });
            await build().waitForContent('owner', 'repo');
            const predicate = mockPollUntilCondition.mock.calls[0][0] as () => Promise<boolean>;
            mockRequest.mockRejectedValue(
                Object.assign(new Error('rate limited'), { status: 500 })
            );

            // When/Then: the predicate resolves false instead of rejecting
            await expect(predicate()).resolves.toBe(false);
        });
    });

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
            await expect(build().listUserRepositories()).resolves.toEqual([]);
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

    describe('deleteRepository', () => {
        it('rethrows a failure that is not a missing scope', async () => {
            // Given: the repo is gone
            mockRequest.mockRejectedValue(Object.assign(new Error('not found'), { status: 404 }));

            // When/Then: the 403-only message is not applied to everything
            await expect(build().deleteRepository('owner', 'repo')).rejects.toThrow('not found');
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

    describe('createFromTemplate', () => {
        it('creates a public repository when no privacy is asked for', async () => {
            // Given: a successful create
            mockRequest.mockResolvedValue({ data: apiRepo() });

            // When: creating with the default privacy
            await build().createFromTemplate('adobe', 'template', 'demo');

            // Then: the repo is public — an SC's demo storefront has to be readable
            // by aem.live, so the default must not flip to private
            expect(mockRequest).toHaveBeenCalledWith(
                'POST /repos/{template_owner}/{template_repo}/generate',
                {
                    template_owner: 'adobe',
                    template_repo: 'template',
                    name: 'demo',
                    private: false,
                }
            );
        });

        it('passes the private flag through to the generate call', async () => {
            // Given: a successful create
            mockRequest.mockResolvedValue({ data: apiRepo() });

            // When: creating a private repo
            await build().createFromTemplate('adobe', 'template', 'demo', true);

            // Then: the request asks for a private repo under that name
            expect(mockRequest).toHaveBeenCalledWith(
                'POST /repos/{template_owner}/{template_repo}/generate',
                {
                    template_owner: 'adobe',
                    template_repo: 'template',
                    name: 'demo',
                    private: true,
                }
            );
        });

        it('rethrows a 422 that is not a name collision', async () => {
            // Given: a 422 about something else
            mockRequest.mockRejectedValue(
                Object.assign(new Error('validation failed'), {
                    status: 422,
                    errors: [{ message: 'template repository is not a template' }],
                })
            );

            // When/Then: the specific "already exists" message is not applied to every 422
            await expect(build().createFromTemplate('adobe', 'template', 'demo')).rejects.toThrow(
                'validation failed'
            );
        });

        it('only reads the name collision out of a 422', async () => {
            // Given: a 500 that happens to mention a name collision
            mockRequest.mockRejectedValue(
                Object.assign(new Error('server exploded'), {
                    status: 500,
                    errors: [{ message: 'name already exists on this account' }],
                })
            );

            // When/Then: the friendly "already exists" message belongs to 422 alone;
            // a server failure must not be reported to the SC as a naming problem
            await expect(build().createFromTemplate('adobe', 'template', 'demo')).rejects.toThrow(
                'server exploded'
            );
        });

        it('rethrows a 422 that carries no error list', async () => {
            // Given: a 422 with no `errors` array at all
            mockRequest.mockRejectedValue(
                Object.assign(new Error('unprocessable'), { status: 422 })
            );

            // When/Then: the optional lookup does not turn into a name collision
            await expect(build().createFromTemplate('adobe', 'template', 'demo')).rejects.toThrow(
                'unprocessable'
            );
        });
    });
});
