/**
 * Check for Updates (PL-80).
 *
 * Run by the SC, it opens the projects list with the Updates modal, which checks every
 * project and the extension, lists what is waiting and applies what stays ticked
 * (`features/updates/handlers/updatesModalHandlers`).
 *
 * Run in the background (the sidebar opening, then every four hours), it checks the same
 * things quietly and, when something is waiting, says how many in one notification whose
 * Review opens the modal. It never opens anything by itself. Until PL-80 a background
 * check opened VS Code's picker on its own, and a second updater (`utils/autoUpdater.ts`,
 * removed) showed its own "Update Now" every four hours.
 *
 * @module features/updates/commands/checkUpdates
 */

import * as vscode from 'vscode';
import { BaseCommand } from '@/core/base/baseCommand';
import { ExecutionLock } from '@/core/utils/executionLock';
import { createHeadlessHandlerContext } from '@/features/ai/server/headlessHandlerContext';
import { integrationUpdateProbe } from '@/features/dashboard/handlers/integrationUpdateHandlers';
import { findAllUpdates } from '@/features/updates/services/allUpdates';
import { shouldOfferGraduation } from '@/features/updates/services/releaseTrack';
import { UpdateManager } from '@/features/updates/services/updateManager';

const REVIEW = 'Review';

export class CheckUpdatesCommand extends BaseCommand {
    /** One background check at a time. */
    private static lock = new ExecutionLock('CheckUpdates');

    /**
     * @param options - `background` for the quiet check that only notifies
     */
    async execute(options: { background?: boolean } = {}): Promise<void> {
        if (options.background) {
            await this.checkInBackground();
            return;
        }
        await this.maybeOfferGraduation();
        await vscode.commands.executeCommand('demoBuilder.showProjectsList', { showUpdates: true });
    }

    private async checkInBackground(): Promise<void> {
        if (CheckUpdatesCommand.lock.isLocked()) {
            this.logger.debug('[Updates] Already in progress');
            return;
        }
        await CheckUpdatesCommand.lock.run(async () => {
            const handlerCtx = createHeadlessHandlerContext(this.context, this.stateManager, this.logger);
            const found = await findAllUpdates(handlerCtx, integrationUpdateProbe(handlerCtx));
            await this.maybeOfferGraduation();
            if (found.count === 0) {
                this.logger.debug('[Updates] Background check: nothing waiting');
                return;
            }
            const noun = found.count === 1 ? 'update' : 'updates';
            const choice = await vscode.window.showInformationMessage(
                `${found.count} Demo Builder ${noun} available.`,
                REVIEW,
            );
            if (choice === REVIEW) {
                await vscode.commands.executeCommand('demoBuilder.showProjectsList', { showUpdates: true });
            }
        });
    }

    // -----------------------------------------------------------------------
    // Early-access graduation off-ramp
    // -----------------------------------------------------------------------

    /**
     * When the user is on the early-access channel and running an -alpha.* build
     * that a final release has superseded, prompt them to switch back to a
     * non-preview channel. Prompt-only: the channel is changed only on an
     * explicit choice.
     */
    private async maybeOfferGraduation(): Promise<void> {
        // Best-effort nicety: never let the off-ramp abort the core update flow.
        try {
            const channel = vscode.workspace.getConfiguration('demoBuilder')
                .get<string>('updateChannel', 'stable');
            if (channel !== 'early-access') {
                return;
            }

            const installedVersion: string = this.context.extension.packageJSON.version;
            const updateManager = new UpdateManager(this.context, this.logger);
            const latestFinal = await updateManager.getLatestFinalVersion();
            if (!shouldOfferGraduation(installedVersion, latestFinal)) {
                return;
            }

            const choice = await vscode.window.showInformationMessage(
                `A final release (v${latestFinal}) now supersedes your preview build (v${installedVersion}). `
                + 'Switch off the early-access channel to keep receiving updates?',
                'Switch to Beta',
                'Switch to Stable',
                'Stay',
            );

            if (choice === 'Switch to Beta') {
                await this.setChannel('beta');
            } else if (choice === 'Switch to Stable') {
                await this.setChannel('stable');
            }
        } catch (error) {
            this.logger.debug(`[Updates] Graduation off-ramp skipped: ${(error as Error).message}`);
        }
    }

    private async setChannel(channel: 'stable' | 'beta'): Promise<void> {
        await vscode.workspace.getConfiguration('demoBuilder')
            .update('updateChannel', channel, vscode.ConfigurationTarget.Global);
        this.logger.info(`[Updates] Update channel switched to ${channel} (graduation off-ramp)`);
    }
}
