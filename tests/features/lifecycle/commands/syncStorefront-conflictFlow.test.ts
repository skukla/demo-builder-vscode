/**
 * SyncStorefrontCommand — the conflict flow, decision by decision (PL-22, MUT-08).
 *
 * The base suite proves the flow runs end to end. This one pins each step's
 * arguments: how a rebase failure is classified, the modal's options, the poll
 * the command hands PollingService and what its condition answers for each git
 * state (including every alternative of the marker regex), what happens when
 * the poll times out or `rebase --continue` refuses, how conflicts are revealed
 * in VS Code, and the managed-file auto-resolve's two exits.
 */

import * as vscode from 'vscode';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import {
    answerGit,
    capturedPollCondition,
    execFileMock,
    gitFailure,
    makeSyncStorefrontContext,
    makeSyncTargetProject,
    makeLogger,
    makeStateManager,
    readFileMock,
    rejectPushOnce,
    resetSyncStorefrontMocks,
    syncAndPublishMock,
    SyncStorefrontCommand,
} from './syncStorefront.testUtils';
import type { StateManager } from '@/core/state/stateManager';
import type { Logger } from '@/types/logger';

const STOREFRONT = '/projects/demo/components/eds-storefront';
const CONFLICT = gitFailure({ stderr: 'CONFLICT (content): Merge conflict in blocks/hero/hero.js' });
const showWarningMessage = vscode.window.showWarningMessage as jest.Mock;
const showErrorMessage = vscode.window.showErrorMessage as jest.Mock;
const showInformationMessage = vscode.window.showInformationMessage as jest.Mock;
const setStatusBarMessage = vscode.window.setStatusBarMessage as jest.Mock;
const executeCommand = vscode.commands.executeCommand as jest.Mock;
const openTextDocument = vscode.workspace.openTextDocument as jest.Mock;
const showTextDocument = vscode.window.showTextDocument as jest.Mock;

let report: jest.Mock;
let logger: Logger;

function runCommand(): Promise<void> {
    return new SyncStorefrontCommand(
        makeSyncStorefrontContext(),
        makeStateManager(makeSyncTargetProject()) as unknown as StateManager,
        logger
    ).execute();
}

/** A rejected push whose rebase conflicts on `files`; the re-push then succeeds. */
function conflictOn(files: string[], extra: Parameters<typeof answerGit>[0] = {}): string[][] {
    rejectPushOnce();
    syncAndPublishMock.mockResolvedValueOnce({
        committed: false,
        pushed: true,
        helixPublished: false,
        summary: '',
    });
    return answerGit({
        'pull --rebase': CONFLICT,
        'diff --name-only --diff-filter=U': { stdout: files.map((f) => `${f}\n`).join('') },
        ...extra,
    });
}

function pollingMock(): { pollUntilCondition: jest.Mock } {
    const { PollingService } = jest.requireMock('@/core/shell/pollingService') as {
        PollingService: jest.Mock;
    };
    return PollingService.mock.results[0].value;
}

beforeEach(() => {
    resetSyncStorefrontMocks();
    report = jest.fn();
    logger = makeLogger();
    (vscode.window.withProgress as jest.Mock).mockImplementation(
        async (_o: unknown, task: (p: { report: jest.Mock }) => Promise<unknown>) => task({ report })
    );
    readFileMock.mockResolvedValue('resolved content, no markers');
    openTextDocument.mockImplementation(async (file: string) => ({ file }));
});

describe('classifying the rebase failure', () => {
    it('a conflict reported on stderr is a conflict — nothing unexpected is logged', async () => {
        conflictOn(['blocks/hero/hero.js']);
        showWarningMessage.mockResolvedValue('Continue');

        await runCommand();

        expect(logger.warn).not.toHaveBeenCalled();
        expect(showWarningMessage).toHaveBeenCalledTimes(1);
    });

    it('a conflict reported on stdout only is still a conflict', async () => {
        conflictOn(['blocks/hero/hero.js'], {
            'pull --rebase': gitFailure({ stdout: 'CONFLICT (content): Merge conflict' }),
        });
        showWarningMessage.mockResolvedValue('Continue');

        await runCommand();

        expect(logger.warn).not.toHaveBeenCalled();
    });

    it('reports the merge step before pulling', async () => {
        rejectPushOnce();
        syncAndPublishMock.mockResolvedValueOnce({ committed: false, pushed: true, helixPublished: false, summary: '' });
        const git = answerGit({});

        await runCommand();

        expect(report).toHaveBeenCalledWith({
            message: 'Someone else changed the storefront — merging their work in…',
        });
        expect(git[0]).toEqual(['-C', STOREFRONT, 'pull', '--rebase']);
    });
});

