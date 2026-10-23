/**
 * `Demo Builder: Storefront Report` (EDS-13f decision 7).
 *
 * Opens the current project's dashboard with the storefront report's window showing
 * (EDS-64): what needs the SC's attention first, then where the storefront comes from.
 * The report used to open as a markdown document followed by two modals, an offer of
 * Demo Builder's fixes and a template merge; reading it now changes nothing.
 *
 * The window and its data live with the dashboard (`StorefrontReportModal`,
 * `storefrontReportHandlers.ts`); this command only opens it.
 *
 * @module commands/storefrontReport
 */

import * as vscode from 'vscode';
import { BaseCommand } from '@/core/base/baseCommand';

export class StorefrontReportCommand extends BaseCommand {
    public async execute(): Promise<void> {
        const project = await this.stateManager.getCurrentProject();
        if (!project) {
            await this.showWarning('No project loaded.');
            return;
        }
        await vscode.commands.executeCommand('demoBuilder.showProjectDashboard', { showStorefrontReport: true });
    }
}
