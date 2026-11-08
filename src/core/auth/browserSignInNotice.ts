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
 * it is a notification. Both have a Cancel that stops the sign-in (`signInSession`).
 *
 * Only the modal's step offers the sign-in link (on 2026-10-23 no browser opened and
 * there was nothing to click), because the modal takes its step down when the sign-in
 * ends. The notification offered it as a second notice, which VS Code gives no way to
 * close from code, so it outlived every sign-in that worked; a sign-in should end as it
 * does everywhere else, on the status bar's check (owner, 2026-11-07).
 *
 * @module core/auth/browserSignInNotice
 */

import * as vscode from 'vscode';
import { cancelSignIn, knownSignInLink, signInLink } from './signInSession';
import { askDuringOperation, modalIsAsking, withdrawQuestion } from '@/core/vscode/operationPrompt';

/** Sign-in. Says where it happens, not that a window opened: that is not ours to know. */
export const BROWSER_SIGN_IN_TITLE = 'Signing In to Adobe in Your Browser';

/** Org switch — a forced sign-in, so name the outcome rather than the mechanism. */
export const BROWSER_ORG_SWITCH_TITLE = 'Opening Browser to Switch Organization';

/** The modal step's question, and its answer that opens the link. */
const IN_MODAL = {
    title: 'Finish Signing In',
    message: 'Sign in to Adobe in your browser. No browser window? Open the sign-in page.',
};

/** The same step before the sign-in page is known: there is no link to offer yet. */
const IN_MODAL_NO_LINK = { title: 'Finish Signing In', message: 'Sign in to Adobe in your browser.' };
const OPEN_PAGE = 'Open Sign-In Page';

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
                return run();
            },
        ),
    );
}

/**
 * The sign-in as the modal's step, from the moment it starts (owner, 2026-11-04: until the link
 * was printed the modal showed the paused run's own line again, "Checking requirements", while
 * the browser opened, so the run looked as though it had gone on without the sign-in). The step
 * gains the link once it is known, and the modal takes it down itself when the sign-in ends. Its
 * Cancel stops the sign-in.
 */
async function signInInModal<T>(run: () => Promise<T>): Promise<T> {
    let finished = false;
    let link: string | undefined;
    // Taken down only to put it back with the link: not an answer.
    let askingWithoutLink = false;
    let relinking = false;
    const work = run();
    // A sign-in that printed its link already opens the step with it.
    link = knownSignInLink();
    const ended = work.then(
        () => undefined,
        () => undefined,
    );
    void ended.then(() => {
        finished = true;
        withdrawQuestion();
    });
    void Promise.race([signInLink(), ended]).then((known) => {
        if (!known || finished) return;
        link = known;
        if (askingWithoutLink) {
            relinking = true;
            withdrawQuestion();
        }
    });
    while (!finished) {
        askingWithoutLink = link === undefined;
        const choice = link
            ? await askDuringOperation(IN_MODAL, OPEN_PAGE, 'Cancel')
            : await askDuringOperation(IN_MODAL_NO_LINK, 'Cancel');
        askingWithoutLink = false;
        if (finished) break;
        if (relinking) {
            relinking = false;
            continue;
        }
        if (choice !== OPEN_PAGE || !link) {
            cancelSignIn();
            break;
        }
        await vscode.env.openExternal(vscode.Uri.parse(link));
    }
    return work;
}
