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
import type { OperationProgressPayload } from '@/types/webviewPayloads';

interface Notice {
    title: string;
    report: (message: string) => void;
    end: () => void;
}

const notices = new Map<string, Notice>();

/**
 * The notification's line for a progress payload: the STAGE, never the step or
 * detail. The stage is the short set of words, capped in `operationStages` so it
 * fits after the title; the step and detail are the long set, written to sit under
 * the stage in the modal. A notification showing a detail alone read as "The APIs
 * on the workspace's credent…" (owner screenshot, 2026-09-19). VS Code draws the
 * notification at a fixed width, so there is no room to buy.
 */
function lineFor(payload: OperationProgressPayload): string | undefined {
    return payload.stage;
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
    current: OperationProgressPayload,
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
export function forwardToBackgroundNotice(payload: OperationProgressPayload): void {
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
