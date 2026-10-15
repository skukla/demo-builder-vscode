/**
 * The extension's one way to say "that worked" without interrupting: a ✅ line in
 * the status bar for a few seconds.
 *
 * It was a protected method on the command base class, so only commands could use
 * it, and sign-ins wrote their own: `$(check) …` for five seconds from the command
 * palette, `✅ …` for three from the DA.live prompt, and nothing at all from Configure
 * or the wizard. The owner asked that every success read the same way as a republish
 * does (2026-10-15). A failure is not shown here: it disappears in seconds, and a
 * failure needs the SC to act, so it stays a warning.
 *
 * @module core/vscode/statusBarSuccess
 */

import * as vscode from 'vscode';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

/**
 * Show `✅ <message>` in the status bar for `TIMEOUTS.STATUS_BAR_SUCCESS`.
 *
 * @param message - what worked, in a few words ("Signed in to Adobe")
 */
export function showSuccessInStatusBar(message: string): void {
    vscode.window.setStatusBarMessage(`✅ ${message}`, TIMEOUTS.STATUS_BAR_SUCCESS);
}
