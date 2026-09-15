/**
 * GitHubRepoOperations — the operation that shells out to git.
 *
 * `cloneRepository` was reachable by no test at all, and it is consequential: it
 * writes a repo onto the SC's disk. What can be wrong about it is the COMMAND and the
 * directory it runs in, so that is what these assert — never the fake's answer.
 * (Its sibling `resetToTemplate` was a second copy of the template reset and was
 * removed; `TemplateSyncService.resetRepository` is the one reset.)
 */

import {
    AUTHED,
    createTokenService,
    GitHubRepoOperations,
} from './githubRepoOperations.testUtils';
import { createMockCommandExecutor } from '../../../../helpers/commandExecutorFake';
import { createFailureResult, createSuccessResult } from '../../../../helpers/commandResultFake';
import { createMockLogger } from '../../../../helpers/loggerFake';
import { DEFAULT_SHELL } from '@/core/shell/defaultShell';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { GitHubTokenService } from '@/features/eds/services/github/githubTokenService';

describe('GitHubRepoOperations — git paths', () => {
    let logger: ReturnType<typeof createMockLogger>;
    let executor: ReturnType<typeof createMockCommandExecutor>;

    beforeEach(() => {
        jest.clearAllMocks();
        logger = createMockLogger();
        executor = createMockCommandExecutor();
    });

    const build = (tokenService: GitHubTokenService = createTokenService()) =>
        new GitHubRepoOperations(tokenService, executor, logger);

    describe('cloneRepository', () => {
        it('refuses to clone without a token', async () => {
            // Given: no stored token
            const service = build(createTokenService(null));

            // When/Then: it fails before running git
            await expect(
                service.cloneRepository('https://github.com/owner/repo.git', '/work/demo')
            ).rejects.toThrow('Not authenticated');
            expect(executor.execute).not.toHaveBeenCalled();
        });

        it('runs git clone with the tokenised URL from the target parent directory', async () => {
            // Given: a clone that succeeds
            executor.execute.mockResolvedValue(createSuccessResult());

            // When: cloning
            await build().cloneRepository(
                'https://github.com/owner/repo.git',
                '/work/projects/demo'
            );

            // Then: the command carries the credentialed URL and the target path, and
            // runs in the parent so git can create the target folder itself
            expect(executor.execute).toHaveBeenCalledWith(
                `git clone "${AUTHED('owner/repo.git')}" "/work/projects/demo"`,
                {
                    timeout: TIMEOUTS.LONG,
                    enhancePath: true,
                    shell: DEFAULT_SHELL,
                    cwd: '/work/projects',
                }
            );
        });

        it('fails with git stderr when the clone exits non-zero', async () => {
            // Given: git refuses
            executor.execute.mockResolvedValue(createFailureResult('fatal: repository not found'));

            // When/Then: the caller sees git's own reason
            await expect(
                build().cloneRepository('https://github.com/owner/repo.git', '/work/demo')
            ).rejects.toThrow('Git clone failed: fatal: repository not found');
        });
    });

});
