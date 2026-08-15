/**
 * ManageSiteAccessCommand
 *
 * Who can administer this project's storefront configuration — view, add, and
 * remove, from a QuickPick.
 *
 * Exists because the Configuration Service admin role had no in-app surface at
 * all: it was minted invisibly by the AEM Code Sync install, and when it was
 * missing the only remedy anyone could offer was prose. A teammate who already
 * holds the role can now fix a colleague in about ten seconds
 * (2026-08-13, leah-b2b-demo).
 *
 * The command owns UX only. Reading, mutating, and — critically — VERIFYING each
 * change by re-reading live in `siteAccessManagerHeadless`, so an MCP tool can
 * offer the same capability without a webview (mirrors `refreshBlockLibrary`).
 *
 * Two deliberate refusals surface here rather than being papered over:
 * - if this identity cannot manage access, the add/remove actions are NOT shown;
 *   offering a button guaranteed to 403 is worse than saying why.
 * - a change that does not verify on re-read is reported as unverified, never as
 *   success.
 *
 * Runs in the extension host (vscode-coupled), NOT the MCP server.
 */

import * as vscode from 'vscode';
import { BaseCommand } from '@/core/base';
import { openUrl } from '@/core/utils/browserUtils';
import { maskEmail } from '@/core/utils/maskEmail';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { getDaLiveAuthService } from '@/features/eds/handlers/edsHelpers';
import { waitForConfigAccess } from '@/features/eds/services/configAccessRecovery';
import {
    buildCodeSyncSetupUrl,
    type CodeSyncSetupParams,
    type ConfigWriteAccess,
} from '@/features/eds/services/configServiceAccess';
import { buildContentSourceUrl } from '@/features/eds/services/configurationService';
import { createDaLiveServiceTokenProvider } from '@/features/eds/services/daLiveContentOperations';
import {
    addSiteAdmin,
    listSiteAccess,
    looksLikeEmail,
    removeSiteAdmin,
    type SiteAccessListing,
    type SiteAccessMutation,
} from '@/features/eds/services/siteAccessManagerHeadless';
import type { Project } from '@/types/base';
import { getEdsDaLiveTarget, getEdsRepoParts } from '@/types/typeGuards';

/** QuickPick rows carry their action so the handler does not re-parse labels. */
interface AccessAction extends vscode.QuickPickItem {
    action: 'add' | 'remove' | 'noop';
    email?: string;
}

export class ManageSiteAccessCommand extends BaseCommand {
    public async execute(): Promise<void> {
        const project = await this.stateManager.getCurrentProject();
        if (!project) {
            await this.showWarning('No project loaded.');
            return;
        }

        let listing: SiteAccessListing | undefined;
        await this.withProgress('Reading site access', async () => {
            listing = await listSiteAccess(project, this.context, this.logger);
        });
        if (!listing) return;

        if (listing.status === 'no_site') {
            await this.showWarning(
                'This project has no Edge Delivery storefront, so it has no site configuration to manage.',
            );
            return;
        }

        if (!listing.canManage) {
            await this.reportCannotManage(project, listing);
            return;
        }

        const choice = await vscode.window.showQuickPick(this.buildItems(listing), {
            title: `Site access — ${listing.site}`,
            placeHolder: 'Add or remove a configuration admin',
        });
        if (!choice || choice.action === 'noop') return;

        if (choice.action === 'add') {
            await this.handleAdd(project);
            return;
        }
        if (choice.email) await this.handleRemove(project, choice.email);
    }

