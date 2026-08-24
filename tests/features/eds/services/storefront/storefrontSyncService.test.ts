/**
 * Storefront Sync Service Tests
 *
 * Verifies the vscode-free orchestration of:
 *   git add -A → git commit → git push (with token) → Helix preview+publish
 *
 * Targets the contract — git operations are mocked at the child_process layer
 * and the Helix call is mocked via helixApiClient.
 */

import * as childProcess from 'child_process';
import { previewAndPublishPage } from '@/features/eds/services/helix/helixApiClient';
import {
    GitOperationError,
    PushRejectedError,
    rebaseOntoRemote,
    syncAndPublish,
} from '@/features/eds/services/storefront/storefrontSyncService';

jest.mock('child_process', () => ({
    execFile: jest.fn(),
}));

jest.mock('@/features/eds/services/helix/helixApiClient', () => ({
    previewAndPublishPage: jest.fn(),
}));

// `util.promisify(execFile)` returns a Promise-returning wrapper. The mock
// above is the callback form; we drive it from tests by configuring
// `execFile.mock.implementation`.

const execFileMock = childProcess.execFile as unknown as jest.Mock;
const previewMock = previewAndPublishPage as jest.Mock;

const STOREFRONT = '/projects/demo/components/eds-storefront';

function defaultExecImpl(): void {
    execFileMock.mockImplementation((cmd: string, args: string[], cb: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
        // remote get-url returns a sample URL when asked
        if (args.includes('remote') && args.includes('get-url')) {
            cb(null, { stdout: 'https://github.com/owner/repo.git\n', stderr: '' });
            return;
        }
        cb(null, { stdout: '', stderr: '' });
    });
}

function execImplWithCommitFailure(message: string): void {
    execFileMock.mockImplementation((cmd: string, args: string[], cb: (err: Error | null, result?: { stdout: string; stderr: string }) => void) => {
        if (args.includes('remote') && args.includes('get-url')) {
            cb(null, { stdout: 'https://github.com/owner/repo.git\n', stderr: '' });
            return;
        }
        if (args.includes('commit')) {
            const err = new Error('Command failed') as NodeJS.ErrnoException & { stderr?: string };
            err.stderr = message;
            cb(err);
            return;
        }
        cb(null, { stdout: '', stderr: '' });
    });
}

function execImplWithPushRejected(): void {
    execFileMock.mockImplementation((cmd: string, args: string[], cb: (err: Error | null, result?: { stdout: string; stderr: string }) => void) => {
        if (args.includes('remote') && args.includes('get-url')) {
            cb(null, { stdout: 'https://github.com/owner/repo.git\n', stderr: '' });
            return;
        }
        if (args.includes('push')) {
            const err = new Error('Command failed') as NodeJS.ErrnoException & { stderr?: string };
            err.stderr = '! [rejected] main -> main (non-fast-forward)\nerror: failed to push some refs';
            cb(err);
            return;
        }
        cb(null, { stdout: '', stderr: '' });
    });
}