describe('the manual conflict flow', () => {
    it('asks with a modal, then waits on the SC before continuing the rebase', async () => {
        const git = conflictOn(['blocks/hero/hero.js']);
        showWarningMessage.mockResolvedValue('Continue');

        await runCommand();

        expect(showWarningMessage).toHaveBeenCalledWith(
            expect.stringContaining('Resolve each conflict in the Source Control panel'),
            { modal: true },
            'Continue',
            'Cancel and Reset'
        );
        expect(report).toHaveBeenCalledWith({
            message: 'Waiting for you to resolve the overlapping changes in Source Control…',
        });
        expect(pollingMock().pollUntilCondition).toHaveBeenCalledWith(expect.any(Function), {
            timeout: TIMEOUTS.VERY_LONG,
            name: 'storefront-conflict-resolution',
            initialDelay: TIMEOUTS.POLL.INITIAL,
            maxDelay: TIMEOUTS.POLL.MAX,
        });
        expect(report).toHaveBeenCalledWith({ message: 'Finishing the merge…' });
        expect(git).toContainEqual(['-C', STOREFRONT, 'rebase', '--continue']);
        expect(report).toHaveBeenCalledWith({ message: 'Pushing to GitHub…' });
        expect(syncAndPublishMock).toHaveBeenCalledTimes(2);
    });

    it('falls back to the prompt when git cannot even list the conflicts', async () => {
        conflictOn([], { 'diff --name-only --diff-filter=U': gitFailure({ stderr: 'fatal: bad index' }) });
        showWarningMessage.mockResolvedValue('Continue');

        await expect(runCommand()).resolves.toBeUndefined();

        expect(showWarningMessage).toHaveBeenCalledTimes(1);
        // Nothing to reveal: no file was opened.
        expect(openTextDocument).not.toHaveBeenCalled();
        expect(showTextDocument).not.toHaveBeenCalled();
    });

    it('reveals the conflicts: registers the repo, shows SCM, opens each file un-previewed', async () => {
        conflictOn(['blocks/hero/hero.js', ' scripts/aem.js\r']);
        showWarningMessage.mockResolvedValue('Continue');

        await runCommand();

        expect(executeCommand.mock.calls).toEqual([
            ['git.openRepository', STOREFRONT],
            ['workbench.view.scm'],
        ]);
        expect(openTextDocument.mock.calls).toEqual([
            [`${STOREFRONT}/blocks/hero/hero.js`],
            [`${STOREFRONT}/scripts/aem.js`],
        ]);
        expect(showTextDocument).toHaveBeenCalledWith(
            { file: `${STOREFRONT}/blocks/hero/hero.js` },
            { preview: false }
        );
    });

    it('still shows SCM and opens the files when the repo cannot be registered', async () => {
        conflictOn(['blocks/hero/hero.js']);
        showWarningMessage.mockResolvedValue('Continue');
        executeCommand.mockImplementation(async (command: string) => {
            if (command === 'git.openRepository') throw new Error('no git extension');
        });

        await runCommand();

        expect(executeCommand).toHaveBeenCalledWith('workbench.view.scm');
        expect(showTextDocument).toHaveBeenCalledTimes(1);
        expect(logger.warn).toHaveBeenCalledTimes(1);
    });

    it('a file that will not open does not stop the others', async () => {
        conflictOn(['a.js', 'b.js']);
        showWarningMessage.mockResolvedValue('Continue');
        openTextDocument.mockImplementationOnce(async () => {
            throw new Error('binary');
        });

        await runCommand();

        expect(showTextDocument).toHaveBeenCalledTimes(1);
        expect(showTextDocument).toHaveBeenCalledWith({ file: `${STOREFRONT}/b.js` }, { preview: false });
    });

    it('a poll that times out aborts the rebase and says so, without pushing', async () => {
        const git = conflictOn(['blocks/hero/hero.js']);
        showWarningMessage.mockResolvedValue('Continue');
        const { PollingService } = jest.requireMock('@/core/shell/pollingService') as {
            PollingService: jest.Mock;
        };
        PollingService.mockImplementationOnce(() => ({
            pollUntilCondition: jest.fn(async () => {
                throw new Error('timed out');
            }),
        }));

        await runCommand();

        expect(git).toContainEqual(['-C', STOREFRONT, 'rebase', '--abort']);
        expect(showErrorMessage).toHaveBeenCalledWith(
            expect.stringContaining('Timed out waiting for conflict resolution'),
            'OK'
        );
        expect(syncAndPublishMock).toHaveBeenCalledTimes(1);
    });

    it('a rebase that refuses to continue is aborted and reported, without pushing', async () => {
        const git = conflictOn(['blocks/hero/hero.js'], {
            'rebase --continue': gitFailure({ stderr: 'error: could not apply abc123' }),
        });
        showWarningMessage.mockResolvedValue('Continue');

        await runCommand();

        expect(git).toContainEqual(['-C', STOREFRONT, 'rebase', '--abort']);
        expect(showErrorMessage).toHaveBeenCalledWith(
            'Could not continue the rebase. Your local changes are intact.',
            'OK'
        );
        expect(syncAndPublishMock).toHaveBeenCalledTimes(1);
    });

    it('"Cancel and Reset" aborts and tells the SC, without polling', async () => {
        conflictOn(['blocks/hero/hero.js']);
        showWarningMessage.mockResolvedValue('Cancel and Reset');

        await runCommand();

        expect(showInformationMessage).toHaveBeenCalledWith(
            'Sync canceled. Your local changes are intact.',
            'OK'
        );
        const { PollingService } = jest.requireMock('@/core/shell/pollingService') as {
            PollingService: jest.Mock;
        };
        expect(PollingService).not.toHaveBeenCalled();
        expect(syncAndPublishMock).toHaveBeenCalledTimes(1);
    });
});

