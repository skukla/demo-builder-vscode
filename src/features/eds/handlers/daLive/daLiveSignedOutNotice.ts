/**
 * Telling the SC that a forced Adobe sign-in also signed them out of DA.live, where
 * they are looking (`daLiveForcedSignInWatch` decides WHETHER; this decides WHERE).
 *
 * - An agent's `sign_in` collects it into its result (`signInNotices`): the agent says
 *   it and offers the DA.live sign-in. No dialog.
 * - Any other agent call says it in the chat narration (`reportPhase`), and the window
 *   shows the dialog below too, because the person is the one who signed in.
 * - A button press gets a VS Code modal with the existing DA.live sign-in
 *   (`demoBuilder.signInDaLive`), like every other sign-in question (owner,
 *   2026-10-31). Never awaited: the forced sign-in succeeded, and whatever it was for
 *   carries on behind the dialog.
 *
 * Every forced path is covered by one registration, because every forced sign-in
 * runs through `runAdobeLogin` (`AuthenticationService.watchForcedSignIns`): the
 * wizard's Adobe Setup, the Sign In command's "Sign in again", "Switch IMS Org", and
 * the forced retry a normal sign-in falls back to.
 *
 * @module features/eds/handlers/daLive/daLiveSignedOutNotice
 */

import * as vscode from 'vscode';
import { getDaLiveAuthService } from '../edsServiceCache';
import { reportSignInNotice } from '@/core/auth/signInNotices';
import { currentCallTag } from '@/core/logging/callTagContext';
import { reportPhase } from '@/core/utils/agentPhaseChannel';
import type { ForcedSignInWatch } from '@/features/authentication/services/adobeSignIn';
import { createDaLiveForcedSignInWatch } from '@/features/eds/services/daLive/daLiveForcedSignInWatch';

/** The dialog's button: the existing DA.live sign-in. */
export const SIGN_IN_TO_DA_LIVE = 'Sign in to DA.live';

/** The dialog's heading; the sentence sits under it. */
const SIGNED_OUT_TITLE = 'Signed out of DA.live';

/**
 * Say it to the SC, on the surface the sign-in came from.
 *
 * @param message - the sentence (`DA_LIVE_SIGNED_OUT_BY_ADOBE`)
 */
export function tellDaLiveSignedOut(message: string): void {
    if (reportSignInNotice(message)) return;
    if (currentCallTag() !== undefined) reportPhase(message);
    const asked = vscode.window.showWarningMessage(SIGNED_OUT_TITLE, { modal: true, detail: message }, SIGN_IN_TO_DA_LIVE);
    void Promise.resolve(asked).then((choice) => {
        if (choice === SIGN_IN_TO_DA_LIVE) void vscode.commands.executeCommand('demoBuilder.signInDaLive');
    });
}

/**
 * Watch every forced Adobe sign-in for the DA.live sign-in it ends.
 *
 * @param context - the extension context the DA.live sign-in is stored in
 * @param auth - the Adobe sign-in (`AuthenticationService`)
 * @returns what stops the watch
 */
export function registerDaLiveForcedSignInWatch(
    context: vscode.ExtensionContext,
    auth: { watchForcedSignIns(watch: ForcedSignInWatch): { dispose(): void } },
): { dispose(): void } {
    return auth.watchForcedSignIns(createDaLiveForcedSignInWatch(getDaLiveAuthService(context), tellDaLiveSignedOut));
}
