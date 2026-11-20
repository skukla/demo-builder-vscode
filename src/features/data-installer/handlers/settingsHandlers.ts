/**
 * The open-a-setting handler behind every datapack failure that names a setting.
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

/** A Demo Builder setting id, the only thing this opens Settings at. */
const SETTING_ID = /^demoBuilder(\.[A-Za-z][A-Za-z0-9]*)+$/;

/**
 * Open VS Code Settings at the setting a failure named (owner rule, release test 1.4,
 * 2026-11-16: a message that sends the SC to a setting gives a button that opens it).
 *
 * `demoBuilder.dataInstaller.apiBaseUrl` ships with no default on purpose — this
 * repository is public and a bundled endpoint would reach every user — so a fresh
 * install meets these refusals first, and naming a setting the SC then has to hunt
 * for is only half an answer.
 *
 * @param context - Handler context, for logging a failure to open the pane
 * @param payload - `setting`: the id to open, a `demoBuilder.` key
 * @returns Success, or the reason the settings pane would not open
 */
export async function handleOpenSetting(
    context: HandlerContext,
    payload?: { setting?: unknown },
): Promise<HandlerResponse> {
    const setting = payload?.setting;
    if (typeof setting !== 'string' || !SETTING_ID.test(setting)) {
        return { success: false, error: 'Name a Demo Builder setting to open.' };
    }
    try {
        await vscode.commands.executeCommand('workbench.action.openSettings', setting);
        return { success: true };
    } catch (error) {
        context.logger.error(
            '[Data Installer] Could not open the settings pane',
            error instanceof Error ? error : undefined,
        );
        return { success: false, error: 'Could not open Settings.' };
    }
}
