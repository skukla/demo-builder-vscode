/**
 * GitHubRepoOperations — the two operations that shell out to git.
 *
 * `cloneRepository` and `resetToTemplate` were reachable by no test at all, and both
 * are consequential: one writes a repo onto the SC's disk, the other force-pushes over
 * a repo on GitHub. What can be wrong about them is the COMMAND and the directory it
 * runs in, so that is what these assert — never the fake's answer.
 */

import * as os from 'os';
import * as path from 'path';
import {
    AUTHED,
    createTokenService,
    GitHubRepoOperations,
    mockMkdtemp,
    mockRm,
} from './githubRepoOperations.testUtils';
import { createMockCommandExecutor } from '../../../../helpers/commandExecutorFake';
import { createFailureResult, createSuccessResult } from '../../../../helpers/commandResultFake';
import { createMockLogger } from '../../../../helpers/loggerFake';
import { DEFAULT_SHELL } from '@/core/shell/defaultShell';
import type { CommandResult } from '@/core/shell/types';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { GitHubTokenService } from '@/features/eds/services/github/githubTokenService';

const TEMP_DIR = '/tmp/github-reset-abc';
const REPO_DIR = path.join(TEMP_DIR, 'repo');
const DEFAULT_COMMIT = 'git commit -m "chore: reset to template"';