describe('the poll condition — are all conflicts resolved?', () => {
    async function conditionAfterFlow(): Promise<() => Promise<boolean>> {
        conflictOn(['blocks/hero/hero.js']);
        showWarningMessage.mockResolvedValue('Continue');
        await runCommand();
        return capturedPollCondition();
    }

    it('is true once git lists no conflicted files', async () => {
        const resolved = await conditionAfterFlow();
        answerGit({ 'diff --name-only --diff-filter=U': { stdout: '\n' } });

        await expect(resolved()).resolves.toBe(true);
    });

    it('is true when the listed files carry no markers, false while any does', async () => {
        const resolved = await conditionAfterFlow();
        answerGit({ 'diff --name-only --diff-filter=U': { stdout: 'a.js\nb.js\n' } });

        readFileMock.mockResolvedValue('clean');
        await expect(resolved()).resolves.toBe(true);

        readFileMock.mockResolvedValueOnce('clean').mockResolvedValueOnce('<<<<<<< HEAD\nx\n=======\ny\n>>>>>>> theirs\n');
        await expect(resolved()).resolves.toBe(false);
    });

    it('is false when a listed file cannot be read, or git cannot list at all', async () => {
        const resolved = await conditionAfterFlow();
        answerGit({ 'diff --name-only --diff-filter=U': { stdout: 'a.js\n' } });
        readFileMock.mockRejectedValueOnce(new Error('ENOENT'));
        await expect(resolved()).resolves.toBe(false);

        answerGit({ 'diff --name-only --diff-filter=U': gitFailure({ stderr: 'fatal' }) });
        await expect(resolved()).resolves.toBe(false);
    });

    it('reads the files git named, resolved against the storefront', async () => {
        const resolved = await conditionAfterFlow();
        answerGit({ 'diff --name-only --diff-filter=U': { stdout: 'blocks/x.js\n' } });
        readFileMock.mockClear();

        await resolved();

        expect(readFileMock).toHaveBeenCalledWith(`${STOREFRONT}/blocks/x.js`, 'utf-8');
    });

    describe('the marker regex', () => {
        const isResolvedWith = async (content: string): Promise<boolean> => {
            const resolved = await conditionAfterFlow();
            answerGit({ 'diff --name-only --diff-filter=U': { stdout: 'a.js\n' } });
            readFileMock.mockResolvedValue(content);
            return resolved();
        };

        it.each([
            ['a start marker with a label', '<<<<<<< HEAD\n'],
            ['a bare middle marker', 'x\n=======\ny\n'],
            ['an end marker followed by a space', '>>>>>>> theirs\n'],
            ['a marker with trailing CR', '=======\r\n'],
        ])('sees %s as unresolved', async (_name, content) => {
            await expect(isResolvedWith(content)).resolves.toBe(false);
        });

        it.each([
            ['a marker-like run mid-line', 'const s = "<<<<<<< not a marker";\n'],
            ['a single angle bracket at line start', '> quoted\n'],
            ['a single equals at line start', '= 1\n'],
            ['a single less-than at line start', '< 1\n'],
            ['six equals signs', '======\n'],
        ])('does not mistake %s for a marker', async (_name, content) => {
            await expect(isResolvedWith(content)).resolves.toBe(true);
        });
    });
});

describe('managed-file auto-resolve', () => {
    it('says a configuration update was resolved automatically', async () => {
        conflictOn(['config.json']);

        await runCommand();

        expect(setStatusBarMessage).toHaveBeenCalledWith(
            '✅ Storefront synced. Resolved a configuration update automatically.',
            expect.any(Number)
        );
    });

    it('skips the emptied commit when git says so on STDOUT', async () => {
        let continues = 0;
        const git = conflictOn(['config.json'], {
            'rebase --continue': () =>
                (continues++ === 0
                    ? gitFailure({ stdout: 'nothing to commit, working tree clean' })
                    : {}),
        });

        await runCommand();

        expect(git).toContainEqual(['-C', STOREFRONT, '-c', 'core.editor=true', 'rebase', '--skip']);
        expect(syncAndPublishMock).toHaveBeenCalledTimes(2);
    });

    it('aborts, and does not skip, when rebase --continue fails for another reason', async () => {
        const git = conflictOn(['config.json'], {
            'rebase --continue': gitFailure({ stderr: 'error: could not apply abc123' }),
        });

        await runCommand();

        expect(git.some((a) => a.includes('--skip'))).toBe(false);
        expect(git).toContainEqual(['-C', STOREFRONT, 'rebase', '--abort']);
        expect(showErrorMessage).toHaveBeenCalledWith(
            'Could not automatically resolve the configuration update. Your local changes are intact.',
            'OK'
        );
        expect(syncAndPublishMock).toHaveBeenCalledTimes(1);
        expect(execFileMock).not.toHaveBeenCalledWith('git', expect.arrayContaining(['--theirs']), expect.anything());
    });
});