    /**
     * Explain a refusal AND offer the one recovery available to a user who holds
     * no role — rather than showing an inert menu.
     *
     * The recovery is the AEM Code Sync setup flow, which writes with the bot's
     * authority instead of the user's. It is deliberately paired with a poll:
     * whether that flow re-mints a role for an org that already exists is
     * unverified, and cannot be tested from an account that already holds one.
     * So the command waits for the config read to actually flip 403 → 200 and
     * says "still refused" when it does not, rather than declaring success and
     * handing back a storefront that still cannot serve a product page.
     *
     * Note this is NOT the wizard's Code Sync step. That one proves the GitHub
     * App is installed — a different fact, and one that can be true while this
     * is false (2026-08-13, leah-b2b-demo).
     */
    private async reportCannotManage(project: Project, listing: SiteAccessListing): Promise<void> {
        if (listing.status === 'no_credential') {
            // Distinct from a refusal, and the user can fix it themselves —
            // the same branch `reportMutation` already had. Without it, "not
            // signed in" rendered as "check the Debug Logs".
            await this.showWarning(
                'No DA.live credential is stored. Sign in to DA.live, then try again.',
            );
            return;
        }
        if (listing.status !== 'not_authorized') {
            await this.showWarning(
                `Could not read the site configuration for ${listing.site}. Check the Debug Logs for the response.`,
            );
            return;
        }

        const admins = listing.orgAdmins ?? [];
        const detail =
            admins.length > 0
                ? `These org admins can grant it: ${admins.join(', ')}.`
                : 'No org admin is visible to ask, so the AEM setup flow is the way in.';

        const choice = await vscode.window.showWarningMessage(
            `You hold no admin role on ${listing.site}. ${detail}`,
            'Open AEM setup',
            'Close',
        );
        if (choice !== 'Open AEM setup') return;

        // Built directly rather than re-probing: `listSiteAccess`
        // already established the refusal, so re-probing would only add a round
        // trip AND a failure mode — a transport blip made that probe return
        // `indeterminate`, which reported "could not build the setup link" for a
        // link that is a pure string build and cannot fail.
        await openUrl(buildCodeSyncSetupUrl(await this.buildSetupParams(project)));
        await this.pollForAccess(project);
    }

    /** Wait for the grant to land, reporting the truth either way. */
    private async pollForAccess(project: Project): Promise<void> {
        const params = await this.buildSetupParams(project);

        // RETURNED, not assigned into an outer `let`: control-flow analysis
        // cannot see a closure assignment, so an outer variable stays narrowed to
        // its initialiser and the comparison below reads as unreachable.
        // `withProgress` is `cancellable: false` and passes its task's value
        // straight through, so relying on the return is safe here.
        const outcome: ConfigWriteAccess = await this.withProgress(
            'Waiting for site access',
            (progress) =>
                waitForConfigAccess(
                    createDaLiveServiceTokenProvider(getDaLiveAuthService(this.context)),
                    { owner: params.owner, repo: params.repo },
                    this.logger,
                    (attempt, total) =>
                        progress.report({ message: `Checking access (${attempt}/${total})…` }),
                ),
        );

        if (outcome === 'granted') {
            // Offer the repair rather than describing it. This used to read
            // "re-run Manage Site Access, then Republish the storefront" — and
            // Republish provably cannot re-register the site config
            // (`registerConfigurationService` has one caller, the setup
            // pipeline), so following that instruction changed nothing.
            const choice = await vscode.window.showInformationMessage(
                'Access confirmed. The site configuration still needs the write that was ' +
                    'refused — repair it now?',
                'Repair Site Configuration',
                'Later',
            );
            if (choice === 'Repair Site Configuration') {
                await vscode.commands.executeCommand('demoBuilder.repairSiteConfiguration');
            }
            return;
        }
        await this.showWarning(
            'Still refused after the setup flow. Adding your email under "Site users" in that ' +
                'page is what grants the role — if you completed it and this persists, an ' +
                'existing admin has to grant it instead.',
        );
    }

    /** The four values the Code Sync setup flow reads from its query string. */
    private async buildSetupParams(project: Project): Promise<CodeSyncSetupParams> {
        // Guarded: an unguarded split built a setup URL with `org=undefined`.
        const { owner = '', repo = '' } = getEdsRepoParts(project) ?? {};
        const daLive = getEdsDaLiveTarget(project);
        return {
            owner,
            repo,
            contentSourceUrl: buildContentSourceUrl(daLive?.org ?? owner, daLive?.site ?? repo),
            userEmail: (await getDaLiveAuthService(this.context).getUserEmail()) ?? undefined,
        };
    }

