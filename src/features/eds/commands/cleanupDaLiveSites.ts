/**
 * Command: Manage DA.live Sites
 *
 * Interactive VS Code command to manage DA.live sites with multi-select UI.
 *
 * Features:
 * - Organization selection with input box
 * - Fetches and displays all sites in the org
 * - Multi-select QuickPick with filtering
 * - Batch deletion with Helix CDN unpublish
 * - Cross-references Demo Builder projects for repo metadata
 */

import * as vscode from 'vscode';
import { getLogger } from '@/core/logging';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { DaLiveOrgOperations } from '../services/daLiveOrgOperations';
import { HelixService } from '../services/helixService';
import { getLinkedEdsProjects, deleteDaLiveSiteWithUnpublish } from '../services/resourceCleanupHelpers';

interface SiteQuickPickItem extends vscode.QuickPickItem {
    siteName: string;
    lastModified?: number;
    linkedRepo?: string; // GitHub repo if site is linked to a Demo Builder project
}

/**
 * Map of DA.live sites to their linked GitHub repos
 * Key: "org/site", Value: "owner/repo"
 */
interface SiteRepoMap {
    [key: string]: string | undefined;
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
                logger.debug(`[DA.live Manage] Token retrieved: ${token ? `${token.substring(0, 20)}...` : 'null'}`);
                return token ?? null;
            },
        };

        const daLiveOps = new DaLiveOrgOperations(tokenProvider, logger);
        const helixService = new HelixService(logger, undefined, tokenProvider);

        let allSites: Array<{ name: string; lastModified?: number }> = [];
        let siteRepoMap: SiteRepoMap = {};

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

                    // Cross-reference with Demo Builder projects to find linked repos
                    const stateManager = ServiceLocator.getStateManager();
                    if (stateManager) {
                        const edsProjects = await getLinkedEdsProjects(stateManager);
                        for (const project of edsProjects) {
                            if (project.metadata.daLiveOrg === orgName && project.metadata.daLiveSite && project.metadata.githubRepo) {
                                const key = `${orgName}/${project.metadata.daLiveSite}`;
                                siteRepoMap[key] = project.metadata.githubRepo;
                                logger.debug(`[DA.live Manage] Found linked repo for ${key}: ${project.metadata.githubRepo}`);
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
            const linkedRepo = siteRepoMap[key];
            return {
                label: site.name,
                description: linkedRepo
                    ? `$(link) Linked to ${linkedRepo}`
                    : site.lastModified
                        ? `Modified: ${new Date(site.lastModified).toLocaleDateString()}`
                        : undefined,
                detail: linkedRepo ? 'Will unpublish from Helix CDN first' : undefined,
                siteName: site.name,
                lastModified: site.lastModified,
                linkedRepo,
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
        const sitesToDelete = selectedItems.map(item => ({
            siteName: item.siteName,
            linkedRepo: item.linkedRepo,
        }));

        const hasLinkedSites = sitesToDelete.some(s => s.linkedRepo);
        const confirmMessage =
            sitesToDelete.length === 1
                ? `Delete "${sitesToDelete[0].siteName}"?`
                : `Delete ${sitesToDelete.length} sites?`;

        const confirmDetail = hasLinkedSites
            ? 'Sites linked to Demo Builder projects will have their CDN content unpublished first. This action cannot be undone.'
            : 'This action cannot be undone.';

        const confirmed = await vscode.window.showWarningMessage(
            confirmMessage,
            { modal: true, detail: confirmDetail },
            'Delete',
        );

        if (confirmed !== 'Delete') {
            return; // User cancelled
        }

        // Step 6: Delete selected sites (with Helix unpublish for linked sites)
        const deleted: string[] = [];
        const failed: Array<{ site: string; error: string }> = [];
        const warnings: string[] = [];

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Deleting DA.live sites',
                cancellable: false,
            },
            async (progress) => {
                for (let i = 0; i < sitesToDelete.length; i++) {
                    const { siteName, linkedRepo } = sitesToDelete[i];
                    progress.report({
                        message: `${i + 1}/${sitesToDelete.length}: ${siteName}`,
                        increment: 100 / sitesToDelete.length,
                    });

                    try {
                        if (linkedRepo) {
                            // Use combined cleanup: Helix unpublish + DA.live delete
                            logger.debug(`[DA.live Manage] Deleting ${siteName} with Helix unpublish (repo: ${linkedRepo})`);

                            const result = await deleteDaLiveSiteWithUnpublish(
                                helixService,
                                daLiveOps,
                                linkedRepo,
                                orgName,
                                siteName,
                                logger,
                            );

                            if (result.success) {
                                deleted.push(siteName);
                                logger.info(`[DA.live Manage] ✓ Deleted: ${siteName} (Helix: ${result.helixUnpublished ? 'unpublished' : 'skipped'})`);

                                if (!result.helixUnpublished) {
                                    warnings.push(`${siteName}: Helix unpublish incomplete`);
                                }
                            } else {
                                failed.push({ site: siteName, error: result.error || 'Unknown error' });
                                logger.error(`[DA.live Manage] ✗ Failed: ${siteName} - ${result.error}`);
                            }
                        } else {
                            // Site not linked to Demo Builder project - direct DA.live delete
                            // This is expected for sites created outside Demo Builder
                            logger.debug(`[DA.live Manage] Deleting ${siteName} (external site - no linked repo for CDN cleanup)`);

                            await daLiveOps.deleteSite(orgName, siteName);
                            deleted.push(siteName);
                            logger.info(`[DA.live Manage] ✓ Deleted: ${siteName} (external site - no CDN cleanup needed)`);
                            // Only add warning if user might care about CDN content
                            // For external sites, this is expected behavior - don't add to warnings
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
            let resultMessage = `Successfully deleted ${deleted.length} site${deleted.length !== 1 ? 's' : ''}.`;

            if (warnings.length > 0) {
                // Show warning with details
                vscode.window.showWarningMessage(
                    resultMessage + ' Some sites may have incomplete cleanup.',
                    'View Details',
                ).then(selection => {
                    if (selection === 'View Details') {
                        vscode.commands.executeCommand('demoBuilder.showDebugLogs');
                    }
                });
            } else {
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
            }
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

        // Log warnings
        for (const warning of warnings) {
            logger.warn(`[DA.live Manage] Warning: ${warning}`);
        }

        logger.info(
            `[DA.live Manage] Complete - Deleted: ${deleted.length}, Failed: ${failed.length}, Warnings: ${warnings.length}`,
        );
    } catch (error) {
        logger.error('[DA.live Manage Command] Error:', error as Error);
        vscode.window.showErrorMessage(
            `Failed to manage DA.live sites: ${(error as Error).message}`,
        );
    }
}
