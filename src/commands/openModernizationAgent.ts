import * as vscode from 'vscode';
import { BaseCommand } from '@/core/base';
import { openUrl } from '@/core/utils/browserUtils';

/** Web console URL for the AEM Experience Modernization Agent. */
const MOD_AGENT_URL = 'https://aemcoder.adobe.io';

/**
 * OpenModernizationAgentCommand — palette entry point for the AEM Experience
 * Modernization Agent web console (`aemcoder.adobe.io`).
 *
 * The Mod Agent itself is a hosted Adobe service that scrapes a reference URL
 * and generates EDS blocks in the browser. Demo Builder's role here is purely
 * navigational: launch the console with a tip about the current project's
 * GitHub repo, so the user knows which repo to connect inside the Mod Agent
 * UI. The actual scrape, design-token extraction, and block generation all
 * happen on Adobe's side.
 *
 * Used by the `scrape-reference-site` skill as the entry to Workflow A.
 *
 * Access gating happens on Adobe's side — if the user lacks provisioning,
 * `aemcoder.adobe.io` shows its own access-denied page. The skill explains the
 * request-access flow (Slack `#aem-agent-experience-modernization-users` for
 * Adobe employees, account manager for partners).
 */
export class OpenModernizationAgentCommand extends BaseCommand {
    public async execute(): Promise<void> {
        const project = await this.stateManager.getCurrentProject();
        this.logger.info(
            `[Open Mod Agent] launching ${MOD_AGENT_URL}` +
            (project ? ` (project=${project.name})` : ''),
        );

        try {
            await openUrl(MOD_AGENT_URL);

            const tip = project
                ? `Modernization Agent opened. Connect the GitHub repo for "${project.name}" if you haven't already.`
                : 'Modernization Agent opened.';
            this.showStatusMessage(`$(globe) ${tip}`);
        } catch (error) {
            this.logger.error(
                `[Open Mod Agent] failed: ${error instanceof Error ? error.message : String(error)}`,
            );
            await vscode.window.showErrorMessage(
                `Failed to open Modernization Agent: ${error instanceof Error ? error.message : 'Unknown error'}`,
            );
        }
    }
}
