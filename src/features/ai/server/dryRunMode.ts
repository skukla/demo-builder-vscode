/**
 * Evaluation Mode's dry run — the toggle, and the fact that it is ON.
 *
 * While this is on, every agent tool that is not read-shaped is stopped before
 * its handler and answers with what it WOULD have done. That is what makes it
 * safe to measure the path an agent takes through the extension: a battery of
 * prompts can be run against a real project without a single mutation.
 *
 * TWO surfaces, and the second is not decoration. A mode you cannot see is a
 * trap: the user would ask for a deploy, be told "done" by an agent reading the
 * synthetic result, and believe it. So while the mode is on it is pinned to the
 * status bar in the warning colour, and clicking it turns it off.
 *
 * The gate itself lives in `inExtensionMcpServer.ts` and takes this as an
 * injected `() => boolean`, so that module stays vscode-free. Same seam, and
 * same live-read discipline, as `createAgentConsentGate`: the setting is read
 * fresh on every call, so toggling takes effect on the next tool call rather
 * than the next window reload.
 *
 * @module features/ai/server/dryRunMode
 */

import * as vscode from 'vscode';
import type { Logger } from '@/types/logger';

/** The setting, without its `demoBuilder.` prefix (how `getConfiguration` wants it). */
export const DRY_RUN_SETTING = 'ai.dryRun';

/** Fully-qualified key, for `onDidChangeConfiguration` and for prose. */
export const DRY_RUN_SETTING_KEY = `demoBuilder.${DRY_RUN_SETTING}`;

/**
 * The toggle command id.
 *
 * The literal is repeated ONCE below in `registerCommand`, deliberately:
 * `manifest-mirrors.test.ts` proves every command declared in `package.json` is
 * actually registered, and it can only see a literal there. A command declared
 * and not registered is an error the user meets in the palette. The pair is
 * pinned by `agentDryRun.test.ts`.
 */
export const TOGGLE_DRY_RUN_COMMAND = 'demoBuilder.toggleAgentDryRun';

/**
 * Is the dry run on right now?
 *
 * Read live, never cached — see the module note.
 *
 * @returns true while agent writes should be blocked
 */
export function isDryRunEnabled(): boolean {
    return vscode.workspace.getConfiguration('demoBuilder').get<boolean>(DRY_RUN_SETTING, false);
}

/**
 * Pin the mode to the status bar while it is on, and register the toggle.
 *
 * @param context - extension context (owns the disposables)
 * @param logger - extension logger; every transition is recorded
 * @returns the live reader to inject as `InExtensionMcpServerOptions.dryRun`
 */
export function registerDryRunMode(
    context: vscode.ExtensionContext,
    logger: Logger,
): () => boolean {
    const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    item.text = '$(beaker) Agent dry run';
    item.tooltip =
        'Demo Builder: AI agents can read, but every change is simulated. ' +
        'Click to turn off.';
    // Warning colours, because this changes what the extension DOES. A grey
    // status item reads as information; this has to read as a mode.
    item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    item.command = TOGGLE_DRY_RUN_COMMAND;
    context.subscriptions.push(item);

    const sync = (): void => {
        if (isDryRunEnabled()) {
            item.show();
        } else {
            item.hide();
        }
    };
    sync();

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration(DRY_RUN_SETTING_KEY)) sync();
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('demoBuilder.toggleAgentDryRun', async () => {
            const next = !isDryRunEnabled();
            await vscode.workspace
                .getConfiguration('demoBuilder')
                .update(DRY_RUN_SETTING, next, vscode.ConfigurationTarget.Global);
            logger.info(`[MCP] agent dry run ${next ? 'ON' : 'OFF'}`);
            vscode.window.showInformationMessage(
                next
                    ? 'Agent dry run is ON. AI agents can read your projects, but every ' +
                          'change is simulated until you turn this off.'
                    : 'Agent dry run is OFF. AI agents can change your projects again.',
            );
        }),
    );

    return isDryRunEnabled;
}