/** Fail `git push` with an arbitrary stderr, for rejection-classification tests. */
function execImplWithPushStderr(stderr: string): void {
    execFileMock.mockImplementation((cmd: string, args: string[], cb: (err: Error | null, result?: { stdout: string; stderr: string }) => void) => {
        if (args.includes('remote') && args.includes('get-url')) {
            cb(null, { stdout: 'https://github.com/owner/repo.git\n', stderr: '' });
            return;
        }
        if (args.includes('push')) {
            const err = new Error('Command failed') as NodeJS.ErrnoException & { stderr?: string };
            err.stderr = stderr;
            cb(err);
            return;
        }
        cb(null, { stdout: '', stderr: '' });
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    defaultExecImpl();
    previewMock.mockResolvedValue(undefined);
});

describe('storefrontSyncService.syncAndPublish', () => {
    describe('git operations', () => {
        it('runs git add -A in the storefront directory', async () => {
            await syncAndPublish({ storefrontPath: STOREFRONT, commitMessage: 'msg' });

            const addCall = execFileMock.mock.calls.find(c => c[1].includes('add'));
            expect(addCall?.[1]).toEqual(['-C', STOREFRONT, 'add', '-A']);
        });

        it('runs git commit with the sanitized message', async () => {
            await syncAndPublish({
                storefrontPath: STOREFRONT,
                commitMessage: 'first\nsecond\rthird',
            });

            const commitCall = execFileMock.mock.calls.find(c => c[1].includes('commit'));
            expect(commitCall?.[1]).toEqual(['-C', STOREFRONT, 'commit', '-m', 'first second third']);
        });

        it('reports committed=false and skips push when there is nothing to commit', async () => {
            execImplWithCommitFailure('nothing to commit, working tree clean');

            const result = await syncAndPublish({ storefrontPath: STOREFRONT, commitMessage: 'msg' });

            expect(result.committed).toBe(false);
            // Legacy semantics: don't push when nothing changed. Users with
            // unpushed local commits use `git push` directly.
            expect(result.pushed).toBe(false);
            expect(execFileMock.mock.calls.some(c => c[1].includes('push'))).toBe(false);
        });

        it('throws GitOperationError on commit failure unrelated to "nothing to commit"', async () => {
            execImplWithCommitFailure('some other git error');

            await expect(
                syncAndPublish({ storefrontPath: STOREFRONT, commitMessage: 'msg' }),
            ).rejects.toBeInstanceOf(GitOperationError);
        });

        it('throws PushRejectedError when git push reports non-fast-forward', async () => {
            execImplWithPushRejected();

            await expect(
                syncAndPublish({ storefrontPath: STOREFRONT, commitMessage: 'msg' }),
            ).rejects.toBeInstanceOf(PushRejectedError);
        });
    });

    describe('push blocked by a repository ruleset', () => {
        /**
         * GitHub prints `! [remote rejected] main -> main (push declined due to
         * repository rule violations)` when push protection or another ruleset rule
         * refuses the push. That contains "rejected", so the non-fast-forward branch
         * claimed it — telling the user to pull and rebase. Rebasing cannot clear a
         * ruleset rejection, so the advice loops them forever.
         */
        const RULESET_STDERR =
            'remote: error: GH013: Repository rule violations found for refs/heads/main.\n' +
            'remote: - Push cannot contain secrets\n' +
            '! [remote rejected] main -> main (push declined due to repository rule violations)\n' +
            'error: failed to push some refs';

        it('does not tell the user to pull and rebase', async () => {
            execImplWithPushStderr(RULESET_STDERR);

            await expect(
                syncAndPublish({ storefrontPath: STOREFRONT, commitMessage: 'msg' }),
            ).rejects.not.toThrow(/pull and rebase/i);
        });

        it('says the repository rules blocked the push', async () => {
            execImplWithPushStderr(RULESET_STDERR);

            await expect(
                syncAndPublish({ storefrontPath: STOREFRONT, commitMessage: 'msg' }),
            ).rejects.toThrow(/rule/i);
        });

        it('still treats a real non-fast-forward as one', async () => {
            // The existing behaviour must survive: this remedy IS pull-and-rebase.
            execImplWithPushStderr(
                '! [rejected] main -> main (non-fast-forward)\nerror: failed to push some refs',
            );

            await expect(
                syncAndPublish({ storefrontPath: STOREFRONT, commitMessage: 'msg' }),
            ).rejects.toThrow(/pull and rebase/i);
        });
    });

    describe('pre-sync fast-forward', () => {
        // The storefront's GitHub remote also receives commits the local clone
        // never sees (config.json republish, fstab writes, asset vendoring all
        // commit through the GitHub API). Those leave the clone behind and the
        // next push is rejected. A fetch + ff-only merge up front closes the gap.

        it('fast-forwards the clone before staging when a token is provided', async () => {
            await syncAndPublish({
                storefrontPath: STOREFRONT,
                commitMessage: 'msg',
                githubToken: 'gh-token-abc',
            });

            const calls = execFileMock.mock.calls;
            const ffIdx = calls.findIndex(c => c[1].includes('pull') && c[1].includes('--ff-only'));
            const addIdx = calls.findIndex(c => c[1].includes('add'));
            expect(ffIdx).toBeGreaterThanOrEqual(0);
            expect(addIdx).toBeGreaterThanOrEqual(0);
            // Fast-forward must run BEFORE staging, or staged changes block the merge.
            expect(ffIdx).toBeLessThan(addIdx);
            // Pulls from a token-injected URL (same pattern as push).
            expect(calls[ffIdx][1].some((a: string) => a.includes('gh-token-abc'))).toBe(true);
        });

        it('uses a plain git pull --ff-only when no token is provided', async () => {
            await syncAndPublish({ storefrontPath: STOREFRONT, commitMessage: 'msg' });

            const ffCall = execFileMock.mock.calls.find(
                c => c[1].includes('pull') && c[1].includes('--ff-only'),
            );
            expect(ffCall?.[1]).toEqual(['-C', STOREFRONT, 'pull', '--ff-only']);
        });

        it('still commits and pushes when the fast-forward fails (best-effort)', async () => {
            // Diverged history / dirty file: ff-only pull fails. Sync must continue.
            execFileMock.mockImplementation((cmd: string, args: string[], cb: (err: Error | null, result?: { stdout: string; stderr: string }) => void) => {
                if (args.includes('remote') && args.includes('get-url')) {
                    cb(null, { stdout: 'https://github.com/owner/repo.git\n', stderr: '' });
                    return;
                }
                if (args.includes('pull') && args.includes('--ff-only')) {
                    const err = new Error('Command failed') as NodeJS.ErrnoException & { stderr?: string };
                    err.stderr = 'fatal: Not possible to fast-forward, aborting.';
                    cb(err);
                    return;
                }
                cb(null, { stdout: '', stderr: '' });
            });

            const result = await syncAndPublish({ storefrontPath: STOREFRONT, commitMessage: 'msg' });

            expect(result.pushed).toBe(true);
            expect(execFileMock.mock.calls.some(c => c[1].includes('push'))).toBe(true);
        });

        it('skips the fast-forward on the rebase-recovery path (skipCommit=true)', async () => {
            await syncAndPublish({
                storefrontPath: STOREFRONT,
                commitMessage: 'msg',
                githubToken: 'gh-token-abc',
                skipCommit: true,
            });

            const ranFastForward = execFileMock.mock.calls.some(
                c => c[1].includes('pull') && c[1].includes('--ff-only'),
            );
            expect(ranFastForward).toBe(false);
        });
    });

    describe('token injection', () => {
        it('pushes with token-injected URL when githubToken is provided', async () => {
            await syncAndPublish({
                storefrontPath: STOREFRONT,
                commitMessage: 'msg',
                githubToken: 'gh-token-abc',
            });

            const pushCall = execFileMock.mock.calls.find(c => c[1].includes('push'));
            expect(pushCall?.[1].some((a: string) => a.includes('gh-token-abc'))).toBe(true);
            expect(pushCall?.[1]).toContain('HEAD');
        });

        it('falls back to ambient git auth when githubToken is omitted', async () => {
            await syncAndPublish({ storefrontPath: STOREFRONT, commitMessage: 'msg' });

            const pushCall = execFileMock.mock.calls.find(c => c[1].includes('push'));
            expect(pushCall?.[1]).toEqual(['-C', STOREFRONT, 'push']);
        });
    });

    describe('Helix chain', () => {
        it('calls previewAndPublishPage when both tokens AND githubRepo are present', async () => {
            await syncAndPublish({
                storefrontPath: STOREFRONT,
                commitMessage: 'msg',
                githubRepo: { owner: 'owner', site: 'repo', branch: 'main' },
                githubToken: 'gh-token',
                daLiveToken: 'dalive-ims',
            });

            expect(previewMock).toHaveBeenCalledWith(
                'owner', 'repo', '/', 'main',
                { githubToken: 'gh-token', daLiveToken: 'dalive-ims' },
            );
        });

        it('reports helixPublished=true on success', async () => {
            const result = await syncAndPublish({
                storefrontPath: STOREFRONT,
                commitMessage: 'msg',
                githubRepo: { owner: 'owner', site: 'repo' },
                githubToken: 'gh-token',
                daLiveToken: 'dalive-ims',
            });

            expect(result.helixPublished).toBe(true);
        });

        it('skips Helix when daLiveToken is missing', async () => {
            await syncAndPublish({
                storefrontPath: STOREFRONT,
                commitMessage: 'msg',
                githubRepo: { owner: 'owner', site: 'repo' },
                githubToken: 'gh-token',
            });

            expect(previewMock).not.toHaveBeenCalled();
        });

        it('skips Helix when githubToken is missing', async () => {
            await syncAndPublish({
                storefrontPath: STOREFRONT,
                commitMessage: 'msg',
                githubRepo: { owner: 'owner', site: 'repo' },
                daLiveToken: 'dalive-ims',
            });

            expect(previewMock).not.toHaveBeenCalled();
        });

        it('skips Helix when githubRepo is missing', async () => {
            await syncAndPublish({
                storefrontPath: STOREFRONT,
                commitMessage: 'msg',
                githubToken: 'gh-token',
                daLiveToken: 'dalive-ims',
            });

            expect(previewMock).not.toHaveBeenCalled();
        });

        it('skips Helix when skipHelix=true even with all tokens', async () => {
            await syncAndPublish({
                storefrontPath: STOREFRONT,
                commitMessage: 'msg',
                githubRepo: { owner: 'owner', site: 'repo' },
                githubToken: 'gh-token',
                daLiveToken: 'dalive-ims',
                skipHelix: true,
            });

            expect(previewMock).not.toHaveBeenCalled();
        });
    });

    describe('pushed commit sha', () => {
        // The one per-call fact that separates "the CDN has not caught up" from
        // "my work is gone". Without it the caller has only the rendered site to
        // go on, and the site is exactly what lags.

        it('reports the short sha of the commit it pushed', async () => {
            execFileMock.mockImplementation((cmd: string, args: string[], cb: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
                if (args.includes('rev-parse')) {
                    cb(null, { stdout: 'a1b2c3d\n', stderr: '' });
                    return;
                }
                cb(null, { stdout: '', stderr: '' });
            });

            const result = await syncAndPublish({ storefrontPath: STOREFRONT, commitMessage: 'msg' });

            expect(result.commitSha).toBe('a1b2c3d');
        });

        it('leaves commitSha undefined rather than failing a sync that already pushed', async () => {
            execFileMock.mockImplementation((cmd: string, args: string[], cb: (err: Error | null, result?: { stdout: string; stderr: string }) => void) => {
                if (args.includes('rev-parse')) {
                    cb(new Error('fatal: ambiguous argument'));
                    return;
                }
                cb(null, { stdout: '', stderr: '' });
            });

            const result = await syncAndPublish({ storefrontPath: STOREFRONT, commitMessage: 'msg' });

            expect(result.pushed).toBe(true);
            expect(result.commitSha).toBeUndefined();
        });

        it('does not report a sha when nothing was committed', async () => {
            execImplWithCommitFailure('nothing to commit, working tree clean');

            const result = await syncAndPublish({ storefrontPath: STOREFRONT, commitMessage: 'msg' });

            expect(result.commitSha).toBeUndefined();
        });
    });

    describe('push rejection carries its cause', () => {
        // The two rejections both say "rejected" in stderr and have opposite
        // remedies. Callers that retry must branch on `reason`, never the text.

        it('tags a non-fast-forward rejection', async () => {
            execImplWithPushRejected();

            await expect(
                syncAndPublish({ storefrontPath: STOREFRONT, commitMessage: 'msg' }),
            ).rejects.toMatchObject({ reason: 'non-fast-forward' });
        });

        it('tags a ruleset rejection', async () => {
            execImplWithPushStderr(
                'remote: error: GH013: Repository rule violations found for refs/heads/main.\n' +
                    '! [remote rejected] main -> main (push declined due to repository rule violations)',
            );

            await expect(
                syncAndPublish({ storefrontPath: STOREFRONT, commitMessage: 'msg' }),
            ).rejects.toMatchObject({ reason: 'ruleset' });
        });
    });

    describe('rebaseOntoRemote', () => {
        // The riskiest code in this module: it runs inside someone else's
        // checkout. A half-rebased working tree is worse than the rejected push
        // it is recovering from, so the abort matters more than the retry.

        it('reports clean when the rebase succeeds', async () => {
            const outcome = await rebaseOntoRemote(STOREFRONT);

            expect(outcome).toBe('clean');
            const pullCall = execFileMock.mock.calls.find(
                c => c[1].includes('pull') && c[1].includes('--rebase'),
            );
            expect(pullCall?.[1]).toEqual(['-C', STOREFRONT, 'pull', '--rebase']);
        });

        it('pulls from a token-injected URL when a token is provided', async () => {
            await rebaseOntoRemote(STOREFRONT, 'gh-token-abc');

            const pullCall = execFileMock.mock.calls.find(
                c => c[1].includes('pull') && c[1].includes('--rebase'),
            );
            expect(pullCall?.[1].some((a: string) => a.includes('gh-token-abc'))).toBe(true);
        });

        it('runs git rebase --abort and reports aborted when the rebase conflicts', async () => {
            execFileMock.mockImplementation((cmd: string, args: string[], cb: (err: Error | null, result?: { stdout: string; stderr: string }) => void) => {
                if (args.includes('pull') && args.includes('--rebase')) {
                    const err = new Error('Command failed') as NodeJS.ErrnoException & { stderr?: string };
                    err.stderr = 'CONFLICT (content): Merge conflict in blocks/hero/hero.js';
                    cb(err);
                    return;
                }
                cb(null, { stdout: '', stderr: '' });
            });

            const outcome = await rebaseOntoRemote(STOREFRONT);

            expect(outcome).toBe('aborted');
            const abortCall = execFileMock.mock.calls.find(c => c[1].includes('--abort'));
            expect(abortCall?.[1]).toEqual(['-C', STOREFRONT, 'rebase', '--abort']);
        });

        it('still reports aborted when git rebase --abort itself fails', async () => {
            // No rebase in progress: the pull refused before starting one. There
            // is nothing to undo, and the caller must not be told otherwise.
            execFileMock.mockImplementation((cmd: string, args: string[], cb: (err: Error | null, result?: { stdout: string; stderr: string }) => void) => {
                if (args.includes('pull') && args.includes('--rebase')) {
                    const err = new Error('Command failed') as NodeJS.ErrnoException & { stderr?: string };
                    err.stderr = 'error: cannot pull with rebase: You have unstaged changes.';
                    cb(err);
                    return;
                }
                if (args.includes('--abort')) {
                    cb(new Error('fatal: No rebase in progress?'));
                    return;
                }
                cb(null, { stdout: '', stderr: '' });
            });

            await expect(rebaseOntoRemote(STOREFRONT)).resolves.toBe('aborted');
        });
    });

    describe('does not import vscode', () => {
        it('module file has no `import * as vscode` or `from "vscode"`', () => {

            const fs = require('fs') as typeof import('fs');

            const path = require('path') as typeof import('path');
            const source = fs.readFileSync(
                path.join(__dirname, '../../../../../src/features/eds/services/storefront/storefrontSyncService.ts'),
                'utf-8',
            );
            expect(source).not.toMatch(/from\s+['"]vscode['"]/);
            expect(source).not.toMatch(/require\(['"]vscode['"]\)/);
        });
    });
});
