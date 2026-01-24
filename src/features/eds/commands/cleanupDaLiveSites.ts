/**
 * Command: Cleanup DA.live Sites
 * 
 * Interactive VS Code command to clean up DA.live sites with multi-select UI.
 * 
 * Features:
 * - Organization selection with input box
 * - Fetches and displays all sites in the org
 * - Multi-select QuickPick with filtering
 * - Batch deletion with progress feedback
 */

import * as vscode from 'vscode';
import { getLogger } from '@/core/logging';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { DaLiveOrgOperations } from '../services/daLiveOrgOperations';

interface SiteQuickPickItem extends vscode.QuickPickItem {
    siteName: string;
    lastModified?: number;
}

export async function cleanupDaLiveSitesCommand(): Promise<void> {
    const logger = getLogger();

    try {
        // Step 1: Prompt for org name
        const orgName = await vscode.window.showInputBox({
            prompt: 'Enter DA.live organization name',
            placeHolder: 'e.g., skukla',
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
        
        const daLiveOps = new DaLiveOrgOperations(
            {
                getAccessToken: async () => {
                    const token = await tokenManager.getAccessToken();
                    logger.debug(`[DA.live Manage] Token retrieved: ${token ? `${token.substring(0, 20)}...` : 'null'}`);
                    return token ?? null;
                },
            },
            logger,
        );

        let allSites: Array<{ name: string; lastModified?: number }> = [];

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Loading projects from ${orgName}...`,
                cancellable: false,
            },
            async () => {
                try {
                    logger.debug(`[DA.live Manage] Fetching sites for org: ${orgName}`);
                    allSites = await daLiveOps.listOrgSites(orgName);
                    logger.debug(`[DA.live Manage] Found ${allSites.length} sites`);
                } catch (error) {
                    logger.error(`[DA.live Manage] Failed to list sites:`, error as Error);
                    throw error;
                }
            },
        );

        if (allSites.length === 0) {
            const message = `No projects found in organization "${orgName}".\n\n` +
                `Possible reasons:\n` +
                `• Organization name is incorrect\n` +
                `• No access to this organization\n` +
                `• Organization has no DA.live projects\n\n` +
                `Check Debug Logs for details.`;
            
            vscode.window.showWarningMessage(message, 'Open Debug Logs').then(selection => {
                if (selection === 'Open Debug Logs') {
                    vscode.commands.executeCommand('demoBuilder.showDebugLogs');
                }
            });
            return;
        }

        // Step 3: Create QuickPick items
        const quickPickItems: SiteQuickPickItem[] = allSites.map(site => ({
            label: site.name,
            description: site.lastModified
                ? `Modified: ${new Date(site.lastModified).toLocaleDateString()}`
                : undefined,
            siteName: site.name,
            lastModified: site.lastModified,
        }));

        // Step 4: Show multi-select QuickPick
        const selectedItems = await vscode.window.showQuickPick(quickPickItems, {
            canPickMany: true,
            placeHolder: `Select projects to delete from ${orgName} (${allSites.length} total)`,
            title: 'Manage DA.live Projects',
            matchOnDescription: true,
        });

        if (!selectedItems || selectedItems.length === 0) {
            return; // User cancelled or selected nothing
        }

        // Step 5: Confirm deletion
        const sitesToDelete = selectedItems.map(item => item.siteName);
        const confirmMessage =
            sitesToDelete.length === 1
                ? `Delete "${sitesToDelete[0]}"?`
                : `Delete ${sitesToDelete.length} projects?`;

        const confirmed = await vscode.window.showWarningMessage(
            confirmMessage,
            { modal: true, detail: 'This action cannot be undone.' },
            'Delete',
        );

        if (confirmed !== 'Delete') {
            return; // User cancelled
        }

        // Step 6: Delete selected sites
        const deleted: string[] = [];
        const failed: Array<{ site: string; error: string }> = [];

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Deleting projects...',
                cancellable: false,
            },
            async (progress) => {
                for (let i = 0; i < sitesToDelete.length; i++) {
                    const site = sitesToDelete[i];
                    const percentage = Math.round(((i + 1) / sitesToDelete.length) * 100);
                    progress.report({
                        message: `${i + 1}/${sitesToDelete.length}: ${site}`,
                        increment: 100 / sitesToDelete.length,
                    });

                    try {
                        await daLiveOps.deleteSite(orgName, site);
                        deleted.push(site);
                        logger.info(`[DA.live Cleanup] ✓ Deleted: ${site}`);
                    } catch (error) {
                        const errorMsg = (error as Error).message;
                        failed.push({ site, error: errorMsg });
                        logger.error(`[DA.live Cleanup] ✗ Failed: ${site} - ${errorMsg}`);
                    }
                }
            },
        );

        // Step 7: Show results
        if (deleted.length > 0 && failed.length === 0) {
            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: `Successfully deleted ${deleted.length} project${deleted.length !== 1 ? 's' : ''}.`,
                    cancellable: false,
                },
                async () => {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                },
            );
        } else if (deleted.length > 0 && failed.length > 0) {
            const failedList = failed.map(f => f.site).join(', ');
            vscode.window.showWarningMessage(
                `Deleted ${deleted.length}, failed ${failed.length}: ${failedList}`,
            );
        } else {
            vscode.window.showErrorMessage(
                `Failed to delete all ${failed.length} projects.`,
            );
        }

        logger.info(
            `[DA.live Cleanup] Complete - Deleted: ${deleted.length}, Failed: ${failed.length}`,
        );
    } catch (error) {
        logger.error('[DA.live Cleanup Command] Error:', error as Error);
        vscode.window.showErrorMessage(
            `Failed to manage DA.live projects: ${(error as Error).message}`,
        );
    }
}
