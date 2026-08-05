/**
 * SyncStorefrontCommand tests
 *
 * Coverage:
 *  - Happy path: storefront present + .git exists + user supplies commit message →
 *    syncAndPublish called with token from GitHubTokenService + Helix tokens
 *  - User cancels commit prompt → no service call
 *  - No EDS storefront on project → error message, no service call
 *  - Storefront missing .git → error message, no service call
 *  - PushRejectedError → user is offered Continue / Cancel and Reset
 *  - "Cancel and Reset" branch runs git rebase --abort
 */

// Delays in this path are real wall-clock waits on the node project's real timers.
// Mocking the shared sleep keeps the orchestration under test and drops the waiting.
// Assertions here pin the SEQUENCE of attempts, never elapsed duration.
jest.mock('@/core/utils/sleep', () => ({ sleep: jest.fn().mockResolvedValue(undefined) }));

import * as childProcess from 'child_process';
import * as fsPromises from 'fs/promises';
import * as vscode from 'vscode';

// The global vscode mock doesn't include showInputBox / withProgress overrides
// we need for these tests. Patch them on first import.
(vscode.window as { showInputBox?: jest.Mock }).showInputBox =
    (vscode.window as { showInputBox?: jest.Mock }).showInputBox ?? jest.fn();
(vscode.commands as { executeCommand?: jest.Mock }).executeCommand =
    (vscode.commands as { executeCommand?: jest.Mock }).executeCommand ?? jest.fn();
(vscode.env as { openExternal?: jest.Mock }).openExternal =
    (vscode.env as { openExternal?: jest.Mock }).openExternal ?? jest.fn();
(vscode.window as { showTextDocument?: jest.Mock }).showTextDocument =
    (vscode.window as { showTextDocument?: jest.Mock }).showTextDocument ?? jest.fn();
(vscode.workspace as { openTextDocument?: jest.Mock }).openTextDocument =
    (vscode.workspace as { openTextDocument?: jest.Mock }).openTextDocument ?? jest.fn();

// Make the conflict-resolution poll resolve immediately — the condition is
// driven by git state we mock per-test, not by real timers.
jest.mock('@/core/shell/pollingService', () => ({
    PollingService: jest.fn().mockImplementation(() => ({
        pollUntilCondition: jest.fn(async (checkFn: () => Promise<boolean>) => {
            await checkFn();
        }),
    })),
}));

import { GitHubTokenService } from '@/features/eds/services/githubTokenService';
import { PushRejectedError, syncAndPublish } from '@/features/eds/services/storefrontSyncService';
import { SyncStorefrontCommand } from '@/features/lifecycle/commands/syncStorefront';

jest.mock('child_process', () => ({
    execFile: jest.fn(),
    exec: jest.fn(),
    spawn: jest.fn(),
}));

jest.mock('fs/promises', () => ({
    stat: jest.fn(),
    readFile: jest.fn(),
}));

jest.mock('@/features/eds/services/storefrontSyncService', () => ({
    PushRejectedError: class PushRejectedError extends Error {
        constructor(
            message: string,
            public stderr?: string
        ) {
            super(message);
            this.name = 'PushRejectedError';
        }
    },
    syncAndPublish: jest.fn(),
}));

jest.mock('@/features/eds/services/githubTokenService', () => ({
    GitHubTokenService: jest.fn(),
}));

jest.mock('@/features/eds/services/helixApiClient', () => ({
    previewAndPublishPage: jest.fn(),
}));

const syncAndPublishMock = syncAndPublish as jest.Mock;
const execFileMock = childProcess.execFile as unknown as jest.Mock;
const statMock = fsPromises.stat as jest.Mock;

function makeContext(daLiveSecret?: string): vscode.ExtensionContext {
    const secrets: vscode.SecretStorage = {
        get: jest.fn(async (key: string) =>
            key === 'demoBuilder.daLive.imsToken' ? daLiveSecret : undefined
        ),
        store: jest.fn(),
        delete: jest.fn(),
        onDidChange: jest.fn(),
    } as never;
    return { secrets } as never;
}

function makeStateManager(project: Record<string, unknown> | null): {
    getCurrentProject: jest.Mock;
} {
    return {
        getCurrentProject: jest.fn().mockResolvedValue(project),
    };
}