    /** Current admins as rows, plus the add action. */
    private buildItems(listing: SiteAccessListing): AccessAction[] {
        const items: AccessAction[] = [
            { label: '$(add) Add a configuration admin…', action: 'add' },
        ];

        const siteAdmins = listing.siteAdmins ?? [];
        for (const email of siteAdmins) {
            items.push({
                label: `$(trash) Remove ${email}`,
                description: 'site admin',
                action: 'remove',
                email,
            });
        }

        // Org admins are shown but NOT removable here: they hold the role on
        // every site in the org, so removing one from this list would not revoke
        // anything and the row would lie about what it does.
        for (const email of listing.orgAdmins ?? []) {
            if (siteAdmins.some((entry) => entry.toLowerCase() === email.toLowerCase())) continue;
            items.push({
                label: email,
                description: 'org admin (applies to every site — not removable here)',
                action: 'noop',
            });
        }

        return items;
    }

    private async handleAdd(project: Project): Promise<void> {
        const email = await vscode.window.showInputBox({
            title: 'Add a configuration admin',
            prompt: 'Adobe account email to grant the admin role',
            placeHolder: 'name@adobe.com',
            validateInput: (value) =>
                looksLikeEmail(value) ? undefined : 'Enter a valid email address',
        });
        if (!email) return;

        let result: SiteAccessMutation | undefined;
        await this.withProgress(`Granting access to ${email}`, async () => {
            result = await addSiteAdmin(project, email, this.context, this.logger);
        });
        await this.reportMutation(
            result,
            `${email} can now administer this site.`,
            `${maskEmail(email)} can now administer this site.`,
        );
    }

    private async handleRemove(project: Project, email: string): Promise<void> {
        const confirmed = await vscode.window.showWarningMessage(
            `Remove ${email} as a configuration admin?`,
            { modal: true },
            'Remove',
        );
        if (confirmed !== 'Remove') return;

        let result: SiteAccessMutation | undefined;
        await this.withProgress(`Removing ${email}`, async () => {
            result = await removeSiteAdmin(project, email, this.context, this.logger);
        });
        await this.reportMutation(
            result,
            `${email} is no longer a configuration admin.`,
            `${maskEmail(email)} is no longer a configuration admin.`,
        );
    }

    /**
     * Report a mutation, keeping "the call succeeded" and "the change landed"
     * separate — the distinction this whole feature was built around.
     */
    private async reportMutation(
        result: SiteAccessMutation | undefined,
        successMessage: string,
        /**
         * The same sentence with the address masked. `showSuccessMessage` logs at
         * `info`, which IS buffered for the debug export users paste into tickets
         * — so the unmasked form must never reach it. Full address stays in the
         * transient notification, per the masking rule this feature follows.
         */
        loggableMessage: string,
    ): Promise<void> {
        if (!result) return;

        if (result.status === 'no_credential') {
            // Distinct from a refusal: this one the user CAN fix, by signing in.
            await this.showWarning(
                'No DA.live credential is stored. Sign in to DA.live, then try again.',
            );
            return;
        }
        if (result.status === 'not_authorized') {
            await this.showWarning(
                'The Configuration Service refused the change — you hold no admin role on this site.',
            );
            return;
        }
        if (result.status === 'invalid') {
            await this.showWarning(result.error ?? 'That change is not allowed.');
            return;
        }
        if (result.status !== 'ok') {
            await this.showError(
                `The change did not go through: ${result.error ?? 'unknown error'}`,
            );
            return;
        }
        if (!result.verified) {
            await this.showWarning(
                'The service accepted the change but it did not show up when re-read. ' +
                    'Wait a moment and re-open this list before relying on it.',
            );
            return;
        }
        // Masked to the log, full to the user. `showSuccessMessage` logs at
        // `info`, which is buffered for the debug export.
        this.logger.info(loggableMessage);
        await this.showProgressNotification(successMessage, TIMEOUTS.UI.NOTIFICATION);
        // The status bar is transient and never logged, so it keeps the full
        // address. Replacing `showSuccessMessage` to mask the log dropped this.
        vscode.window.setStatusBarMessage(`✅ ${successMessage}`, TIMEOUTS.STATUS_BAR_SUCCESS);
    }
}
