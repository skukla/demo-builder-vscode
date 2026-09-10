/**
 * SyncStorefrontCommand — what the command HANDS its collaborators and what it
 * tells the SC at the end (PL-22, MUT-08).
 *
 * The base suite pins that the flow runs; this one pins the decisions along it:
 * the prompt's options, the token handed on, how the repo coordinates are read
 * off the storefront's metadata (and when they are refused), each ending of
 * `reportSyncResult`, and the two endings of a push that follows a rebase.
 * Success text is asserted where the SC sees it — the status bar — never on
 * the logger.
 */

import * as vscode from 'vscode';
import {
    HelixApiError,
    answerGit,
    gitFailure,
    makeSyncStorefrontContext,
    makeSyncTargetProject,
    makeLogger,
    makeStateManager,
    mockGetAccessToken,
    rejectPushOnce,
    resetSyncStorefrontMocks,
    setGitHubTokenServiceReturns,
    syncAndPublishMock,
    SyncStorefrontCommand,
} from './syncStorefront.testUtils';
import type { StateManager } from '@/core/state/stateManager';
import type { Project } from '@/types/base';

const STOREFRONT = '/projects/demo/components/eds-storefront';
const showInformationMessage = vscode.window.showInformationMessage as jest.Mock;
const showWarningMessage = vscode.window.showWarningMessage as jest.Mock;
const showErrorMessage = vscode.window.showErrorMessage as jest.Mock;
const setStatusBarMessage = vscode.window.setStatusBarMessage as jest.Mock;
const openExternal = vscode.env.openExternal as jest.Mock;

/** The storefront project with its metadata replaced (or removed). */
function projectWithMetadata(metadata: Record<string, unknown> | undefined): Project {
    const project = makeSyncTargetProject();
    const storefront = project.componentInstances!['eds-storefront'];
    project.componentInstances!['eds-storefront'] = { ...storefront, metadata };
    return project;
}

function runCommand(project: Project = makeSyncTargetProject()): Promise<void> {
    return new SyncStorefrontCommand(
        makeSyncStorefrontContext(),
        makeStateManager(project) as unknown as StateManager,
        makeLogger()
    ).execute();
}

function syncResolves(result: Partial<{ committed: boolean; pushed: boolean; helixPublished: boolean }>) {
    syncAndPublishMock.mockResolvedValue({
        committed: true,
        pushed: true,
        helixPublished: false,
        summary: '',
        ...result,
    });
}

beforeEach(() => {
    resetSyncStorefrontMocks();
    mockGetAccessToken.mockResolvedValue(null);
    syncResolves({});
});

describe('execute — the inputs it gathers', () => {
    it('errors on a project with no component instances at all', async () => {
        const project = { ...makeSyncTargetProject(), componentInstances: undefined };

        await runCommand(project);

        expect(showErrorMessage).toHaveBeenCalledWith(expect.stringMatching(/EDS storefront/), 'OK');
        expect(syncAndPublishMock).not.toHaveBeenCalled();
    });

    it('prompts for the commit message with a default, a prompt and a placeholder', async () => {
        await runCommand();

        expect(vscode.window.showInputBox).toHaveBeenCalledWith({
            prompt: 'Commit message',
            value: 'Demo Builder: sync local changes',
            placeHolder: 'Describe what changed',
        });
    });

    it('forwards NO GitHub token when the token service has none', async () => {
        setGitHubTokenServiceReturns(undefined);

        await runCommand();

        expect(syncAndPublishMock.mock.calls[0][0].githubToken).toBeUndefined();
    });

    it('reports the save step on the progress notification', async () => {
        const report = jest.fn();
        (vscode.window.withProgress as jest.Mock).mockImplementation(
            async (_o: unknown, task: (p: { report: jest.Mock }) => Promise<unknown>) => task({ report })
        );

        await runCommand();

        expect(report).toHaveBeenCalledWith({ message: 'Saving your storefront changes…' });
    });

    it('lets an unexpected sync failure escape — it is not a push rejection', async () => {
        syncAndPublishMock.mockRejectedValueOnce(new Error('disk full'));
        const git = answerGit({});

        await expect(runCommand()).rejects.toThrow('disk full');

        expect(git.some((a) => a.includes('--rebase'))).toBe(false);
        expect(showErrorMessage).not.toHaveBeenCalled();
    });
});

