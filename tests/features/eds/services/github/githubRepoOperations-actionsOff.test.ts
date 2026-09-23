/**
 * Every repository Demo Builder creates starts with GitHub Actions turned off
 * (owner, 2026-09-15).
 *
 * A storefront's code carries its author's workflows (the aem-boilerplate's
 * "Build" runs `npm ci` and `npm run lint` on every push), and setup and reset
 * push a commit per file they write, so a new repository ran them over and over
 * and mailed the SC a failure for each: 18 in one test on 2026-09-12. The
 * workflow files are kept, because they are the author's code; Actions is
 * switched off on the repository, which the SC can turn back on in its
 * settings. Best effort: a refusal never fails the creation.
 */

import type { GitHubRepoOperations } from '@/features/eds/services/github/githubRepoOperations';
import type { GitHubTokenService } from '@/features/eds/services/github/githubTokenService';
import type { Logger } from '@/types/logger';
import { createMockCommandExecutor } from '../../../../helpers/commandExecutorFake';
import { createMockLogger } from '../../../../helpers/loggerFake';

const mockOctokitRequest = jest.fn();
jest.mock('@octokit/core', () => ({
    Octokit: {
        plugin: jest.fn(() =>
            jest.fn().mockImplementation(() => ({
                request: mockOctokitRequest,
            })),
        ),
    },
}));
jest.mock('@octokit/plugin-retry', () => ({
    retry: jest.fn(() => ({})),
}));

const CREATED = {
    id: 1,
    name: 'summit',
    full_name: 'steve/summit',
    html_url: 'https://github.com/steve/summit',
    clone_url: 'https://github.com/steve/summit.git',
    default_branch: 'main',
};
const ACTIONS_OFF = ['PUT /repos/{owner}/{repo}/actions/permissions', { owner: 'steve', repo: 'summit', enabled: false }];

describe('a repository Demo Builder creates has GitHub Actions turned off', () => {
    let operations: GitHubRepoOperations;
    let logger: Logger;

    beforeEach(async () => {
        jest.clearAllMocks();
        jest.resetModules();
        mockOctokitRequest.mockImplementation(async (route: string) =>
            route.startsWith('PUT') ? { status: 204 } : { data: CREATED },
        );
        logger = createMockLogger();
        // Imported after resetModules so each test builds its client against the mock above.
        const { GitHubRepoOperations: Operations } = await import('@/features/eds/services/github/githubRepoOperations');
        const tokenService = { getToken: jest.fn().mockResolvedValue({ token: 'fake-test-token-not-a-secret' }) };
        operations = new Operations(tokenService as unknown as GitHubTokenService, createMockCommandExecutor(), logger);
    });

    it('when generated from a template, right after the repository exists', async () => {
        await operations.createFromTemplate('adobe-commerce', 'boilerplate-b2b-template', 'summit');

        expect(mockOctokitRequest.mock.calls.map((call) => call[0])).toEqual([
            'POST /repos/{template_owner}/{template_repo}/generate',
            ACTIONS_OFF[0],
        ]);
        expect(mockOctokitRequest).toHaveBeenLastCalledWith(...ACTIONS_OFF);
    });

    it('when created empty (a demo that is not a template, or a zip), before anything is pushed', async () => {
        await operations.createEmptyRepository('summit');

        expect(mockOctokitRequest).toHaveBeenLastCalledWith(...ACTIONS_OFF);
    });

    it('still answers the created repository when GitHub refuses, and warns', async () => {
        mockOctokitRequest.mockImplementation(async (route: string) => {
            if (route.startsWith('PUT')) throw Object.assign(new Error('Resource not accessible'), { status: 403 });
            return { data: CREATED };
        });

        const repo = await operations.createEmptyRepository('summit');

        expect(repo.fullName).toBe('steve/summit');
        expect(logger.warn).toHaveBeenCalledTimes(1);
    });
});
