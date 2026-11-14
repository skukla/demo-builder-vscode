/**
 * The notification an operation moves into when the SC chooses "Run in background"
 * in its progress modal (PL-59).
 *
 * The modal used to just close, and the SC lost track of what was happening (owner,
 * 2026-09-19). Now the same operation carries on narrating in a VS Code progress
 * notification: titled like the modal, starting at the stage it had reached, and
 * updated with every stage after. It ends in the result's own words, the window's own
 * titles (prototype-conventions rule 21; step-03 Q4): a clean success as a notification
 * that closes itself after a few seconds ("Bodea Installed", `showSelfClosingNotice`); a
 * warning as a warning notification that stays; a note as a plain one; a failure as a
 * warning with the reason and the Debug Logs. Reopening the modal takes it back and
 * closes the notification — one surface narrates at a time.
 *
 * @module features/dashboard/handlers/operationBackgroundNotice
 */

import * as vscode from 'vscode';
import { showSelfClosingNotice } from './selfClosingNotice';
import { stageLine } from '@/core/utils/stageLine';
import type { OperationProgressPayload } from '@/types/webviewPayloads';
import type { BackgroundOperationRequest } from '@/types/webviewRequests';

/** The window's titles a notice ends in: its result's words. */
export type NoticeTitles = Pick<BackgroundOperationRequest, 'doneTitle' | 'failedTitle' | 'warnedTitle'>;

interface Notice {
    titles: NoticeTitles;
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
    return payload.stage && stageLine(payload.stage, payload.position);
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
    titles: NoticeTitles,
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
                    titles,
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
    endNotice(notice.titles, payload);
}

/**
 * Say how the operation ended, in its result's words: a success by the run's own title when it gave
 * one ("No Changes to Save"), else the window's.
 */
function endNotice(titles: NoticeTitles, payload: OperationProgressPayload): void {
    const done = payload.title ?? titles.doneTitle;
    if (payload.state === 'succeeded' && payload.warning) {
        // Something the SC must act on: a warning, which stays.
        void vscode.window.showWarningMessage(`${titles.warnedTitle ?? done}. ${payload.warning}`);
        return;
    }
    if (payload.state === 'succeeded' && payload.note) {
        // Something to know, nothing to do: plain, never a warning.
        void vscode.window.showInformationMessage(`${done}. ${payload.note}`);
        return;
    }
    if (payload.state === 'succeeded') {
        void showSelfClosingNotice(done);
        return;
    }
    const failed = payload.error ? `${titles.failedTitle}. ${payload.error}` : titles.failedTitle;
    void vscode.window
        .showWarningMessage(failed, 'Open Debug Logs')
        .then((choice) => {
            if (choice) void vscode.commands.executeCommand('demoBuilder.showDebugLogs');
        });
}