describe('the repo coordinates read off the storefront metadata', () => {
    const handedRepo = () => syncAndPublishMock.mock.calls[0][0].githubRepo;

    it('splits owner/site and carries the EDS branch when one is recorded', async () => {
        await runCommand(projectWithMetadata({ githubRepo: 'acme/site', edsBranch: 'develop' }));

        expect(handedRepo()).toEqual({ owner: 'acme', site: 'site', branch: 'develop' });
    });

    it('ignores a branch that is not a string', async () => {
        await runCommand(projectWithMetadata({ githubRepo: 'acme/site', edsBranch: 7 }));

        expect(handedRepo()).toEqual({ owner: 'acme', site: 'site', branch: undefined });
    });

    it('refuses a repo with no slash', async () => {
        await runCommand(projectWithMetadata({ githubRepo: 'acme' }));

        expect(handedRepo()).toBeUndefined();
    });

    it('refuses a repo that is not a string', async () => {
        await runCommand(projectWithMetadata({ githubRepo: 42 }));

        expect(handedRepo()).toBeUndefined();
    });

    it('copes with a storefront that has no metadata at all', async () => {
        await runCommand(projectWithMetadata(undefined));

        expect(handedRepo()).toBeUndefined();
        expect(setStatusBarMessage).toHaveBeenCalledWith('✅ Storefront synced.', expect.any(Number));
    });
});

describe('reportSyncResult — what the SC is told', () => {
    it('says "synced" for a commit that was not pushed', async () => {
        syncResolves({ committed: true, pushed: false });

        await runCommand();

        expect(setStatusBarMessage).toHaveBeenCalledWith('✅ Storefront synced.', expect.any(Number));
        expect(showInformationMessage).not.toHaveBeenCalled();
    });

    it('says "synced" for a push with nothing newly committed', async () => {
        syncResolves({ committed: false, pushed: true });

        await runCommand();

        expect(setStatusBarMessage).toHaveBeenCalledWith('✅ Storefront synced.', expect.any(Number));
    });

    it('offers to open the live site when Helix published and a live URL is known', async () => {
        syncResolves({ helixPublished: true });
        showInformationMessage.mockResolvedValue('Open');

        await runCommand();

        expect(showInformationMessage).toHaveBeenCalledWith(
            'Storefront synced and published. View at https://live.example',
            'Open'
        );
        expect(openExternal).toHaveBeenCalledTimes(1);
        expect(String(openExternal.mock.calls[0][0])).toBe('https://live.example');
        expect(setStatusBarMessage).not.toHaveBeenCalled();
    });

    it('does not open anything when the SC dismisses the offer', async () => {
        syncResolves({ helixPublished: true });
        showInformationMessage.mockResolvedValue(undefined);

        await runCommand();

        expect(openExternal).not.toHaveBeenCalled();
    });

    it('says "synced and published" when Helix published but no live URL is recorded', async () => {
        syncResolves({ helixPublished: true });

        await runCommand(projectWithMetadata({ githubRepo: 'demo-org/demo-repo' }));

        expect(setStatusBarMessage).toHaveBeenCalledWith(
            '✅ Storefront synced and published.',
            expect.any(Number)
        );
        expect(showInformationMessage).not.toHaveBeenCalled();
    });

    it('ignores a live URL that is not a string', async () => {
        syncResolves({ helixPublished: true });

        await runCommand(projectWithMetadata({ githubRepo: 'demo-org/demo-repo', liveUrl: 42 }));

        expect(setStatusBarMessage).toHaveBeenCalledWith(
            '✅ Storefront synced and published.',
            expect.any(Number)
        );
    });

    it('says only "synced" when Helix did not publish, even with a live URL', async () => {
        syncResolves({ helixPublished: false });

        await runCommand();

        expect(setStatusBarMessage).toHaveBeenCalledWith('✅ Storefront synced.', expect.any(Number));
        expect(showInformationMessage).not.toHaveBeenCalled();
    });
});

