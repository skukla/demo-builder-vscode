/**
 * `Demo Builder: Repair Site Configuration`.
 *
 * The retry that did not exist. When the Configuration Service refuses the
 * overlay registration, the storefront ships without product detail pages, and
 * until now the only routes back were a full setup run or a destructive reset —
 * `Sync Storefront` never touched the Configuration Service (verified:
 * `registerConfigurationService` had one caller, `storefrontSetupPhase3`). So
 * the natural sequence "get the grant, then finish the job" had no in-app path,
 * and `Manage Site Access` closed by telling people to Republish, which could
 * not have worked.
 *
 * Two steps, in the order that makes the fix visible:
 *
 * 1. re-register the site config ({@link repairSiteConfigForProject}) — the write that failed;
 * 2. republish, the same `republishStorefrontConfig` the Configure command runs
 *    on save, so the change reaches the live storefront instead of sitting in a
 *    config nobody has re-read.
 *
 * Step 2 runs ONLY after step 1 reports `repaired`. Republishing on top of a
 * refused registration would burn a minute of writes and change nothing.
 *
 * @module commands/repairSiteConfiguration
 */

import * as vscode from 'vscode';
import { BaseCommand } from '@/core/base/baseCommand';
import { lostGrantsMessage } from '@/features/eds/services/configService/lostGrantsMessage';
import { repairSiteConfigForProject } from '@/features/eds/services/configService/repairSiteConfigForProject';
import type { RepairSiteConfigResult } from '@/features/eds/services/configService/repairSiteConfigHeadless';
import { republishStorefrontConfig } from '@/features/eds/services/storefront/storefrontRepublishService';
import type { Project } from '@/types/base';

export class RepairSiteConfigurationCommand extends BaseCommand {
    public async execute(): Promise<void> {
        const project = await this.stateManager.getCurrentProject();
        if (!project) {
            await this.showWarning('No project loaded.');
            return;
        }

        const result = await this.runRepair(project);
        if (!result) return;

        // BEFORE the failure branch. A failed repair can still have destroyed the
        // admin list — the restore is attempted even when the re-register fails —
        // and reporting only "refused the write" buried the unrecoverable half.
        if (result.lostGrants?.length) {
            await this.showWarning(
                lostGrantsMessage(result.lostGrants, 'The site configuration was updated'),
            );
        }

        if (result.status !== 'repaired') {
            await this.reportFailure(result);
            return;
        }

        // Say the unverified case out loud rather than folding it into success.
        if (!result.verified) {
            await this.showWarning(
                `Site configuration written for ${result.site}, but the overlay did not read ` +
                    'back. Product pages may still not load — check the Debug Logs.',
            );
        }

        await this.republish(project);
    }

    /**
     * Step 1 — the write that failed, retried.
     *
     * The dependency assembly lives in `repairSiteConfigForProject` so the MCP
     * tool shares it rather than rebuilding it; all this adds is the progress
     * notification, which is the only part an agent must not get.
     */
    private async runRepair(project: Project): Promise<RepairSiteConfigResult | undefined> {
        return vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Repairing site configuration',
                cancellable: false,
            },
            (progress) =>
                repairSiteConfigForProject(
                    project,
                    this.context,
                    this.logger,
                    (p) => this.stateManager.saveProject(p),
                    (message) => progress.report({ message }),
                ),
        );
    }

    /**
     * Step 2 — the same republish the Configure command runs on save.
     *
     * Registration writes a routing rule; without this the live storefront keeps
     * serving what it last published.
     */
    private async republish(project: Project): Promise<void> {
        const result = await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Republishing storefront',
                cancellable: false,
            },
            (progress) =>
                republishStorefrontConfig({
                    persist: (p) => this.stateManager.saveProject(p),
                    project,
                    secrets: this.context.secrets,
                    logger: this.logger,
                    onProgress: (message) => progress.report({ message }),
                }),
        );

        if (result.success) {
            await this.stateManager.saveProject(project);
            await this.showSuccessMessage('Site configuration repaired and storefront republished');
            return;
        }
        await this.showWarning(
            `Site configuration was repaired, but the republish failed: ${result.error}`,
        );
    }

    /**
     * A refusal is not retryable by the person who hit it, so the only useful
     * thing to offer is the route to someone who can grant the role.
     */
    private async reportFailure(result: RepairSiteConfigResult): Promise<void> {
        if (result.status === 'invalid') {
            await this.showWarning(
                'This project has no Edge Delivery storefront, so it has no site configuration to repair.',
            );
            return;
        }

        if (result.status !== 'not_authorized') {
            await this.showWarning(`Could not repair the site configuration: ${result.error}`);
            return;
        }

        const choice = await vscode.window.showWarningMessage(
            `You hold no admin role on ${result.site}, so the site configuration cannot be ` +
                'repaired from here. Someone who holds it must grant you access first.',
            'Manage Site Access',
            'Open AEM setup',
            'Close',
        );
        if (choice === 'Manage Site Access') {
            await vscode.commands.executeCommand('demoBuilder.manageSiteAccess');
            return;
        }
        if (choice === 'Open AEM setup' && result.setupUrl) {
            await vscode.env.openExternal(vscode.Uri.parse(result.setupUrl));
        }
    }
}
