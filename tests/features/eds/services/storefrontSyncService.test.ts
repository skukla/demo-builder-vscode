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
import { previewAndPublishPage } from '@/features/eds/services/helixApiClient';
import {
    GitOperationError,
    PushRejectedError,
    syncAndPublish,
} from '@/features/eds/services/storefrontSyncService';

jest.mock('child_process', () => ({
    execFile: jest.fn(),
}));

jest.mock('@/features/eds/services/helixApiClient', () => ({
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

    describe('does not import vscode', () => {
        it('module file has no `import * as vscode` or `from "vscode"`', () => {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const fs = require('fs') as typeof import('fs');
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const path = require('path') as typeof import('path');
            const source = fs.readFileSync(
                path.join(__dirname, '../../../../src/features/eds/services/storefrontSyncService.ts'),
                'utf-8',
            );
            expect(source).not.toMatch(/from\s+['"]vscode['"]/);
            expect(source).not.toMatch(/require\(['"]vscode['"]\)/);
        });
    });
});
