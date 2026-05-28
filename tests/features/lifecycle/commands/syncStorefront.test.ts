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

import { GitHubTokenService } from '@/features/eds/services/githubTokenService';
import {
    PushRejectedError,
    syncAndPublish,
} from '@/features/eds/services/storefrontSyncService';
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
        constructor(message: string, public stderr?: string) {
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
            key === 'demoBuilder.daLive.imsToken' ? daLiveSecret : undefined,
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
    info: jest.Mock; warn: jest.Mock; error: jest.Mock; debug: jest.Mock;
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
    (vscode.window.withProgress as jest.Mock).mockImplementation(async (_opts, task: (p: { report: jest.Mock }) => Promise<unknown>) => {
        return task({ report: jest.fn() });
    });
    setGitHubTokenServiceReturns('gh-token-from-service');
});

describe('SyncStorefrontCommand', () => {
    it('skips with a warning when no current project is loaded', async () => {
        const command = new SyncStorefrontCommand(
            makeContext(),
            makeStateManager(null) as never,
            makeLogger() as never,
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
            makeLogger() as never,
        );

        await command.execute();

        expect(syncAndPublishMock).not.toHaveBeenCalled();
        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
            expect.stringMatching(/EDS storefront/i),
            'OK',
        );
    });

    it('errors when the storefront has no .git directory', async () => {
        statMock.mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
        const command = new SyncStorefrontCommand(
            makeContext(),
            makeStateManager(makeEdsProject()) as never,
            makeLogger() as never,
        );

        await command.execute();

        expect(syncAndPublishMock).not.toHaveBeenCalled();
        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
            expect.stringMatching(/not initialized/i),
            'OK',
        );
    });

    it('does nothing when the user cancels the commit message prompt', async () => {
        (vscode.window.showInputBox as jest.Mock).mockResolvedValueOnce(undefined);
        const command = new SyncStorefrontCommand(
            makeContext(),
            makeStateManager(makeEdsProject()) as never,
            makeLogger() as never,
        );

        await command.execute();

        expect(syncAndPublishMock).not.toHaveBeenCalled();
    });

    it('forwards github + Helix tokens to syncAndPublish on the happy path', async () => {
        syncAndPublishMock.mockResolvedValue({
            committed: true, pushed: true, helixPublished: true, summary: '',
        });

        const command = new SyncStorefrontCommand(
            makeContext('dalive-ims-from-secrets'),
            makeStateManager(makeEdsProject()) as never,
            makeLogger() as never,
        );

        await command.execute();

        expect(syncAndPublishMock).toHaveBeenCalledTimes(1);
        const input = syncAndPublishMock.mock.calls[0][0];
        expect(input.storefrontPath).toBe('/projects/demo/components/eds-storefront');
        expect(input.commitMessage).toBe('Demo Builder: sync local changes');
        expect(input.githubToken).toBe('gh-token-from-service');
        expect(input.daLiveToken).toBe('dalive-ims-from-secrets');
        expect(input.githubRepo).toEqual({ owner: 'demo-org', site: 'demo-repo', branch: undefined });
    });

    it('skips Helix when the DA.live secret is missing (githubToken still forwarded)', async () => {
        syncAndPublishMock.mockResolvedValue({
            committed: true, pushed: true, helixPublished: false, summary: '',
        });

        const command = new SyncStorefrontCommand(
            makeContext(/* no DA.live secret */),
            makeStateManager(makeEdsProject()) as never,
            makeLogger() as never,
        );

        await command.execute();

        const input = syncAndPublishMock.mock.calls[0][0];
        expect(input.githubToken).toBe('gh-token-from-service');
        expect(input.daLiveToken).toBeUndefined();
    });

    it('on PushRejectedError + "Cancel and Reset", runs git rebase --abort and shows info', async () => {
        syncAndPublishMock.mockRejectedValueOnce(
            new PushRejectedError('push rejected'),
        );
        // First execFile call is git pull --rebase -> simulate conflict
        execFileMock.mockImplementation((_cmd: string, args: string[], cb: (err: Error | null, result?: { stdout: string; stderr: string }) => void) => {
            if (args.includes('pull') && args.includes('--rebase')) {
                const err = new Error('Command failed') as NodeJS.ErrnoException & { stderr?: string };
                err.stderr = 'CONFLICT (content): Merge conflict in blocks/hero/hero.js';
                cb(err);
                return;
            }
            cb(null, { stdout: '', stderr: '' });
        });
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValueOnce('Cancel and Reset');

        const command = new SyncStorefrontCommand(
            makeContext(),
            makeStateManager(makeEdsProject()) as never,
            makeLogger() as never,
        );

        await command.execute();

        const abortCalled = execFileMock.mock.calls.some(c =>
            Array.isArray(c[1]) && (c[1] as string[]).includes('rebase') && (c[1] as string[]).includes('--abort'),
        );
        expect(abortCalled).toBe(true);
        // No success message — sync was canceled, not completed
        expect(vscode.window.setStatusBarMessage).not.toHaveBeenCalled();
    });

    it('does not import vscode from the service module (service stays vscode-free)', () => {

        const fs = require('fs') as typeof import('fs');

        const path = require('path') as typeof import('path');
        const source = fs.readFileSync(
            path.join(__dirname, '../../../../src/features/eds/services/storefrontSyncService.ts'),
            'utf-8',
        );
        expect(source).not.toMatch(/from\s+['"]vscode['"]/);
    });
});
