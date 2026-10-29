/**
 * browserSignInNotice — where the SC is told they are signing in, with the link and
 * a Cancel: a step in the modal when one is on screen, a notification when not
 * (owner, 2026-10-23).
 */

import * as vscode from 'vscode';
import { withBrowserSignInNotice } from '@/core/auth/browserSignInNotice';
import { beginSignIn, signInWasCancelled, type SignInRun } from '@/core/auth/signInSession';
import { askDuringOperation, modalIsAsking, withdrawQuestion } from '@/core/vscode/operationPrompt';

jest.mock('@/core/vscode/operationPrompt', () => ({
    askDuringOperation: jest.fn(),
    modalIsAsking: jest.fn(),
    withdrawQuestion: jest.fn(),
}));

const LINK = 'https://aio-login.example/applogin?id=abc';
const mockAsk = askDuringOperation as jest.Mock;
const mockModal = modalIsAsking as jest.Mock;
const mockWithdraw = withdrawQuestion as jest.Mock;

/** A sign-in that prints its link, then waits until the test ends it. */
function signInThatWaits(): { run: () => Promise<boolean>; finish: (ok: boolean) => void; session: () => SignInRun } {
    let session: SignInRun | undefined;
    let finish: (ok: boolean) => void = () => {};
    const run = async (): Promise<boolean> => {
        session = beginSignIn();
        session.announceLink(LINK);
        const ok = await new Promise<boolean>((resolve) => {
            finish = resolve;
            session?.signal.addEventListener('abort', () => resolve(false));
        });
        session.end();
        return ok;
    };
    return { run, finish: (ok) => finish(ok), session: () => session as SignInRun };
}

/**
 * The modal's question, as the real one behaves: it waits for an answer, and taking
 * it down (`withdrawQuestion`) answers it with nothing.
 */
function questionThatWaits(): void {
    mockAsk.mockImplementation(
        () =>
            new Promise((resolve) => {
                mockWithdraw.mockImplementation(() => resolve(undefined));
            }),
    );
}

/** Let the awaited link and the question reach the test. */
async function settle(): Promise<void> {
    for (let i = 0; i < 5; i++) await Promise.resolve();
}

beforeEach(() => {
    jest.clearAllMocks();
    mockAsk.mockReset();
    mockWithdraw.mockReset();
});

describe('with a modal on screen', () => {
    beforeEach(() => mockModal.mockReturnValue(true));

    it('is a step in the modal, not a notification on top of it', async () => {
        const signIn = signInThatWaits();
        questionThatWaits();

        const result = withBrowserSignInNotice(signIn.run);
        await settle();

        expect(vscode.window.withProgress).not.toHaveBeenCalled();
        expect(mockAsk).toHaveBeenCalledWith(
            { title: 'Finish signing in', message: expect.stringMatching(/browser/) },
            'Open sign-in page',
            'Cancel',
        );
        signIn.finish(true);
        await expect(result).resolves.toBe(true);
    });

    it('opens the sign-in page when asked, and keeps waiting for the sign-in', async () => {
        const signIn = signInThatWaits();
        questionThatWaits();
        mockAsk.mockResolvedValueOnce('Open sign-in page');

        const result = withBrowserSignInNotice(signIn.run);
        await settle();

        expect(vscode.env.openExternal).toHaveBeenCalledWith(expect.objectContaining({ path: LINK }));
        expect(mockAsk).toHaveBeenCalledTimes(2);
        signIn.finish(true);
        await expect(result).resolves.toBe(true);
    });

    it("stops the sign-in on the modal's Cancel", async () => {
        const signIn = signInThatWaits();
        mockAsk.mockResolvedValue(undefined);

        const result = withBrowserSignInNotice(signIn.run);

        await expect(result).resolves.toBe(false);
        expect(signIn.session().signal.aborted).toBe(true);
        expect(signInWasCancelled()).toBe(true);
    });

    it('takes the question down itself when the sign-in finishes in the browser', async () => {
        const signIn = signInThatWaits();
        questionThatWaits();

        const result = withBrowserSignInNotice(signIn.run);
        await settle();
        signIn.finish(true);
        await result;
        await settle();

        expect(mockWithdraw).toHaveBeenCalled();
        expect(signIn.session().signal.aborted).toBe(false);
    });
});

describe('with no modal', () => {
    beforeEach(() => mockModal.mockReturnValue(false));

    it('is a cancellable notification, with the sign-in link offered beside it', async () => {
        let cancel: () => void = () => {};
        (vscode.window.withProgress as jest.Mock).mockImplementationOnce(async (_options, task) =>
            task(
                { report: jest.fn() },
                { isCancellationRequested: false, onCancellationRequested: (fn: () => void) => (cancel = fn) },
            ),
        );
        (vscode.window.showInformationMessage as jest.Mock).mockResolvedValueOnce('Open sign-in page');
        const signIn = signInThatWaits();

        const result = withBrowserSignInNotice(signIn.run);
        await settle();

        expect(vscode.window.withProgress).toHaveBeenCalledWith(
            expect.objectContaining({ location: vscode.ProgressLocation.Notification, cancellable: true }),
            expect.any(Function),
        );
        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
            expect.stringMatching(/browser/),
            'Open sign-in page',
        );
        expect(vscode.env.openExternal).toHaveBeenCalledWith(expect.objectContaining({ path: LINK }));
        cancel();
        await expect(result).resolves.toBe(false);
        expect(signIn.session().signal.aborted).toBe(true);
    });
});
