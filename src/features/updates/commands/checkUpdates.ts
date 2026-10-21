/**
 * Check for Updates (PL-80).
 *
 * Run by the SC, it checks the extension and every project in a "Checking for updates"
 * notification. Nothing waiting says so ("Demo Builder is up to date"); anything waiting
 * opens the projects list with the Updates modal on what this check found, and the modal
 * applies what stays ticked (`features/updates/handlers/updatesModalHandlers`).
 *
 * Run in the background (the sidebar opening, then every four hours), it checks the same
 * things quietly and, when something is waiting, says how many in one notification whose
 * Review opens the modal. It never opens anything by itself.
 *
 * One check runs at a time. An SC who asks while the background check is running joins
 * it: the notification shows at once, the modal opens on that check, and the background
 * run stays quiet. Until 2026-10-21 the SC's request was dropped instead, so the click did
 * nothing and the background popup arrived seconds later.
 *
 * Until PL-80 the notification led to VS Code's picker, a background check opened that
 * picker on its own, and a second updater (`utils/autoUpdater.ts`, removed) showed its own
 * "Update Now" every four hours. The modal replaces only the picker: the notification is
 * still the check (owner, 2026-10-20).
 *
 * @module features/updates/commands/checkUpdates
 */

import * as vscode from 'vscode';
import { BaseCommand } from '@/core/base/baseCommand';
import { withProgressRegister } from '@/core/vscode/progressRegister';
import { createHeadlessHandlerContext } from '@/features/ai/server/headlessHandlerContext';
import { integrationUpdateProbe } from '@/features/dashboard/handlers/integrationUpdateHandlers';
import { presentUpdates } from '@/features/updates/handlers/updatesModalHandlers';
import { findAllUpdates, type FoundUpdates } from '@/features/updates/services/allUpdates';
import { shouldOfferGraduation } from '@/features/updates/services/releaseTrack';
import { UpdateManager } from '@/features/updates/services/updateManager';

const REVIEW = 'Review';

export class CheckUpdatesCommand extends BaseCommand {
    /** The check in flight. A second request joins it rather than starting another. */
    private static running?: Promise<FoundUpdates>;
    /** Whether the SC is waiting on the check in flight. The background run then stays quiet. */
    private static scWaiting = false;

    /**
     * @param options - `background` for the quiet check that only notifies
     */
    async execute(options: { background?: boolean } = {}): Promise<void> {
        if (options.background) {
            if (CheckUpdatesCommand.running) {
                this.logger.debug('[Updates] Already in progress');
                return;
            }
            await this.checkInBackground();
            return;
        }
        if (CheckUpdatesCommand.scWaiting) {
            this.logger.debug('[Updates] Already showing a check');
            return;
        }
        CheckUpdatesCommand.scWaiting = true;
        try {
            await this.checkInNotification();
        } finally {
            CheckUpdatesCommand.scWaiting = false;
        }
    }

    /** The SC's check: told in a notification, then the modal or "up to date". */
    private async checkInNotification(): Promise<void> {
        try {
            const found = await withProgressRegister({ title: 'Checking for updates' }, () => this.check());
            await this.maybeOfferGraduation();
            if (found.count === 0) {
                const version: string = this.context.extension.packageJSON.version;
                await this.showSuccessMessage(`Demo Builder is up to date (v${version})`);
                return;
            }
            await this.openModal(found);
        } catch (error) {
            await this.showError('Failed to check for updates', error as Error);
        }
    }

    /** The startup and four-hourly check: quiet, and a notification only when something waits. */
    private async checkInBackground(): Promise<void> {
        const found = await this.check();
        // The SC asked while this ran and is shown this same check.
        if (CheckUpdatesCommand.scWaiting) return;
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
        if (choice === REVIEW) await this.openModal(found);
    }

    /** The check in flight, or a new one. */
    private check(): Promise<FoundUpdates> {
        CheckUpdatesCommand.running ??= this.findUpdates().finally(() => {
            CheckUpdatesCommand.running = undefined;
        });
        return CheckUpdatesCommand.running;
    }

    private findUpdates(): Promise<FoundUpdates> {
        const handlerCtx = createHeadlessHandlerContext(this.context, this.stateManager, this.logger);
        return findAllUpdates(handlerCtx, integrationUpdateProbe(handlerCtx));
    }

    /** Hand the check to the modal and open the projects list on it. */
    private async openModal(found: FoundUpdates): Promise<void> {
        presentUpdates(found);
        await vscode.commands.executeCommand('demoBuilder.showProjectsList', { showUpdates: true });
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
