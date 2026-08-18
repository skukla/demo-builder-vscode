/**
 * Data Installer settings handlers.
 *
 * Deliberately NOT part of `dataInstallerHandlers`. That map is the READ surface
 * the MCP descriptors mirror, and a completeness test asserts the tools cover it
 * exactly — adding a VS Code UI action there would either advertise a
 * window-opening command to agents or force that test to carry an exclusion list.
 *
 * @module features/data-installer/handlers/settingsHandlers
 */

import * as vscode from 'vscode';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';

/**
 * Open VS Code settings filtered to the Data Installer section.
 *
 * `demoBuilder.dataInstaller.apiBaseUrl` ships with no default on purpose — this
 * repository is public and a bundled endpoint would reach every user — so a fresh
 * install has the feature switched on and pointed nowhere. Every surface that
 * refuses for that reason offers this, because naming a setting the user then has
 * to hunt for is only half an answer.
 *
 * @param context - Handler context, for logging a failure to open the pane
 * @returns Success, or the reason the settings pane would not open
 */
export async function handleOpenDataInstallerSettings(
    context: HandlerContext,
): Promise<HandlerResponse> {
    try {
        await vscode.commands.executeCommand(
            'workbench.action.openSettings',
            'demoBuilder.dataInstaller',
        );
        return { success: true };
    } catch (error) {
        context.logger.error(
            '[Data Installer] Could not open the settings pane',
            error instanceof Error ? error : undefined,
        );
        return { success: false, error: 'Could not open settings.' };
    }
}
