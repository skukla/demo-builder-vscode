/**
 * Say so the moment an SC picks an agent that cannot start.
 *
 * VS Code's Settings editor shows only schema errors — nothing an extension can
 * compute — so this is the nearest thing to an error on the setting: a warning
 * while the SC is still on the Settings page, instead of at their next Chat
 * click. Its one action clears the choice back to the default, Copilot in VS
 * Code, which needs nothing installed (owner, 2026-10-06).
 *
 * @module features/ai/engine/engineChoiceWatch
 */

import * as vscode from 'vscode';
import { resolveActiveEngine } from './activeEngine';
import type { CommandProbe } from './agentCli';

/** The one action on the warning. */
export const USE_COPILOT = 'Use Copilot in VS Code';

/**
 * Watch `demoBuilder.ai.engine` and warn when the new choice's CLI is missing.
 *
 * @param probe - the extension's command executor (`commandExists`)
 * @returns the listener, for the extension's subscriptions
 */
export function watchEngineChoice(probe: CommandProbe): vscode.Disposable {
    return vscode.workspace.onDidChangeConfiguration(async (event) => {
        if (!event.affectsConfiguration('demoBuilder.ai.engine')) return;
        const { descriptor, installed } = await resolveActiveEngine(probe);
        if (installed) return;
        const choice = await vscode.window.showWarningMessage(
            `${descriptor.displayName} (the command-line tool) is not installed, so Chat cannot open it.`,
            USE_COPILOT,
        );
        if (choice === USE_COPILOT) await clearEngineChoice();
    });
}

/**
 * Remove the choice wherever it is set, so the default applies. Clearing only
 * one scope would leave the other's value in force.
 */
async function clearEngineChoice(): Promise<void> {
    const config = vscode.workspace.getConfiguration('demoBuilder.ai');
    const set = config.inspect('engine');
    if (set?.workspaceValue !== undefined) {
        await config.update('engine', undefined, vscode.ConfigurationTarget.Workspace);
    }
    if (set?.globalValue !== undefined) {
        await config.update('engine', undefined, vscode.ConfigurationTarget.Global);
    }
}
