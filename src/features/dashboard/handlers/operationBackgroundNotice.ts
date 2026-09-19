/**
 * The notification an operation moves into when the SC chooses "Run in background"
 * in its progress modal (PL-59).
 *
 * The modal used to just close, and the SC lost track of what was happening (owner,
 * 2026-09-19). Now the same operation carries on narrating in a VS Code progress
 * notification: titled like the modal, starting at the stage it had reached, and
 * updated with every stage after. Success closes it with a status-bar line; a failure
 * turns it into a warning with the reason and the Debug Logs. Reopening the modal
 * takes it back and closes the notification — one surface narrates at a time.
 *
 * @module features/dashboard/handlers/operationBackgroundNotice
 */

import * as vscode from 'vscode';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { ComponentOperationProgressPayload } from '@/types/webviewPayloads';

interface Notice {
    title: string;
    report: (message: string) => void;
    end: () => void;
}

const notices = new Map<string, Notice>();

/**
 * The notification's line for a progress payload: the step alone, or the stage when
 * there is none. One short line, as the operation's own notification has always
 * shown — joining stage and step wrapped the card onto two lines (owner,
 * 2026-08-27; the rule is written on `withComponentProgress`). VS Code draws the
 * notification at a fixed width, so there is no room to buy.
 */
function lineFor(payload: ComponentOperationProgressPayload): string | undefined {
    return payload.step ?? payload.stage;
}

/**
 * Open the notification for a running operation.
 *
 * @param current - where the operation is now
 * @param stillRunning - read once the notification is up: an operation that ended in
 *   between must not leave a notification with nothing left to close it
 */
export function openBackgroundNotice(
    title: string,
    current: ComponentOperationProgressPayload,
    stillRunning: () => boolean,
): void {
    if (notices.has(current.id)) return;
    void vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title, cancellable: false },
        (progress) =>
            new Promise<void>((resolve) => {
                if (!stillRunning()) {
                    resolve();
                    return;
                }
                notices.set(current.id, {
                    title,
                    report: (message) => progress.report({ message }),
                    end: resolve,
                });
                const line = lineFor(current);
                if (line) progress.report({ message: line });
            }),
    );
}

/** Close the notification without a word: the modal has taken the operation back. */
export function closeBackgroundNotice(id: string): void {
    notices.get(id)?.end();
    notices.delete(id);
}

/** Tell the notification, if the operation has one, where the operation is now. */
export function forwardToBackgroundNotice(payload: ComponentOperationProgressPayload): void {
    const notice = notices.get(payload.id);
    if (!notice) return;
    if (payload.state === 'running') {
        const line = lineFor(payload);
        if (line) notice.report(line);
        return;
    }
    closeBackgroundNotice(payload.id);
    if (payload.state === 'succeeded') {
        vscode.window.setStatusBarMessage(`$(check) ${notice.title} — done`, TIMEOUTS.STATUS_BAR_SUCCESS);
        return;
    }
    void vscode.window
        .showWarningMessage(`${notice.title} did not finish: ${payload.error}`, 'Open Debug Logs')
        .then((choice) => {
            if (choice) void vscode.commands.executeCommand('demoBuilder.showDebugLogs');
        });
}
