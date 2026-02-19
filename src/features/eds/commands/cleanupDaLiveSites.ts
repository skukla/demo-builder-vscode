/**
 * Command: Manage DA.live Sites
 *
 * Interactive VS Code command to manage DA.live sites with multi-select UI.
 *
 * Features:
 * - Organization selection with input box
 * - Fetches and displays all sites in the org
 * - Multi-select QuickPick with filtering
 * - Batch deletion with permission cleanup
 * - Cross-references Demo Builder projects for repo metadata
 */

import * as vscode from 'vscode';
import { getLogger } from '@/core/logging';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { DaLiveOrgOperations } from '../services/daLiveOrgOperations';
import { DaLiveContentOperations } from '../services/daLiveContentOperations';
import { DaLiveConfigService } from '../services/daLiveConfigService';
import { getLinkedEdsProjects } from '../services/resourceCleanupHelpers';

interface SiteQuickPickItem extends vscode.QuickPickItem {
    siteName: string;
    lastModified?: number;
    isLinked?: boolean; // Whether site is linked to a Demo Builder project
}

export async function cleanupDaLiveSitesCommand(): Promise<void> {
    const logger = getLogger();

    try {
        // Step 1: Prompt for org name (pre-filled from settings if configured)
        const defaultOrg = vscode.workspace.getConfiguration('demoBuilder').get<string>('daLive.defaultOrg', '');

        const orgName = await vscode.window.showInputBox({
            prompt: 'Enter DA.live organization name',
            placeHolder: 'e.g., skukla',
            value: defaultOrg,
            validateInput: (value) => {
                if (!value?.trim()) {
                    return 'Organization name is required';
                }
                return null;
            },
        });

        if (!orgName) {
            return; // User cancelled
        }

        // Step 2: Check authentication and fetch sites from org
        const authService = ServiceLocator.getAuthenticationService();
        const tokenManager = authService.getTokenManager();

        // Check token status
        const tokenInspection = await tokenManager.inspectToken();
        logger.debug(`[DA.live Manage] Token valid: ${tokenInspection.valid}, Expires in: ${tokenInspection.expiresIn} minutes`);

        if (!tokenInspection.valid) {
            vscode.window.showErrorMessage(
                'Not authenticated with Adobe. Please authenticate first.',
            );
            return;
        }

        const tokenProvider = {
            getAccessToken: async () => {
                const token = await tokenManager.getAccessToken();
                return token ?? null;
            },
        };

        const daLiveOps = new DaLiveOrgOperations(tokenProvider, logger);
        const daLiveContentOps = new DaLiveContentOperations(tokenProvider, logger);
        const configService = new DaLiveConfigService(tokenProvider, logger);

        let allSites: Array<{ name: string; lastModified?: number }> = [];
        const linkedSiteKeys = new Set<string>();

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Loading DA.live sites from ${orgName}:`,
                cancellable: false,
            },
            async () => {
                try {
                    logger.debug(`[DA.live Manage] Fetching sites for org: ${orgName}`);
                    allSites = await daLiveOps.listOrgSites(orgName);
                    logger.debug(`[DA.live Manage] Found ${allSites.length} sites`);

                    // Cross-reference with Demo Builder projects to identify linked sites
                    const stateManager = ServiceLocator.getStateManager();
                    if (stateManager) {
                        const edsProjects = await getLinkedEdsProjects(stateManager);
                        for (const project of edsProjects) {
                            if (project.metadata.daLiveOrg === orgName && project.metadata.daLiveSite) {
                                const key = `${orgName}/${project.metadata.daLiveSite}`;
                                linkedSiteKeys.add(key);
                                logger.debug(`[DA.live Manage] Found linked project for ${key}`);
                            }
                        }
                    }
                } catch (error) {
                    logger.error(`[DA.live Manage] Failed to list sites:`, error as Error);
                    throw error;
                }
            },
        );

        if (allSites.length === 0) {
            const message = `No sites found in organization "${orgName}".\n\n` +
                `Possible reasons:\n` +
                `• Organization name is incorrect\n` +
                `• No access to this organization\n` +
                `• Organization has no DA.live sites\n\n` +
                `Check Debug Logs for details.`;

            vscode.window.showWarningMessage(message, 'Open Debug Logs').then(selection => {
                if (selection === 'Open Debug Logs') {
                    vscode.commands.executeCommand('demoBuilder.showDebugLogs');
                }
            });
            return;
        }

        // Step 3: Create QuickPick items
        const quickPickItems: SiteQuickPickItem[] = allSites.map(site => {
            const key = `${orgName}/${site.name}`;
            const isLinked = linkedSiteKeys.has(key);
            return {
                label: site.name,
                description: isLinked
                    ? '$(link) Linked to Demo Builder project'
                    : site.lastModified
                        ? `Modified: ${new Date(site.lastModified).toLocaleDateString()}`
                        : undefined,
                siteName: site.name,
                lastModified: site.lastModified,
                isLinked,
            };
        });

        // Step 4: Show multi-select QuickPick
        const selectedItems = await vscode.window.showQuickPick(quickPickItems, {
            canPickMany: true,
            placeHolder: `Select sites to delete from ${orgName} (${allSites.length} total)`,
            title: 'Manage DA.live Sites',
            matchOnDescription: true,
        });

        if (!selectedItems || selectedItems.length === 0) {
            return; // User cancelled or selected nothing
        }

        // Step 5: Confirm deletion
        const siteNames = selectedItems.map(item => item.siteName);

        const confirmMessage =
            siteNames.length === 1
                ? `Delete "${siteNames[0]}"?`
                : `Delete ${siteNames.length} sites?`;

        const confirmDetail = 'Site content and permission rows will be removed. This action cannot be undone.';

        const confirmed = await vscode.window.showWarningMessage(
            confirmMessage,
            { modal: true, detail: confirmDetail },
            'Delete',
        );

        if (confirmed !== 'Delete') {
            return; // User cancelled
        }

        // Step 6: Delete selected sites with permission cleanup
        const deleted: string[] = [];
        const failed: Array<{ site: string; error: string }> = [];

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Deleting DA.live sites',
                cancellable: false,
            },
            async (progress) => {
                for (let i = 0; i < siteNames.length; i++) {
                    const siteName = siteNames[i];
                    progress.report({
                        message: `${i + 1}/${siteNames.length}: ${siteName}`,
                        increment: 100 / siteNames.length,
                    });

                    try {
                        logger.debug(`[DA.live Manage] Deleting content from ${siteName}`);
                        const deleteResult = await daLiveContentOps.deleteAllSiteContent(orgName, siteName);
                        if (!deleteResult.success) {
                            throw new Error(deleteResult.error || 'Content deletion failed');
                        }
                        deleted.push(siteName);
                        logger.info(`[DA.live Manage] ✓ Deleted: ${siteName} (${deleteResult.deletedCount} files)`);

                        // Clean up stale permission rows (best-effort, never throws)
                        const permResult = await configService.removeSitePermissions(orgName, siteName);
                        if (!permResult.success) {
                            logger.warn(`[DA.live Manage] Permission cleanup failed for ${siteName}: ${permResult.error}`);
                        }

                        // Best-effort: delete site-level config (block library entry)
                        const configDeleteResult = await configService.deleteSiteConfig(orgName, siteName);
                        if (!configDeleteResult.success) {
                            logger.debug(`[DA.live Manage] Site config cleanup skipped for ${siteName}: ${configDeleteResult.error}`);
                        }
                    } catch (error) {
                        const errorMsg = (error as Error).message;
                        failed.push({ site: siteName, error: errorMsg });
                        logger.error(`[DA.live Manage] ✗ Failed: ${siteName} - ${errorMsg}`);
                    }
                }
            },
        );

        // Step 7: Show results
        if (deleted.length > 0 && failed.length === 0) {
            const resultMessage = `Successfully deleted ${deleted.length} site${deleted.length !== 1 ? 's' : ''}.`;
            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: resultMessage,
                    cancellable: false,
                },
                async () => {
                    await new Promise(resolve => setTimeout(resolve, TIMEOUTS.UI.NOTIFICATION));
                },
            );
        } else if (deleted.length > 0 && failed.length > 0) {
            const failedList = failed.map(f => f.site).join(', ');
            vscode.window.showWarningMessage(
                `Deleted ${deleted.length}, failed ${failed.length}: ${failedList}`,
            );
        } else {
            vscode.window.showErrorMessage(
                `Failed to delete all ${failed.length} sites.`,
            );
        }

        logger.info(
            `[DA.live Manage] Complete - Deleted: ${deleted.length}, Failed: ${failed.length}`,
        );
    } catch (error) {
        logger.error('[DA.live Manage Command] Error:', error as Error);
        vscode.window.showErrorMessage(
            `Failed to manage DA.live sites: ${(error as Error).message}`,
        );
    }
}
