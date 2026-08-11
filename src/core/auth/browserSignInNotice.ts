/**
 * browserSignInNotice — the house telegraph for "a browser is about to open".
 *
 * Adobe sign-in leaves VS Code entirely. Without a notification the click has no
 * visible effect for a beat and then a browser window appears from nowhere, which
 * reads as a glitch rather than as the thing the user just asked for.
 *
 * `adobeAuthGuard` got this right and said why; the user-initiated handlers
 * (`reAuthenticate`, `switchOrg`) called the same login directly and stayed silent
 * (2026-07-31). Same job, so it lives in one place rather than being remembered at
 * each call site.
 *
 * @module core/auth/browserSignInNotice
 */

import * as vscode from 'vscode';

/** Sign-in. The wording the extension has used for this since the auth guard. */
export const BROWSER_SIGN_IN_TITLE = 'Opening a browser window to sign in to Adobe…';

/** Org switch — a forced sign-in, so name the outcome rather than the mechanism. */
export const BROWSER_ORG_SWITCH_TITLE = 'Opening browser to switch organization…';

/**
 * Run a browser-opening auth call behind a progress notification.
 *
 * Not cancellable: the browser window is already open by the time the notification
 * shows, and a Cancel that cannot close it would be a lie.
 *
 * @param run - the login call to wrap
 * @param title - the notification text (defaults to plain sign-in)
 * @returns whatever `run` resolves to
 */
export function withBrowserSignInNotice<T>(
    run: () => Promise<T>,
    title: string = BROWSER_SIGN_IN_TITLE,
): Promise<T> {
    // withProgress returns a Thenable, not a Promise — await it so callers get the
    // real thing (they .catch()/.finally() on it).
    return Promise.resolve(
        vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title,
                cancellable: false,
            },
            run,
        ),
    );
}
