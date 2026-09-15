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
import { BaseCommand } from '@/core/base/baseCommand';
import { openUrl } from '@/core/utils/browserUtils';
import { maskEmail } from '@/core/utils/maskEmail';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { getDaLiveAuthService } from '@/features/eds/handlers/edsHelpers';
import { waitForConfigAccess } from '@/features/eds/services/configService/configAccessRecovery';
import type {
    ConfigSiteRef,
    ConfigWriteAccess,
} from '@/features/eds/services/configService/configServiceAccess';
import {
    addSiteAdmin,
    listSiteAccess,
    looksLikeEmail,
    removeSiteAdmin,
    type SiteAccessListing,
    type SiteAccessMutation,
} from '@/features/eds/services/configService/siteAccessManagerHeadless';
import { createDaLiveServiceTokenProvider } from '@/features/eds/services/daLive/daLiveContentOperations';
import { GITHUB_APP_INSTALL_URL } from '@/features/eds/services/github/githubAppService';
import type { Project } from '@/types/base';
import { getEdsRepoParts } from '@/types/typeGuards';

/** The button that opens the AEM Code Sync app on GitHub. */
const OPEN_CODE_SYNC_APP = 'Open Code Sync App';

/** The button that opens AEM's User Admin tool, and where it goes. */
const OPEN_USER_ADMIN = 'Open AEM User Admin';
const AEM_USER_ADMIN_URL = 'https://tools.aem.live/tools/user-admin/index.html';

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
     * Explain a refusal AND offer what is left to a user who holds no role —
     * rather than showing an inert menu.
     *
     * Named admins come first: one of them adding you is the route that is known
     * to work. The Code Sync app on GitHub is the other, and it is deliberately
     * paired with a poll. The AEM setup page can only grant a role when the Code
     * Sync bot opens it with a one-time key during a GitHub App install; whether
     * saving an EXISTING installation's repository access does that is unverified.
     * So the command waits for the config read to flip 403 → 200 and says "still
     * refused" when it does not, naming who can still help.
     *
     * This command used to open `tools.aem.live/bot/setup` with the site in the
     * query string. Without the key that page cannot read the config or add a
     * user, so it never granted anything (reproduced 2026-09-14, kmanns/wire).
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
        if (listing.identityMismatch) {
            await this.reportIdentityMismatch(project, listing, admins);
            return;
        }
        if (admins.length > 0) {
            // A named admin is the route known to work, so it is the only one
            // offered. The GitHub button here opened a page with no instructions
            // beside it and then polled for two minutes.
            await vscode.window.showWarningMessage(
                `You hold no admin role on ${listing.site}. Ask one of these org admins to ` +
                    `add you: ${admins.join(', ')}.`,
                'Close',
            );
            return;
        }

        const site = siteRef(project);
        const choice = await vscode.window.showWarningMessage(
            `You hold no admin role on ${listing.site}, and nobody who can grant it is visible. ` +
                `On GitHub, configure the AEM Code Sync app and save its access to ${site.repo}. ` +
                'If GitHub then opens AEM\'s setup page, add your Adobe email under "Site users".',
            OPEN_CODE_SYNC_APP,
            'Close',
        );
        if (choice !== OPEN_CODE_SYNC_APP) return;

        await openUrl(GITHUB_APP_INSTALL_URL);
        await this.pollForAccess(
            site,
            'Still refused. If GitHub did not open AEM\'s setup page, that route is closed for ' +
                'this site. The role belongs to the GitHub user who installed AEM Code Sync ' +
                'for it: ask them to add you, or ask Adobe to.',
        );
    }

    /**
     * The refusal has a known cause: Code Sync gave the role to the GitHub
     * account's primary email, and Demo Builder signs in to Adobe as another one
     * (2026-09-15, kmanns). The explanation names both, so the user knows which
     * account to sign in to AEM's User Admin tool with. Readable org admins are
     * still named, and then they are the only route offered.
     */
    private async reportIdentityMismatch(
        project: Project,
        listing: SiteAccessListing,
        admins: string[],
    ): Promise<void> {
        const mismatch = listing.identityMismatch;
        if (!mismatch) return;
        const intro = `You hold no admin role on ${listing.site}. ${mismatch.explanation}`;
        if (admins.length > 0) {
            await vscode.window.showWarningMessage(
                `${intro} An org admin can also add you: ${admins.join(', ')}.`,
                'Close',
            );
            return;
        }
        const choice = await vscode.window.showWarningMessage(intro, OPEN_USER_ADMIN, 'Close');
        if (choice !== OPEN_USER_ADMIN) return;

        await openUrl(AEM_USER_ADMIN_URL);
        await this.pollForAccess(
            siteRef(project),
            `Still refused. Once ${mismatch.adobeEmail} is added as an admin in AEM's User Admin ` +
                'tool, run Manage Site Access again.',
        );
    }

    /** Wait for the grant to land, reporting the truth either way. */
    private async pollForAccess(site: ConfigSiteRef, stillRefused: string): Promise<void> {
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
                    site,
                    this.logger,
                    (attempt, total) =>
                        progress.report({ message: `Checking access (${attempt}/${total})` }),
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
        await this.showWarning(stillRefused);
    }

    /** Current admins as rows, plus the add action. */
    private buildItems(listing: SiteAccessListing): AccessAction[] {
        const items: AccessAction[] = [
            { label: '$(add) Add a configuration admin', action: 'add' },
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

/** The owner/repo the Configuration Service keys this project's site by. */
function siteRef(project: Project): ConfigSiteRef {
    // Guarded: an unguarded split once built a request for `org=undefined`.
    const { owner = '', repo = '' } = getEdsRepoParts(project) ?? {};
    return { owner, repo };
}
