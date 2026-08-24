/**
 * SyncStorefrontCommand tests
 *
 * Coverage:
 *  - Happy path: storefront present + .git exists + user supplies commit message →
 *    syncAndPublish called with token from GitHubTokenService + Helix tokens
 *  - DA.live token sourcing: comes from DaLiveAuthService, never SecretStorage
 *  - User cancels commit prompt → no service call
 *  - No EDS storefront on project → error message, no service call
 *  - Storefront missing .git → error message, no service call
 *  - PushRejectedError → user is offered Continue / Cancel and Reset
 *  - "Cancel and Reset" branch runs git rebase --abort
 *
 * The mock preamble and fixtures live in `./syncStorefront.testUtils`, which
 * also re-exports the SUT — importing `SyncStorefrontCommand` directly here
 * would bind it to the real services, because `jest.mock` hoists per module.
 */

import * as vscode from 'vscode';
import {
    execFileMock,
    readFileMock,
    makeContext,
    makeEdsProject,
    makeLogger,
    makeStateManager,
    mockGetAccessToken,
    PushRejectedError,
    resetSyncStorefrontMocks,
    statMock,
    syncAndPublishMock,
    SyncStorefrontCommand,
} from './syncStorefront.testUtils';

beforeEach(() => {
    resetSyncStorefrontMocks();
});