describe('GitHubRepoOperations — git paths', () => {
    let logger: ReturnType<typeof createMockLogger>;
    let executor: ReturnType<typeof createMockCommandExecutor>;

    beforeEach(() => {
        jest.clearAllMocks();
        logger = createMockLogger();
        executor = createMockCommandExecutor();
        mockMkdtemp.mockResolvedValue(TEMP_DIR);
        mockRm.mockResolvedValue(undefined);
    });

    const build = (tokenService: GitHubTokenService = createTokenService()) =>
        new GitHubRepoOperations(tokenService, executor, logger);

    /** The commands actually run, in order. */
    const commandsRun = () =>
        executor.execute.mock.calls.map((call: unknown[]) => call[0] as string);

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

    describe('resetToTemplate', () => {
        /** Route each git command to a result; anything unlisted succeeds silently. */
        const routeGit = (overrides: Record<string, CommandResult> = {}) => {
            executor.execute.mockImplementation(async (command: string) => {
                for (const [needle, result] of Object.entries(overrides)) {
                    if (command.includes(needle)) return result;
                }
                if (command.includes('status --porcelain')) return createSuccessResult('M file\n');
                if (command.includes('rev-parse')) return createSuccessResult('deadbeef\n');
                return createSuccessResult();
            });
        };
        /** The options every command in the sequence shares, apart from cwd/timeout. */
        const at = (cwd: string, timeout: number) => ({ cwd, timeout, shell: DEFAULT_SHELL });

        it('refuses to reset without a token', async () => {
            // Given: no stored token
            const service = build(createTokenService(null));

            // When/Then: nothing is cloned
            await expect(
                service.resetToTemplate('owner', 'repo', 'adobe', 'template')
            ).rejects.toThrow('Not authenticated');
            expect(mockMkdtemp).not.toHaveBeenCalled();
        });

        it('works in a fresh temp directory and removes it afterwards', async () => {
            // Given: a clean run
            routeGit();

            // When: resetting
            await build().resetToTemplate('owner', 'repo', 'adobe', 'template');

            // Then: the scratch directory is created under the OS temp root and
            // removed recursively when the operation ends
            expect(mockMkdtemp).toHaveBeenCalledWith(path.join(os.tmpdir(), 'github-reset-'));
            expect(mockRm).toHaveBeenCalledWith(TEMP_DIR, { recursive: true, force: true });
        });

        it('drives the full git sequence and returns the new commit sha', async () => {
            // Given: a repo whose content differs from the template
            routeGit();

            // When: resetting the default branch
            const result = await build().resetToTemplate('owner', 'repo', 'adobe', 'template');

            // Then: each step runs in the right directory with its own budget,
            // in the order that makes the reset correct
            const calls = commandsRun();
            expect(calls).toEqual([
                `git clone --depth 1 --branch main "${AUTHED('owner/repo.git')}" repo`,
                'git remote add template "https://github.com/adobe/template.git"',
                'git fetch template main',
                'git read-tree --reset -u template/main',
                'git add -A',
                'git status --porcelain',
                DEFAULT_COMMIT,
                'git rev-parse HEAD',
                'git push origin main --force',
            ]);
            expect(executor.execute).toHaveBeenNthCalledWith(
                1,
                calls[0],
                at(TEMP_DIR, TIMEOUTS.LONG)
            );
            expect(executor.execute).toHaveBeenNthCalledWith(
                2,
                calls[1],
                at(REPO_DIR, TIMEOUTS.QUICK)
            );
            expect(executor.execute).toHaveBeenNthCalledWith(
                3,
                calls[2],
                at(REPO_DIR, TIMEOUTS.LONG)
            );
            expect(executor.execute).toHaveBeenNthCalledWith(
                4,
                calls[3],
                at(REPO_DIR, TIMEOUTS.NORMAL)
            );
            expect(executor.execute).toHaveBeenNthCalledWith(
                5,
                calls[4],
                at(REPO_DIR, TIMEOUTS.QUICK)
            );
            expect(executor.execute).toHaveBeenNthCalledWith(
                6,
                calls[5],
                at(REPO_DIR, TIMEOUTS.QUICK)
            );
            expect(executor.execute).toHaveBeenNthCalledWith(
                7,
                calls[6],
                at(REPO_DIR, TIMEOUTS.QUICK)
            );
            expect(executor.execute).toHaveBeenNthCalledWith(
                8,
                calls[7],
                at(REPO_DIR, TIMEOUTS.QUICK)
            );
            expect(executor.execute).toHaveBeenNthCalledWith(
                9,
                calls[8],
                at(REPO_DIR, TIMEOUTS.LONG)
            );
            expect(result).toEqual({ commitSha: 'deadbeef' });
        });

        it('honours the branch and commit message it was given', async () => {
            // Given: a non-default branch and message
            routeGit();

            // When: resetting
            await build().resetToTemplate(
                'owner',
                'repo',
                'adobe',
                'template',
                'develop',
                'chore: rebuild'
            );

            // Then: every branch-bearing command names that branch, and the commit
            // carries the caller's message
            const calls = commandsRun();
            expect(calls).toContain(
                `git clone --depth 1 --branch develop "${AUTHED('owner/repo.git')}" repo`
            );
            expect(calls).toContain('git fetch template develop');
            expect(calls).toContain('git read-tree --reset -u template/develop');
            expect(calls).toContain('git commit -m "chore: rebuild"');
            expect(calls).toContain('git push origin develop --force');
        });

        it('skips the commit when the working tree matches the template', async () => {
            // Given: git status reports only whitespace — nothing changed
            routeGit({ 'status --porcelain': createSuccessResult('   \n') });

            // When: resetting
            const result = await build().resetToTemplate('owner', 'repo', 'adobe', 'template');

            // Then: no commit is made, but the existing HEAD is still reported and pushed
            const calls = commandsRun();
            expect(calls).not.toContain(DEFAULT_COMMIT);
            expect(calls).toContain('git rev-parse HEAD');
            expect(executor.execute).toHaveBeenCalledWith(
                'git rev-parse HEAD',
                at(REPO_DIR, TIMEOUTS.QUICK)
            );
            expect(result).toEqual({ commitSha: 'deadbeef' });
        });

        it('stops when the user repo cannot be cloned', async () => {
            // Given: the shallow clone fails
            routeGit({ 'git clone': createFailureResult('fatal: could not read') });

            // When/Then: the failure names the step, and no remote is added
            await expect(
                build().resetToTemplate('owner', 'repo', 'adobe', 'template')
            ).rejects.toThrow('Failed to clone user repo: fatal: could not read');
            expect(commandsRun()).toEqual([expect.stringContaining('git clone')]);
        });

        it('stops when the template cannot be fetched', async () => {
            // Given: the fetch fails
            routeGit({ 'git fetch': createFailureResult('fatal: no such remote ref') });

            // When/Then: the reset never reaches read-tree
            await expect(
                build().resetToTemplate('owner', 'repo', 'adobe', 'template')
            ).rejects.toThrow('Failed to fetch template: fatal: no such remote ref');
            expect(commandsRun()).not.toContain('git read-tree --reset -u template/main');
        });

        it('stops when the template tree cannot be read into the working copy', async () => {
            // Given: read-tree fails
            routeGit({ 'read-tree': createFailureResult('error: sparse checkout') });

            // When/Then: nothing is staged
            await expect(
                build().resetToTemplate('owner', 'repo', 'adobe', 'template')
            ).rejects.toThrow('Failed to read template tree: error: sparse checkout');
            expect(commandsRun()).not.toContain('git add -A');
        });

        it('stops when the reset commit fails', async () => {
            // Given: commit fails
            routeGit({ 'git commit': createFailureResult('nothing to commit') });

            // When/Then: no sha is read and nothing is pushed
            await expect(
                build().resetToTemplate('owner', 'repo', 'adobe', 'template')
            ).rejects.toThrow('Failed to commit: nothing to commit');
            expect(commandsRun()).not.toContain('git rev-parse HEAD');
        });

        it('stops when the force push is rejected', async () => {
            // Given: the push fails
            routeGit({ 'git push': createFailureResult('protected branch') });

            // When/Then: the caller learns the push failed, not that the reset worked
            await expect(
                build().resetToTemplate('owner', 'repo', 'adobe', 'template')
            ).rejects.toThrow('Failed to push: protected branch');
        });

        it('still removes the temp directory when the reset fails', async () => {
            // Given: a failing push
            routeGit({ 'git push': createFailureResult('protected branch') });

            // When: the reset throws
            await expect(
                build().resetToTemplate('owner', 'repo', 'adobe', 'template')
            ).rejects.toThrow('Failed to push');

            // Then: the scratch directory is still cleaned up
            expect(mockRm).toHaveBeenCalledWith(TEMP_DIR, { recursive: true, force: true });
        });

        it('does not fail the reset when the temp directory cannot be removed', async () => {
            // Given: a successful reset whose cleanup fails
            routeGit();
            mockRm.mockRejectedValue(new Error('EBUSY'));

            // When/Then: the sha is still returned
            await expect(
                build().resetToTemplate('owner', 'repo', 'adobe', 'template')
            ).resolves.toEqual({ commitSha: 'deadbeef' });
        });
    });
});
