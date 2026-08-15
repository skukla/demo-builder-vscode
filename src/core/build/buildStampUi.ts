/**
 * Surfaces the build stamp so the running extension names its own checkout.
 *
 * See `buildInfo.ts` for why this exists. Two surfaces, deliberately different:
 *
 *  - A log line on EVERY activation, dev or packaged. It costs one line and it
 *    is the record you have after the fact, when the window is gone.
 *  - A status bar item in Development mode ONLY. Users running a released VSIX
 *    have one extension and no ambiguity; developers with several checkouts have
 *    exactly the problem this solves. Clicking it walks `src/` and reports
 *    whether `dist/` is behind — the on-demand half, because that walk is not
 *    worth doing on every window load.
 */

import * as path from 'path';
import * as vscode from 'vscode';
import { describeBuildInfo, isDistStale, newestMtimeUnder, readBuildInfo } from './buildInfo';

export const SHOW_BUILD_INFO_COMMAND = 'demoBuilder.showBuildInfo';

/** Only the one method this needs — accepts both `Logger` and `DebugLogger`. */
interface DebugSink {
    debug(message: string): void;
}

/**
 * Log the build identity and, in Development mode, pin it to the status bar.
 *
 * Best-effort by contract: a missing or unreadable stamp logs a note and adds no
 * status item. Never throws — activation must not fail over a diagnostic.
 */
export async function registerBuildStamp(
    context: vscode.ExtensionContext,
    logger: DebugSink,
): Promise<void> {
    const info = await readBuildInfo(context.extensionPath);

    if (!info) {
        logger.debug('[Build] no dist/build-info.json — build identity unknown');
        return;
    }

    logger.debug(`[Build] ${describeBuildInfo(info)}`);

    if (context.extensionMode !== vscode.ExtensionMode.Development) return;

    const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 0);
    item.text = `$(tools) ${info.branch}@${info.commit}${info.dirty ? '+' : ''}`;
    item.tooltip = describeBuildInfo(info);
    item.command = SHOW_BUILD_INFO_COMMAND;
    item.show();
    context.subscriptions.push(item);

    context.subscriptions.push(
        vscode.commands.registerCommand(SHOW_BUILD_INFO_COMMAND, async () => {
            const newest = await newestMtimeUnder(path.join(info.checkoutPath, 'src'));
            const stale = isDistStale(info, newest);
            const detail = [
                `Checkout: ${info.checkoutPath}`,
                `Branch:   ${info.branch}`,
                `Commit:   ${info.commit}${info.dirty ? ' (uncommitted changes)' : ''}`,
                `Built:    ${info.builtAt}`,
                stale
                    ? 'dist/ is BEHIND src/ — rebuild, then reload the window.'
                    : 'dist/ is up to date with src/.',
            ].join('\n');

            // Modal: this is read when someone is already confused about which
            // build they are looking at, and a toast that auto-dismisses is not
            // readable enough to settle it.
            await vscode.window.showInformationMessage('Demo Builder build', {
                modal: true,
                detail,
            });
        }),
    );
}