describe('SyncStorefrontCommand', () => {
    it('skips with a warning when no current project is loaded', async () => {
        const command = new SyncStorefrontCommand(
            makeContext(),
            makeStateManager(null) as never,
            makeLogger() as never
        );

        await command.execute();

        expect(syncAndPublishMock).not.toHaveBeenCalled();
        expect(vscode.window.showWarningMessage).toHaveBeenCalled();
    });

    it('errors when the project has no EDS storefront component', async () => {
        const project = { ...makeEdsProject(), componentInstances: {} };
        const command = new SyncStorefrontCommand(
            makeContext(),
            makeStateManager(project) as never,
            makeLogger() as never
        );

        await command.execute();

        expect(syncAndPublishMock).not.toHaveBeenCalled();
        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
            expect.stringMatching(/EDS storefront/i),
            'OK'
        );
    });

    it('errors when the storefront has no .git directory', async () => {
        statMock.mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
        const command = new SyncStorefrontCommand(
            makeContext(),
            makeStateManager(makeEdsProject()) as never,
            makeLogger() as never
        );

        await command.execute();

        expect(syncAndPublishMock).not.toHaveBeenCalled();
        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
            expect.stringMatching(/not initialized/i),
            'OK'
        );
    });

    it('does nothing when the user cancels the commit message prompt', async () => {
        (vscode.window.showInputBox as jest.Mock).mockResolvedValueOnce(undefined);
        const command = new SyncStorefrontCommand(
            makeContext(),
            makeStateManager(makeEdsProject()) as never,
            makeLogger() as never
        );

        await command.execute();

        expect(syncAndPublishMock).not.toHaveBeenCalled();
    });

    it('forwards github + Helix tokens to syncAndPublish on the happy path', async () => {
        syncAndPublishMock.mockResolvedValue({
            committed: true,
            pushed: true,
            helixPublished: true,
            summary: '',
        });
        mockGetAccessToken.mockResolvedValue('dalive-ims-from-auth-service');

        const command = new SyncStorefrontCommand(
            makeContext(),
            makeStateManager(makeEdsProject()) as never,
            makeLogger() as never
        );

        await command.execute();

        expect(syncAndPublishMock).toHaveBeenCalledTimes(1);
        const input = syncAndPublishMock.mock.calls[0][0];
        expect(input.storefrontPath).toBe('/projects/demo/components/eds-storefront');
        expect(input.commitMessage).toBe('Demo Builder: sync local changes');
        expect(input.githubToken).toBe('gh-token-from-service');
        expect(input.daLiveToken).toBe('dalive-ims-from-auth-service');
        expect(input.githubRepo).toEqual({
            owner: 'demo-org',
            site: 'demo-repo',
            branch: undefined,
        });
    });

    // REGRESSION: the token was read from `context.secrets` under a key nothing
    // writes, so the Helix publish leg silently skipped on every sync while the
    // command still reported "Storefront synced." Pin the real source.
    it('reads the DA.live token from the auth service, never from SecretStorage', async () => {
        syncAndPublishMock.mockResolvedValue({
            committed: true,
            pushed: true,
            helixPublished: true,
            summary: '',
        });
        mockGetAccessToken.mockResolvedValue('dalive-ims-from-auth-service');

        const context = makeContext();
        const command = new SyncStorefrontCommand(
            context,
            makeStateManager(makeEdsProject()) as never,
            makeLogger() as never
        );

        await command.execute();

        expect(mockGetAccessToken).toHaveBeenCalled();
        const secretKeysRead = (context.secrets.get as jest.Mock).mock.calls.map((c) => c[0]);
        expect(secretKeysRead).not.toContain('demoBuilder.daLive.imsToken');
        expect(syncAndPublishMock.mock.calls[0][0].daLiveToken).toBe(
            'dalive-ims-from-auth-service'
        );
    });

    it('skips Helix when the auth service has no token (githubToken still forwarded)', async () => {
        syncAndPublishMock.mockResolvedValue({
            committed: true,
            pushed: true,
            helixPublished: false,
            summary: '',
        });
        mockGetAccessToken.mockResolvedValue(null);

        const command = new SyncStorefrontCommand(
            makeContext(),
            makeStateManager(makeEdsProject()) as never,
            makeLogger() as never
        );

        await command.execute();

        const input = syncAndPublishMock.mock.calls[0][0];
        expect(input.githubToken).toBe('gh-token-from-service');
        expect(input.daLiveToken).toBeUndefined();
    });

    it('skips Helix without throwing when the auth service itself fails', async () => {
        syncAndPublishMock.mockResolvedValue({
            committed: true,
            pushed: true,
            helixPublished: false,
            summary: '',
        });
        mockGetAccessToken.mockRejectedValue(new Error('token store unavailable'));

        const command = new SyncStorefrontCommand(
            makeContext(),
            makeStateManager(makeEdsProject()) as never,
            makeLogger() as never
        );

        await command.execute();

        expect(syncAndPublishMock.mock.calls[0][0].daLiveToken).toBeUndefined();
    });

    describe('push refused by a repository rule', () => {
        // A rule violation — push protection finding a secret, most often — survives
        // any rebase. Routing it through the conflict flow narrated a pull that had
        // nothing to pull and then blamed conflicts that never existed, while the
        // accurate diagnosis reached only the debug log (`showError` displays its
        // first argument and logs the second).
        const RULESET_MESSAGE =
            "git push blocked: the repository's rules rejected it (for example push " +
            'protection finding a secret). Rebasing will not clear this.';

        const rejectWithRuleset = (): void => {
            syncAndPublishMock.mockRejectedValueOnce(
                new PushRejectedError(RULESET_MESSAGE, 'ruleset')
            );
        };

        const runCommand = (): Promise<void> =>
            new SyncStorefrontCommand(
                makeContext(),
                makeStateManager(makeEdsProject()) as never,
                makeLogger() as never
            ).execute();

        it('shows the rule-violation reason to the user, not just to the log', async () => {
            rejectWithRuleset();

            await runCommand();

            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                expect.stringContaining('rules rejected it'),
                'OK'
            );
        });

        it('does not rebase — the remote never moved', async () => {
            rejectWithRuleset();

            await runCommand();

            const rebased = execFileMock.mock.calls.some(
                (c) => Array.isArray(c[1]) && (c[1] as string[]).includes('--rebase')
            );
            expect(rebased).toBe(false);
        });

        it('never mentions conflicts the user did not have', async () => {
            rejectWithRuleset();

            await runCommand();

            const shown = (vscode.window.showErrorMessage as jest.Mock).mock.calls
                .map((c) => String(c[0]))
                .join(' ');
            expect(shown).not.toMatch(/conflict/i);
            // The conflict flow's modal prompt must never open either.
            expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
        });

        it('still routes a non-fast-forward rejection through the rebase flow', async () => {
            // The two rejections look alike in stderr; only `reason` separates
            // them, and this one's remedy really is pull-and-rebase.
            execFileMock.mockImplementation(
                (
                    _cmd: string,
                    _args: string[],
                    cb: (err: Error | null, result?: { stdout: string; stderr: string }) => void
                ) => cb(null, { stdout: '', stderr: '' })
            );
            syncAndPublishMock
                .mockRejectedValueOnce(new PushRejectedError('push rejected', 'non-fast-forward'))
                // The re-push after a clean rebase.
                .mockResolvedValueOnce({
                    committed: false,
                    pushed: true,
                    helixPublished: false,
                    summary: '',
                });

            await runCommand();

            const rebased = execFileMock.mock.calls.some(
                (c) => Array.isArray(c[1]) && (c[1] as string[]).includes('--rebase')
            );
            expect(rebased).toBe(true);
        });
    });

    it('on PushRejectedError + "Cancel and Reset", runs git rebase --abort and shows info', async () => {
        syncAndPublishMock.mockRejectedValueOnce(new PushRejectedError('push rejected', 'non-fast-forward'));
        // First execFile call is git pull --rebase -> simulate conflict
        execFileMock.mockImplementation(
            (
                _cmd: string,
                args: string[],
                cb: (err: Error | null, result?: { stdout: string; stderr: string }) => void
            ) => {
                if (args.includes('pull') && args.includes('--rebase')) {
                    const err = new Error('Command failed') as NodeJS.ErrnoException & {
                        stderr?: string;
                    };
                    err.stderr = 'CONFLICT (content): Merge conflict in blocks/hero/hero.js';
                    cb(err);
                    return;
                }
                cb(null, { stdout: '', stderr: '' });
            }
        );
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValueOnce('Cancel and Reset');

        const command = new SyncStorefrontCommand(
            makeContext(),
            makeStateManager(makeEdsProject()) as never,
            makeLogger() as never
        );

        await command.execute();

        const abortCalled = execFileMock.mock.calls.some(
            (c) =>
                Array.isArray(c[1]) &&
                (c[1] as string[]).includes('rebase') &&
                (c[1] as string[]).includes('--abort')
        );
        expect(abortCalled).toBe(true);
        // No success message — sync was canceled, not completed
        expect(vscode.window.setStatusBarMessage).not.toHaveBeenCalled();
    });

    it('reports "nothing to commit" for an already-up-to-date sync (outcome reported after progress)', async () => {
        // committed:false + pushed:false is the plain up-to-date path. The outcome
        // must still be reported (the `if (result)` guard is truthy for any result
        // object) — and now runs after `withProgress` closes so its OK-dialog no
        // longer holds the "Committing changes…" spinner open.
        syncAndPublishMock.mockResolvedValue({
            committed: false,
            pushed: false,
            helixPublished: false,
            summary: '',
        });

        const command = new SyncStorefrontCommand(
            makeContext(),
            makeStateManager(makeEdsProject()) as never,
            makeLogger() as never
        );

        await command.execute();

        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
            expect.stringMatching(/nothing to commit|up to date/i),
            'OK'
        );
    });

    it('on PushRejectedError + "Continue", registers the nested storefront repo and opens the conflicts', async () => {
        // First sync push is rejected; after conflict resolution the re-push succeeds.
        syncAndPublishMock
            .mockRejectedValueOnce(new PushRejectedError('push rejected', 'non-fast-forward'))
            .mockResolvedValueOnce({
                committed: false,
                pushed: true,
                helixPublished: false,
                summary: '',
            });

        execFileMock.mockImplementation(
            (
                _cmd: string,
                args: string[],
                cb: (err: Error | null, result?: { stdout: string; stderr: string }) => void
            ) => {
                if (args.includes('pull') && args.includes('--rebase')) {
                    const err = new Error('Command failed') as NodeJS.ErrnoException & {
                        stderr?: string;
                    };
                    err.stderr = 'CONFLICT (content): Merge conflict in blocks/hero/hero.js';
                    cb(err);
                    return;
                }
                if (args.includes('diff') && args.includes('--diff-filter=U')) {
                    cb(null, { stdout: 'blocks/hero/hero.js\n', stderr: '' });
                    return;
                }
                cb(null, { stdout: '', stderr: '' });
            }
        );
        // The conflicted file has been resolved (no markers) so the poll passes at once.
        readFileMock.mockResolvedValue('resolved content, no markers');
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValueOnce('Continue');

        const command = new SyncStorefrontCommand(
            makeContext(),
            makeStateManager(makeEdsProject()) as never,
            makeLogger() as never
        );

        await command.execute();

        // Registers the nested storefront repo with VS Code's Git extension so its
        // conflicts actually surface in Source Control (the reported bug).
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
            'git.openRepository',
            '/projects/demo/components/eds-storefront'
        );
        // Reveals the SCM view and opens the conflicted file so the merge controls
        // are right in front of the user.
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith('workbench.view.scm');
        expect(vscode.window.showTextDocument).toHaveBeenCalled();
    });

    describe('managed-file auto-resolve', () => {
        function findCheckoutCalls(): string[][] {
            return execFileMock.mock.calls
                .filter((c) => Array.isArray(c[1]) && (c[1] as string[]).includes('checkout'))
                .map((c) => c[1] as string[]);
        }

        function hasArgs(predicate: (args: string[]) => boolean): boolean {
            return execFileMock.mock.calls.some(
                (c) => Array.isArray(c[1]) && predicate(c[1] as string[])
            );
        }

        /**
         * Drive a push-rejected → rebase-conflict flow where the conflicted set
         * is `conflicted`. `rebaseContinueError` optionally makes the first
         * `rebase --continue` fail (empty-commit case); `checkoutError` makes
         * `checkout --ours` fail (auto-resolve failure case).
         */
        function mockConflictFlow(opts: {
            conflicted: string[];
            checkoutError?: boolean;
            rebaseContinueError?: { stderr: string };
        }): void {
            let continueCalled = false;
            execFileMock.mockImplementation(
                (
                    _cmd: string,
                    args: string[],
                    cb: (err: Error | null, result?: { stdout: string; stderr: string }) => void
                ) => {
                    if (args.includes('pull') && args.includes('--rebase')) {
                        const err = new Error('Command failed') as NodeJS.ErrnoException & {
                            stderr?: string;
                        };
                        err.stderr = 'CONFLICT (content): Merge conflict';
                        cb(err);
                        return;
                    }
                    if (args.includes('diff') && args.includes('--diff-filter=U')) {
                        cb(null, { stdout: opts.conflicted.join('\n') + '\n', stderr: '' });
                        return;
                    }
                    if (opts.checkoutError && args.includes('checkout')) {
                        cb(new Error('checkout failed'));
                        return;
                    }
                    if (args.includes('rebase') && args.includes('--continue')) {
                        if (opts.rebaseContinueError && !continueCalled) {
                            continueCalled = true;
                            const err = new Error('Command failed') as NodeJS.ErrnoException & {
                                stderr?: string;
                            };
                            err.stderr = opts.rebaseContinueError.stderr;
                            cb(err);
                            return;
                        }
                        cb(null, { stdout: '', stderr: '' });
                        return;
                    }
                    cb(null, { stdout: '', stderr: '' });
                }
            );
        }

        it('auto-resolves when every conflicted file is managed (no manual prompt)', async () => {
            syncAndPublishMock
                .mockRejectedValueOnce(new PushRejectedError('push rejected', 'non-fast-forward'))
                .mockResolvedValueOnce({
                    committed: false,
                    pushed: true,
                    helixPublished: true,
                    summary: '',
                });
            mockConflictFlow({ conflicted: ['config.json'] });

            const command = new SyncStorefrontCommand(
                makeContext(),
                makeStateManager(makeEdsProject()) as never,
                makeLogger() as never
            );

            await command.execute();

            // Took the remote (--ours) copy of the managed file, then staged it.
            expect(
                findCheckoutCalls().some((a) => a.includes('--ours') && a.includes('config.json'))
            ).toBe(true);
            expect(hasArgs((a) => a.includes('add') && a.includes('config.json'))).toBe(true);
            expect(hasArgs((a) => a.includes('rebase') && a.includes('--continue'))).toBe(true);
            // No manual warning prompt was shown.
            expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
            // The push/complete path ran (second syncAndPublish with skipCommit).
            expect(syncAndPublishMock).toHaveBeenCalledTimes(2);
            expect(syncAndPublishMock.mock.calls[1][0].skipCommit).toBe(true);
        });

        it('resolves managed conflicts with --ours (remote), never --theirs', async () => {
            syncAndPublishMock
                .mockRejectedValueOnce(new PushRejectedError('push rejected', 'non-fast-forward'))
                .mockResolvedValueOnce({
                    committed: false,
                    pushed: true,
                    helixPublished: true,
                    summary: '',
                });
            mockConflictFlow({ conflicted: ['config.json'] });

            const command = new SyncStorefrontCommand(
                makeContext(),
                makeStateManager(makeEdsProject()) as never,
                makeLogger() as never
            );

            await command.execute();

            const checkout = findCheckoutCalls().find((a) => a.includes('config.json'));
            expect(checkout).toBeDefined();
            expect(checkout).toContain('--ours');
            expect(checkout).not.toContain('--theirs');
        });

        it('falls back to the manual flow when the conflict set is mixed', async () => {
            syncAndPublishMock
                .mockRejectedValueOnce(new PushRejectedError('push rejected', 'non-fast-forward'))
                .mockResolvedValueOnce({
                    committed: false,
                    pushed: true,
                    helixPublished: false,
                    summary: '',
                });
            mockConflictFlow({ conflicted: ['config.json', 'index.html'] });
            readFileMock.mockResolvedValue('resolved content, no markers');
            (vscode.window.showWarningMessage as jest.Mock).mockResolvedValueOnce('Continue');

            const command = new SyncStorefrontCommand(
                makeContext(),
                makeStateManager(makeEdsProject()) as never,
                makeLogger() as never
            );

            await command.execute();

            expect(findCheckoutCalls().some((a) => a.includes('--ours'))).toBe(false);
            expect(vscode.window.showWarningMessage).toHaveBeenCalled();
        });

        it('treats an unknown-class file as content and falls back to the manual flow', async () => {
            syncAndPublishMock
                .mockRejectedValueOnce(new PushRejectedError('push rejected', 'non-fast-forward'))
                .mockResolvedValueOnce({
                    committed: false,
                    pushed: true,
                    helixPublished: false,
                    summary: '',
                });
            mockConflictFlow({ conflicted: ['blocks/foo.js'] });
            readFileMock.mockResolvedValue('resolved content, no markers');
            (vscode.window.showWarningMessage as jest.Mock).mockResolvedValueOnce('Continue');

            const command = new SyncStorefrontCommand(
                makeContext(),
                makeStateManager(makeEdsProject()) as never,
                makeLogger() as never
            );

            await command.execute();

            expect(findCheckoutCalls().some((a) => a.includes('--ours'))).toBe(false);
            expect(vscode.window.showWarningMessage).toHaveBeenCalled();
        });

        it('skips the emptied commit when rebase --continue reports no changes', async () => {
            syncAndPublishMock
                .mockRejectedValueOnce(new PushRejectedError('push rejected', 'non-fast-forward'))
                .mockResolvedValueOnce({
                    committed: false,
                    pushed: true,
                    helixPublished: true,
                    summary: '',
                });
            mockConflictFlow({
                conflicted: ['config.json'],
                rebaseContinueError: { stderr: 'no changes - did you forget to use git add?' },
            });

            const command = new SyncStorefrontCommand(
                makeContext(),
                makeStateManager(makeEdsProject()) as never,
                makeLogger() as never
            );

            await command.execute();

            expect(hasArgs((a) => a.includes('rebase') && a.includes('--skip'))).toBe(true);
            expect(syncAndPublishMock).toHaveBeenCalledTimes(2);
        });

        it('aborts the rebase and does not push when the auto-resolve fails', async () => {
            syncAndPublishMock.mockRejectedValueOnce(new PushRejectedError('push rejected', 'non-fast-forward'));
            mockConflictFlow({ conflicted: ['config.json'], checkoutError: true });

            const command = new SyncStorefrontCommand(
                makeContext(),
                makeStateManager(makeEdsProject()) as never,
                makeLogger() as never
            );

            await command.execute();

            expect(hasArgs((a) => a.includes('rebase') && a.includes('--abort'))).toBe(true);
            // No re-push/complete: syncAndPublish was only called for the initial attempt.
            expect(syncAndPublishMock).toHaveBeenCalledTimes(1);
        });
    });

    it('does not import vscode from the service module (service stays vscode-free)', () => {
        const fs = require('fs') as typeof import('fs');

        const path = require('path') as typeof import('path');
        const source = fs.readFileSync(
            path.join(__dirname, '../../../../src/features/eds/services/storefront/storefrontSyncService.ts'),
            'utf-8'
        );
        expect(source).not.toMatch(/from\s+['"]vscode['"]/);
    });
});
