/**
 * Forking into the SC's account: the one repo-level mutation "keep my own copy
 * of this demo" makes. Beside the other repo mutations, where the chokepoint
 * pin keeps every GitHub write.
 */

import {
    GitHubRepoOperations,
    apiRepo,
    createTokenService,
    mockRequest,
} from './githubRepoOperations.testUtils';
import { createMockCommandExecutor } from '../../../../helpers/commandExecutorFake';
import { createMockLogger } from '../../../../helpers/loggerFake';
import type { GitHubTokenService } from '@/features/eds/services/github/githubTokenService';

const build = (tokenService: GitHubTokenService = createTokenService()) =>
    new GitHubRepoOperations(tokenService, createMockCommandExecutor(), createMockLogger());

describe('GitHubRepoOperations.createFork', () => {
    beforeEach(() => jest.clearAllMocks());

    it('asks GitHub for a fork of every branch and maps the answer, naming the parent', async () => {
        mockRequest.mockResolvedValue({ data: apiRepo({ id: 9, name: 'isle5-demo', full_name: 'steve/isle5-demo' }) });

        const fork = await build().createFork('jen', 'isle5-demo');

        expect(mockRequest).toHaveBeenCalledWith('POST /repos/{owner}/{repo}/forks', {
            owner: 'jen',
            repo: 'isle5-demo',
            default_branch_only: false,
        });
        expect(fork).toEqual({
            id: 9,
            name: 'isle5-demo',
            fullName: 'steve/isle5-demo',
            htmlUrl: 'https://github.com/owner/repo',
            cloneUrl: 'https://github.com/owner/repo.git',
            defaultBranch: 'main',
            isTemplate: false,
            isPrivate: false,
            forkParent: 'jen/isle5-demo',
        });
    });

    it('refuses without a token, before any request', async () => {
        await expect(build(createTokenService(null)).createFork('jen', 'isle5-demo')).rejects.toThrow();
        expect(mockRequest).not.toHaveBeenCalled();
    });

    it('translates a 404 and a 403 into the words the other repo readers use', async () => {
        mockRequest.mockRejectedValueOnce(Object.assign(new Error('x'), { status: 404 }));
        await expect(build().createFork('jen', 'gone')).rejects.toThrow('Repository not found');
        mockRequest.mockRejectedValueOnce(Object.assign(new Error('x'), { status: 403 }));
        await expect(build().createFork('jen', 'locked')).rejects.toThrow('Access denied');
    });
});
