/**
 * Replace one webview surface with another, in the same place.
 *
 * Disposes the named panel (if open) inside a webview transition, so its disposal
 * callback does not open another surface (the wizard's would open the projects
 * list), then runs the command that opens the target. Moved here from the
 * dashboard's navigation handlers when Edit's link to Configure needed the same
 * swap (owner, 2026-10-17).
 *
 * @module core/base/swapWebviewSurface
 */

import * as vscode from 'vscode';
import { BaseWebviewCommand } from './baseWebviewCommand';

/**
 * @param panelId - the webview id of the panel to close
 * @param commandIds - the commands that open the replacement, in order: the last
 *        one ends up in front (Edit opens the dashboard, then Configure on top)
 */
export async function swapWebviewSurface(panelId: string, ...commandIds: string[]): Promise<void> {
    await BaseWebviewCommand.startWebviewTransition();
    try {
        const panel = BaseWebviewCommand.getActivePanel(panelId);
        if (panel) {
            try {
                panel.dispose();
            } catch {
                // Panel may already be disposed - this is OK
            }
        }
        for (const commandId of commandIds) {
            await vscode.commands.executeCommand(commandId);
        }
    } finally {
        BaseWebviewCommand.endWebviewTransition();
    }
}
