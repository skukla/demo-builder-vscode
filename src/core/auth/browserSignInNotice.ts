/**
 * browserSignInNotice — the house telegraph for "you are signing in in your browser".
 *
 * Adobe sign-in leaves VS Code entirely. Without a word the click has no visible
 * effect for a beat and then a browser window appears from nowhere, which reads as a
 * glitch rather than as the thing the user just asked for.
 *
 * `adobeAuthGuard` got this right and said why; the user-initiated handlers
 * (`reAuthenticate`, `switchOrg`) called the same login directly and stayed silent
 * (2026-07-31). Same job, so it lives in one place rather than being remembered at
 * each call site.
 *
 * Where it says it follows the progress (owner, 2026-10-23): with a modal on screen
 * the sign-in is a step in that modal, not a notification on top of it; with none,
 * it is a notification. Both offer the sign-in link, because on 2026-10-23 no browser
 * opened and there was nothing to click, and both have a Cancel that stops the
 * sign-in (`signInSession`).
 *
 * @module core/auth/browserSignInNotice
 */

import * as vscode from 'vscode';
import { cancelSignIn, signInLink } from './signInSession';
import { askDuringOperation, modalIsAsking, withdrawQuestion } from '@/core/vscode/operationPrompt';

/** Sign-in. Says where it happens, not that a window opened: that is not ours to know. */
export const BROWSER_SIGN_IN_TITLE = 'Signing in to Adobe in your browser';

/** Org switch — a forced sign-in, so name the outcome rather than the mechanism. */
export const BROWSER_ORG_SWITCH_TITLE = 'Opening browser to switch organization';

/** The modal step's question, and its answer that opens the link. */
const IN_MODAL = {
    title: 'Finish signing in',
    message: 'Sign in to Adobe in your browser. No browser window? Open the sign-in page.',
};
const OPEN_PAGE = 'Open sign-in page';
const NO_WINDOW = 'No browser window opened for the Adobe sign-in? Open the sign-in page here.';

/**
 * Run a browser-opening auth call where the SC can see it, with its link and a Cancel.
 *
 * @param run - the login call to wrap
 * @param title - the notification text (defaults to plain sign-in)
 * @returns whatever `run` resolves to
 */
export function withBrowserSignInNotice<T>(
    run: () => Promise<T>,
    title: string = BROWSER_SIGN_IN_TITLE,
): Promise<T> {
    if (modalIsAsking()) return signInInModal(run);
    // withProgress returns a Thenable, not a Promise — await it so callers get the
    // real thing (they .catch()/.finally() on it).
    return Promise.resolve(
        vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title, cancellable: true },
            (_progress, token) => {
                token.onCancellationRequested(cancelSignIn);
                const work = run();
                void offerLinkBeside(work);
                return work;
            },
        ),
    );
}

/**
 * The link, as a button beside the notification: its message line is a stage name,
 * cut off past 25 characters, so a link there could not be read. Offered only while
 * the sign-in is still waiting.
 */
async function offerLinkBeside(work: Promise<unknown>): Promise<void> {
    const ended = work.then(
        () => undefined,
        () => undefined,
    );
    const link = await Promise.race([signInLink(), ended]);
    if (!link) return;
    const choice = await vscode.window.showInformationMessage(NO_WINDOW, OPEN_PAGE);
    if (choice === OPEN_PAGE) await vscode.env.openExternal(vscode.Uri.parse(link));
}

/**
 * The sign-in as the modal's step: once the link is printed, the modal asks the SC to
 * finish in their browser, offers the link, and takes the question down itself when
 * the sign-in ends. Its Cancel stops the sign-in.
 */
async function signInInModal<T>(run: () => Promise<T>): Promise<T> {
    let finished = false;
    const work = run();
    const ended = work.then(
        () => undefined,
        () => undefined,
    );
    void ended.then(() => {
        finished = true;
        withdrawQuestion();
    });
    const link = await Promise.race([signInLink(), ended]);
    while (link && !finished) {
        const choice = await askDuringOperation(IN_MODAL, OPEN_PAGE, 'Cancel');
        if (finished) break;
        if (choice !== OPEN_PAGE) {
            cancelSignIn();
            break;
        }
        await vscode.env.openExternal(vscode.Uri.parse(link));
    }
    return work;
}