function makeLogger(): {
    info: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
    debug: jest.Mock;
} {
    return { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
}

function makeEdsProject(): Record<string, unknown> {
    return {
        name: 'demo',
        path: '/projects/demo',
        componentInstances: {
            'eds-storefront': {
                id: 'eds-storefront',
                name: 'EDS Storefront',
                status: 'ready',
                path: '/projects/demo/components/eds-storefront',
                metadata: { githubRepo: 'demo-org/demo-repo', liveUrl: 'https://live.example' },
            },
        },
    };
}

function setGitHubTokenServiceReturns(token: string | undefined): void {
    const instance = { getToken: jest.fn().mockResolvedValue(token ? { token } : undefined) };
    (GitHubTokenService as unknown as jest.Mock).mockImplementation(() => instance);
}

beforeEach(() => {
    jest.clearAllMocks();
    statMock.mockResolvedValue({} as never);
    // Default: input box returns the supplied default value; user picks "Continue".
    (vscode.window.showInputBox as jest.Mock).mockResolvedValue('Demo Builder: sync local changes');
    (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue(undefined);
    (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue(undefined);
    (vscode.window.withProgress as jest.Mock).mockImplementation(
        async (_opts, task: (p: { report: jest.Mock }) => Promise<unknown>) => {
            return task({ report: jest.fn() });
        }
    );
    setGitHubTokenServiceReturns('gh-token-from-service');
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

        const command = new SyncStorefrontCommand(
            makeContext('dalive-ims-from-secrets'),
            makeStateManager(makeEdsProject()) as never,
            makeLogger() as never
        );

        await command.execute();

        expect(syncAndPublishMock).toHaveBeenCalledTimes(1);
        const input = syncAndPublishMock.mock.calls[0][0];
        expect(input.storefrontPath).toBe('/projects/demo/components/eds-storefront');
        expect(input.commitMessage).toBe('Demo Builder: sync local changes');
        expect(input.githubToken).toBe('gh-token-from-service');
        expect(input.daLiveToken).toBe('dalive-ims-from-secrets');
        expect(input.githubRepo).toEqual({
            owner: 'demo-org',
            site: 'demo-repo',
            branch: undefined,
        });
    });

    it('skips Helix when the DA.live secret is missing (githubToken still forwarded)', async () => {
        syncAndPublishMock.mockResolvedValue({
            committed: true,
            pushed: true,
            helixPublished: false,
            summary: '',
        });

        const command = new SyncStorefrontCommand(
            makeContext(/* no DA.live secret */),
            makeStateManager(makeEdsProject()) as never,
            makeLogger() as never
        );

        await command.execute();

        const input = syncAndPublishMock.mock.calls[0][0];
        expect(input.githubToken).toBe('gh-token-from-service');
        expect(input.daLiveToken).toBeUndefined();
    });

    it('on PushRejectedError + "Cancel and Reset", runs git rebase --abort and shows info', async () => {
        syncAndPublishMock.mockRejectedValueOnce(new PushRejectedError('push rejected'));
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
            .mockRejectedValueOnce(new PushRejectedError('push rejected'))
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
        (fsPromises.readFile as jest.Mock).mockResolvedValue('resolved content, no markers');
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
                .mockRejectedValueOnce(new PushRejectedError('push rejected'))
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
                .mockRejectedValueOnce(new PushRejectedError('push rejected'))
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
                .mockRejectedValueOnce(new PushRejectedError('push rejected'))
                .mockResolvedValueOnce({
                    committed: false,
                    pushed: true,
                    helixPublished: false,
                    summary: '',
                });
            mockConflictFlow({ conflicted: ['config.json', 'index.html'] });
            (fsPromises.readFile as jest.Mock).mockResolvedValue('resolved content, no markers');
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
                .mockRejectedValueOnce(new PushRejectedError('push rejected'))
                .mockResolvedValueOnce({
                    committed: false,
                    pushed: true,
                    helixPublished: false,
                    summary: '',
                });
            mockConflictFlow({ conflicted: ['blocks/foo.js'] });
            (fsPromises.readFile as jest.Mock).mockResolvedValue('resolved content, no markers');
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
                .mockRejectedValueOnce(new PushRejectedError('push rejected'))
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
            syncAndPublishMock.mockRejectedValueOnce(new PushRejectedError('push rejected'));
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
            path.join(__dirname, '../../../../src/features/eds/services/storefrontSyncService.ts'),
            'utf-8'
        );
        expect(source).not.toMatch(/from\s+['"]vscode['"]/);
    });
});
