/**
 * SyncStorefrontCommand — what it ANSWERS, and what it asks the modal (PL-70, MUT-01).
 *
 * `execute` returns a `SyncStorefrontOutcome` so the dashboard's progress modal can
 * close or show why (PL-59). The sibling suites assert what the SC is told by toast
 * and never read the return value, so every ending could answer `{}` — or the wrong
 * `success` — and the modal would close on a failure or hang on a success with the
 * suite green. Each ending is read here with `toStrictEqual`: `toEqual` lets
 * `{ cancelled: undefined }` and `{}` pass for each other.
 *
 * The second half is the commit-message question when the modal asks it: the exact
 * question handed to the prompt, and what becomes of the answer.
 */

import * as vscode from 'vscode';
import {
    PushRejectedError,
    makeSyncStorefrontContext,
    makeSyncTargetProject,
    makeLogger,
    makeStateManager,
    mockGetAccessToken,
    resetSyncStorefrontMocks,
    statMock,
    syncAndPublishMock,
    SyncStorefrontCommand,
    type SyncStorefrontOutcome,
} from './syncStorefront.testUtils';
import { heldProgress } from '@/core/vscode/operationProgress';
import * as operationPrompt from '@/core/vscode/operationPrompt';
import type { OperationPrompt } from '@/types/webviewPayloads';
import type { Project } from '@/types/base';

const DEFAULT_MESSAGE = 'Demo Builder: sync local changes';
const showErrorMessage = vscode.window.showErrorMessage as jest.Mock;
const showWarningMessage = vscode.window.showWarningMessage as jest.Mock;

function runCommand(
    project: Project | null = makeSyncTargetProject()
): Promise<SyncStorefrontOutcome> {
    return new SyncStorefrontCommand(
        makeSyncStorefrontContext(),
        makeStateManager(project),
        makeLogger()
    ).execute();
}

/** The question the modal was showing when it was answered — read off the real progress store. */
let shownPrompt: OperationPrompt | undefined;

/** Run the sync as the operation a modal is showing, and answer its one question. */
async function runInModal(
    action: string | undefined,
    values?: Record<string, string>
): Promise<SyncStorefrontOutcome> {
    const done = operationPrompt.withModalAsking('sync', () => runCommand());
    for (let i = 0; i < 200 && !operationPrompt.isAwaitingAnswer('sync'); i++) {
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    shownPrompt = heldProgress('sync')?.prompt;
    operationPrompt.answerOperationPrompt('sync', action, values);
    return done;
}

const committedMessage = () => syncAndPublishMock.mock.calls[0][0].commitMessage;

beforeEach(() => {
    shownPrompt = undefined;
    resetSyncStorefrontMocks();
    mockGetAccessToken.mockResolvedValue(null);
    syncAndPublishMock.mockResolvedValue({
        committed: true,
        pushed: true,
        helixPublished: false,
        summary: '',
    });
});

describe('execute — the outcome it answers', () => {
    it('answers success, and nothing else, for a sync that ran', async () => {
        expect(await runCommand()).toStrictEqual({ success: true });
    });

    it('answers a cancelled failure carrying the warning when no project is loaded', async () => {
        const outcome = await runCommand(null);

        const [warned] = showWarningMessage.mock.calls[0];
        expect(typeof warned).toBe('string');
        expect(outcome).toStrictEqual({ success: false, error: warned, cancelled: true });
    });

    it('answers a failure carrying the error it showed when the project has no storefront', async () => {
        const outcome = await runCommand({ ...makeSyncTargetProject(), componentInstances: {} });

        const [shown] = showErrorMessage.mock.calls[0];
        expect(typeof shown).toBe('string');
        expect(outcome).toStrictEqual({ success: false, error: shown });
    });

    it('answers a failure carrying the error it showed when the storefront is not a git repository', async () => {
        statMock.mockRejectedValue(new Error('ENOENT'));

        const outcome = await runCommand();

        const [shown] = showErrorMessage.mock.calls[0];
        expect(typeof shown).toBe('string');
        expect(outcome).toStrictEqual({ success: false, error: shown });
        expect(syncAndPublishMock).not.toHaveBeenCalled();
    });

    it("answers a failure carrying the rule's own diagnosis when a repository rule refused the push", async () => {
        const diagnosis = 'Push declined: a secret was found in config.json';
        syncAndPublishMock.mockRejectedValueOnce(new PushRejectedError(diagnosis, 'ruleset'));

        expect(await runCommand()).toStrictEqual({ success: false, error: diagnosis });
    });
});

describe('the commit message, asked in the progress modal', () => {
    it('asks one question: a message field holding the default, and Sync as the only action', async () => {
        await runInModal('Sync', { message: 'New hero copy' });

        expect(shownPrompt).toStrictEqual({
            message: expect.stringMatching(/\S/),
            fields: [
                {
                    id: 'message',
                    label: expect.stringMatching(/\S/),
                    value: DEFAULT_MESSAGE,
                    placeholder: expect.stringMatching(/\S/),
                },
            ],
            actions: ['Sync'],
        });
    });

    it('commits what was typed without the space around it', async () => {
        await runInModal('Sync', { message: '  New hero copy \n' });

        expect(committedMessage()).toBe('New hero copy');
    });

    it('commits the default when the answer carries no message at all', async () => {
        const outcome = await runInModal('Sync');

        expect(outcome).toStrictEqual({ success: true });
        expect(committedMessage()).toBe(DEFAULT_MESSAGE);
    });

    it('commits the default when only spaces were typed', async () => {
        await runInModal('Sync', { message: '   ' });

        expect(committedMessage()).toBe(DEFAULT_MESSAGE);
    });
});
