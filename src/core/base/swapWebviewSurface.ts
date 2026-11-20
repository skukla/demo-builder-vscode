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

/** A command that opens a surface: its id, or its id with the arguments it is run with. */
export type SurfaceCommand = string | { id: string; args: unknown[] };

/**
 * @param panelId - the webview id of the panel to close
 * @param commands - the commands that open the replacement, in order: the last
 *        one ends up in front (Edit opens the dashboard, then Configure on top). One
 *        with arguments carries what the surface opens on (Finish Setup's guide, PL-101)
 */
export async function swapWebviewSurface(panelId: string, ...commands: SurfaceCommand[]): Promise<void> {
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
        for (const command of commands) {
            if (typeof command === 'string') await vscode.commands.executeCommand(command);
            else await vscode.commands.executeCommand(command.id, ...command.args);
        }
    } finally {
        BaseWebviewCommand.endWebviewTransition();
    }
}