describe('the push that follows a clean rebase', () => {
    beforeEach(() => {
        rejectPushOnce();
        answerGit({});
    });

    it('re-enters syncAndPublish with skipCommit and the same tokens and repo', async () => {
        mockGetAccessToken.mockResolvedValue('dalive-token');
        syncAndPublishMock.mockResolvedValueOnce({
            committed: false,
            pushed: true,
            helixPublished: true,
            summary: '',
        });

        await runCommand();

        expect(syncAndPublishMock).toHaveBeenCalledTimes(2);
        expect(syncAndPublishMock.mock.calls[1][0]).toEqual({
            storefrontPath: STOREFRONT,
            commitMessage: '',
            githubToken: 'gh-token-from-service',
            daLiveToken: 'dalive-token',
            githubRepo: { owner: 'demo-org', site: 'demo-repo', branch: undefined },
            skipCommit: true,
        });
        // A clean rebase never opens the conflict prompt.
        expect(showWarningMessage).not.toHaveBeenCalled();
    });

    it('says preview + live updated when Helix published', async () => {
        syncAndPublishMock.mockResolvedValueOnce({
            committed: false,
            pushed: true,
            helixPublished: true,
            summary: '',
        });

        await runCommand();

        expect(setStatusBarMessage).toHaveBeenCalledWith(
            '✅ Storefront synced. Preview + live updated.',
            expect.any(Number)
        );
    });

    it('says only "synced" when Helix was skipped', async () => {
        syncAndPublishMock.mockResolvedValueOnce({
            committed: false,
            pushed: true,
            helixPublished: false,
            summary: '',
        });

        await runCommand();

        expect(setStatusBarMessage).toHaveBeenCalledWith('✅ Storefront synced.', expect.any(Number));
    });

    it('a Helix failure after the push is a warning, not an error', async () => {
        syncAndPublishMock.mockRejectedValueOnce(new HelixApiError('preview 500', 500));

        await runCommand();

        expect(showWarningMessage).toHaveBeenCalledWith(
            expect.stringContaining('Pushed to GitHub but the Helix preview/publish step failed'),
            'OK'
        );
        expect(showErrorMessage).not.toHaveBeenCalled();
        expect(setStatusBarMessage).not.toHaveBeenCalled();
    });

    it('a failed push after the rebase is an error that leaves the local changes alone', async () => {
        syncAndPublishMock.mockRejectedValueOnce(new Error('push failed'));

        await runCommand();

        expect(showErrorMessage).toHaveBeenCalledWith(
            'Push failed after resolving conflicts. Your local changes are intact.',
            'OK'
        );
        expect(showWarningMessage).not.toHaveBeenCalled();
    });

    it('a rebase that fails for a reason other than conflicts still goes through the prompt', async () => {
        answerGit({ 'pull --rebase': gitFailure({ stderr: 'fatal: unable to access the remote' }) });
        const logger = makeLogger();

        await new SyncStorefrontCommand(
            makeSyncStorefrontContext(),
            makeStateManager(makeSyncTargetProject()) as unknown as StateManager,
            logger
        ).execute();

        expect(showWarningMessage).toHaveBeenCalledWith(
            expect.stringContaining('found conflicts'),
            { modal: true },
            'Continue',
            'Cancel and Reset'
        );
        // Noted as unexpected — once — so the Debug Logs explain the prompt.
        expect(logger.warn).toHaveBeenCalledTimes(1);
    });
});
