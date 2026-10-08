/**
 * GitHubRepoLifecycle — the Octokit-driven paths.
 *
 * The mirror suite covers the happy paths of create/delete/archive. This one
 * covers `hasContent`, `waitForContent` and its poll predicate, the 422 reading
 * of a create, and the delete's non-403 failure. Moved from
 * githubRepoOperations-apiPaths.test.ts with the code on 2026-10-08 (EDS-8).
 *
 * Assertions are on the ARGUMENTS a collaborator receives — the request route and
 * body, the poll options — because that is the only thing a mocked collaborator can
 * be wrong about.
 */

import {
    apiRepo,
    createTokenService,
    GitHubRepoLifecycle,
    mockPollUntilCondition,
    mockRequest,
} from './githubRepoLifecycle.testUtils';
import { createMockLogger } from '../../../../helpers/loggerFake';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

describe('GitHubRepoLifecycle — Octokit paths', () => {
    let logger: ReturnType<typeof createMockLogger>;

    beforeEach(() => {
        jest.clearAllMocks();
        logger = createMockLogger();
    });

    const build = () => new GitHubRepoLifecycle(createTokenService(), logger);

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

    describe('deleteRepository', () => {
        it('rethrows a failure that is not a missing scope', async () => {
            // Given: the repo is gone
            mockRequest.mockRejectedValue(Object.assign(new Error('not found'), { status: 404 }));

            // When/Then: the 403-only message is not applied to everything
            await expect(build().deleteRepository('owner', 'repo')).rejects.toThrow('not found');
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

    describe('createEmptyRepository', () => {
        // Measured 2026-10-08 on the first run of the split: every branch below
        // was NoCoverage. The method landed 2026-10-04, after the old file's
        // baseline row, and only the Actions-off and org-refusal suites touched it.
        it('creates a public, initialised repository under the authenticated user by default', async () => {
            mockRequest.mockResolvedValue({ data: apiRepo({ name: 'demo', full_name: 'me/demo' }) });

            const created = await build().createEmptyRepository('demo');

            expect(mockRequest).toHaveBeenNthCalledWith(1, 'POST /user/repos', {
                name: 'demo',
                private: false,
                auto_init: true,
            });
            expect(created.fullName).toBe('me/demo');
        });

        it('passes the private flag through', async () => {
            mockRequest.mockResolvedValue({ data: apiRepo() });

            await build().createEmptyRepository('demo', true);

            expect(mockRequest).toHaveBeenNthCalledWith(
                1,
                'POST /user/repos',
                expect.objectContaining({ private: true }),
            );
        });

        it('creates under the organization when a target owner is given', async () => {
            mockRequest.mockResolvedValue({ data: apiRepo() });

            await build().createEmptyRepository('demo', false, 'acme');

            expect(mockRequest).toHaveBeenNthCalledWith(1, 'POST /orgs/{org}/repos', {
                org: 'acme',
                name: 'demo',
                private: false,
                auto_init: true,
            });
        });

        it('turns a 422 name collision into "Repository name already exists"', async () => {
            mockRequest.mockRejectedValue(
                Object.assign(new Error('Validation Failed'), {
                    status: 422,
                    errors: [{ message: 'name already exists on this account' }],
                }),
            );

            await expect(build().createEmptyRepository('demo')).rejects.toThrow(
                'Repository name already exists',
            );
        });

        it('rethrows a 422 that is not a name collision', async () => {
            mockRequest.mockRejectedValue(
                Object.assign(new Error('Validation Failed'), {
                    status: 422,
                    errors: [{ message: 'name is too long' }],
                }),
            );

            await expect(build().createEmptyRepository('demo')).rejects.toThrow('Validation Failed');
        });

        it('falls back to the user namespace when GitHub answers 404 for the organization', async () => {
            mockRequest
                .mockRejectedValueOnce(Object.assign(new Error('Not Found'), { status: 404 }))
                .mockResolvedValueOnce({ data: apiRepo({ full_name: 'me/demo' }) });

            const created = await build().createEmptyRepository('demo', false, 'acme');

            expect(mockRequest).toHaveBeenNthCalledWith(1, 'POST /orgs/{org}/repos', expect.objectContaining({ org: 'acme' }));
            expect(mockRequest).toHaveBeenNthCalledWith(2, 'POST /user/repos', {
                name: 'demo',
                private: false,
                auto_init: true,
            });
            expect(created.fullName).toBe('me/demo');
        });

        it('rethrows a 404 when no organization was targeted', async () => {
            mockRequest.mockRejectedValue(Object.assign(new Error('Not Found'), { status: 404 }));

            await expect(build().createEmptyRepository('demo')).rejects.toThrow('Not Found');
            expect(mockRequest).toHaveBeenCalledTimes(1);
        });

        it('rethrows any other failure without trying the user namespace', async () => {
            // The user route is made to succeed on purpose: a fallback that ran on
            // every failure would swallow the error and this would resolve. (Not a
            // queued once-value: clearAllMocks does not drain those, and an unused
            // one leaks into the next test.)
            mockRequest.mockImplementation(async (route: string) => {
                if (route.startsWith('POST /orgs')) throw Object.assign(new Error('gateway'), { status: 502 });
                return { data: apiRepo() };
            });

            await expect(build().createEmptyRepository('demo', false, 'acme')).rejects.toThrow('gateway');
            expect(mockRequest).toHaveBeenCalledTimes(1);
        });

        it('only reads the name collision out of a 422', async () => {
            mockRequest.mockRejectedValue(
                Object.assign(new Error('server exploded'), {
                    status: 500,
                    errors: [{ message: 'name already exists on this account' }],
                }),
            );

            await expect(build().createEmptyRepository('demo')).rejects.toThrow('server exploded');
        });

        it('rethrows a 422 that carries no error list', async () => {
            mockRequest.mockRejectedValue(Object.assign(new Error('unprocessable'), { status: 422 }));

            await expect(build().createEmptyRepository('demo')).rejects.toThrow('unprocessable');
        });

        it('finds the name collision anywhere in the error list', async () => {
            mockRequest.mockRejectedValue(
                Object.assign(new Error('Validation Failed'), {
                    status: 422,
                    errors: [{ message: 'name is too long' }, { message: 'name already exists on this account' }],
                }),
            );

            await expect(build().createEmptyRepository('demo')).rejects.toThrow('Repository name already exists');
        });
    });

    describe('setTemplateFlag', () => {
        it('marks the repository a template by default', async () => {
            mockRequest.mockResolvedValue({ data: {} });

            await build().setTemplateFlag('me', 'demo');

            expect(mockRequest).toHaveBeenCalledWith('PATCH /repos/{owner}/{repo}', {
                owner: 'me',
                repo: 'demo',
                is_template: true,
            });
        });

        it('clears the flag when asked', async () => {
            mockRequest.mockResolvedValue({ data: {} });

            await build().setTemplateFlag('me', 'demo', false);

            expect(mockRequest).toHaveBeenCalledWith(
                'PATCH /repos/{owner}/{repo}',
                expect.objectContaining({ is_template: false }),
            );
        });
    });
});
