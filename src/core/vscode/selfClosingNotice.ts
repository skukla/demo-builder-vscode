/**
 * The house's self-closing popup: a VS Code progress notification with no button that closes itself
 * after a few seconds. Used where something worked and the SC only needs to see it did: a command's
 * success (`BaseCommand.showProgressNotification`), and an operation run in the background ending
 * cleanly (`operationBackgroundNotice`; step-03 Q4).
 *
 * A failure is never shown here: it needs the SC to act, so it stays as a warning.
 *
 * @module core/vscode/selfClosingNotice
 */

import * as vscode from 'vscode';
import { sleep } from '@/core/utils/sleep';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

/**
 * Show `title` in a progress notification that closes itself.
 *
 * @param title - what worked, in the result's words ("Bodea Installed")
 * @param duration - how long it stays, in milliseconds
 * @returns once it has closed
 */
export async function showSelfClosingNotice(
    title: string,
    duration: number = TIMEOUTS.UI.NOTIFICATION,
): Promise<void> {
    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title, cancellable: false },
        async () => {
            await sleep(duration);
        },
    );
}
