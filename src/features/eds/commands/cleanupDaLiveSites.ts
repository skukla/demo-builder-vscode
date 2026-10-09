/**
 * Command: Manage DA.live Sites
 *
 * Interactive VS Code command to manage DA.live sites with multi-select UI.
 *
 * Features:
 * - Organization selection with input box
 * - Fetches and displays all sites in the org
 * - Multi-select QuickPick with filtering
 * - Batch deletion through the shared storefront teardown: the site's pages come
 *   off the live site first, then its content, permission rows and settings (EDS-31)
 * - Cross-references Demo Builder projects for the GitHub repository each site
 *   publishes from
 */

import * as vscode from 'vscode';
import { DaLiveOrgOperations } from '../services/daLive/daLiveOrgOperations';
import { firstUsableDaLiveToken } from '../services/daLive/daLiveTokenChain';
import { HelixService } from '../services/helix/helixService';
import { getLinkedEdsProjects } from '../services/resourceCleanupHelpers';
import { projectsSharingRepo } from '../services/storefront/sharedRepoProjects';
import {
    tearDownStorefront,
    type StorefrontTeardownResult,
    type StorefrontTeardownTarget,
} from '../services/storefront/storefrontTeardown';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { getLogger } from '@/core/logging/debugLogger';
import { getDaLiveAuthService, getGitHubServices } from '@/features/eds/handlers/edsServiceCache';
import type { Logger } from '@/types/logger';

interface SiteQuickPickItem extends vscode.QuickPickItem {
    siteName: string;
    lastModified?: number;
    isLinked?: boolean; // Whether site is linked to a Demo Builder project
}

interface NamespaceQuickPickItem extends vscode.QuickPickItem {
    namespace: string;
}

export async function cleanupDaLiveSitesCommand(context: vscode.ExtensionContext): Promise<void> {
    const logger = getLogger();

    try {
        // Step 1: Pick the DA.live namespace using the same model as the
        // wizard's picker — personal GitHub account + every org the user is
        // a member of. Replaces the legacy free-text input + the removed
        // demoBuilder.daLive.defaultOrg lookup.
        const orgName = await pickNamespace(context);
        if (!orgName) {
            return; // User cancelled or no namespace available
        }

        // Step 2: Check authentication and fetch sites from org. The DA.live
        // session first: it is the only token the live-site unpublish accepts.
        const tokenProvider = await firstUsableDaLiveToken({
            daLiveSession: () => getDaLiveAuthService(context),
            imsTokenManager: () => ServiceLocator.getAuthenticationService().getTokenManager(),
        });

        if (!tokenProvider) {
            vscode.window.showErrorMessage(
                'Not signed in to DA.live or Adobe. Sign in to DA.live first.',
            );
            return;
        }

        const daLiveOps = new DaLiveOrgOperations(tokenProvider, logger);
        const stateManager = ServiceLocator.getStateManager();

        let allSites: Array<{ name: string; lastModified?: number }> = [];
        const linkedSiteKeys = new Set<string>();
        /** The `owner/repo` each linked site publishes from, by site name. */
        const repoBySite = new Map<string, string>();

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Loading DA.live sites',
                cancellable: false,
            },
            async () => {
                try {
                    logger.debug(`[DA.live Manage] Fetching sites for org: ${orgName}`);
                    allSites = await daLiveOps.listOrgSites(orgName);
                    logger.debug(`[DA.live Manage] Found ${allSites.length} sites`);

                    // Cross-reference with Demo Builder projects to identify linked sites
                    if (stateManager) {
                        const edsProjects = await getLinkedEdsProjects(stateManager);
                        for (const project of edsProjects) {
                            const linkedSite =
                                (project.metadata.daLiveSite as string | undefined) ??
                                (project.metadata.githubRepo as string | undefined)?.split('/')[1];
                            if (project.metadata.daLiveOrg === orgName && linkedSite) {
                                const key = `${orgName}/${linkedSite}`;
                                linkedSiteKeys.add(key);
                                const githubRepo = project.metadata.githubRepo as string | undefined;
                                if (githubRepo) repoBySite.set(linkedSite, githubRepo);
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

        const confirmDetail =
            "The site's pages, including its product pages, come off the live site. " +
            'Its content, permission rows and settings are removed. This action cannot be undone.';

        const confirmed = await vscode.window.showWarningMessage(
            confirmMessage,
            { modal: true, detail: confirmDetail },
            'Delete',
        );

        if (confirmed !== 'Delete') {
            return; // User cancelled
        }

        // Step 6: Take each site down through the shared teardown
        let outcome: SiteDeletionOutcome = { deleted: [], failed: [], stillLive: [] };

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Deleting DA.live sites',
                cancellable: false,
            },
            async (progress) => {
                outcome = await deleteDaLiveSites(orgName, siteNames, repoBySite, {
                    logger,
                    onSite: (index, siteName) =>
                        progress.report({
                            message: `${index + 1}/${siteNames.length}: ${siteName}`,
                            increment: 100 / siteNames.length,
                        }),
                    tearDown: (target) =>
                        tearDownStorefront(target, {
                            tokenProvider,
                            logger,
                            initKeyStore: () => HelixService.initKeyStore(context.secrets, context.globalState),
                            // A site, not a project, is being acted on (EDS-26).
                            otherProjectsOnRepo: async (repo) =>
                                stateManager ? projectsSharingRepo(stateManager, repo) : [],
                        }),
                });
            },
        );

        // Step 7: Show results
        showDeletionResult(outcome);

        const { deleted, failed } = outcome;
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

export interface SiteDeletionOutcome {
    deleted: string[];
    failed: Array<{ site: string; error: string }>;
    /**
     * Sites whose source went but whose pages may still be served: no repo, the unpublish
     * failed, a page still answered, or the check could not tell (EDS-33).
     */
    stillLive: string[];
}

/**
 * The `owner/repo` a site publishes from: the local project's record when one uses
 * the site, else the same-named repository in the same namespace — the DA.live org
 * is the GitHub namespace and the site name is the repo name on every storefront
 * made since the naming migration. A wrong guess fails the unpublish, which the
 * teardown reports as still published rather than as done.
 */
export function repoForSite(orgName: string, siteName: string, repoBySite: ReadonlyMap<string, string>): string {
    return repoBySite.get(siteName) ?? `${orgName}/${siteName}`;
}

/** Take each site down in turn; one failure never stops the rest. */
export async function deleteDaLiveSites(
    orgName: string,
    siteNames: string[],
    repoBySite: ReadonlyMap<string, string>,
    deps: {
        logger: Logger;
        tearDown: (target: StorefrontTeardownTarget) => Promise<StorefrontTeardownResult>;
        onSite?: (index: number, siteName: string) => void;
    },
): Promise<SiteDeletionOutcome> {
    const { logger } = deps;
    const outcome: SiteDeletionOutcome = { deleted: [], failed: [], stillLive: [] };

    for (let i = 0; i < siteNames.length; i++) {
        const siteName = siteNames[i];
        deps.onSite?.(i, siteName);
        const githubRepo = repoForSite(orgName, siteName, repoBySite);

        try {
            logger.debug(`[DA.live Manage] Tearing down ${orgName}/${siteName} (repo ${githubRepo})`);
            const torn = await deps.tearDown({ daLiveOrg: orgName, daLiveSite: siteName, githubRepo });
            logger.info(`[DA.live Manage] ${siteName}: ${torn.publishSummary}`);
            if (torn.productPages) {
                logger.info(`[DA.live Manage] ${siteName}: ${torn.productPages.summary}`);
            }
            if (!torn.contentDeleted) {
                throw new Error(torn.error || 'Content deletion failed');
            }
            outcome.deleted.push(siteName);
            const productPagesLeft =
                torn.productPages !== undefined &&
                !['removed', 'live-only', 'nothing'].includes(torn.productPages.status);
            if (torn.stillPublished || productPagesLeft) {
                outcome.stillLive.push(siteName);
            }
            logger.info(
                `[DA.live Manage] ✓ Deleted: ${siteName} (${torn.deletedCount ?? 0} files, ` +
                    `${torn.unpublishedPages ?? 0} pages unpublished)`,
            );
        } catch (error) {
            const errorMsg = (error as Error).message;
            outcome.failed.push({ site: siteName, error: errorMsg });
            logger.error(`[DA.live Manage] ✗ Failed: ${siteName} - ${errorMsg}`);
        }
    }
    return outcome;
}

/** One message for the whole batch; a site whose pages may still be live is never reported as clean. */
function showDeletionResult({ deleted, failed, stillLive }: SiteDeletionOutcome): void {
    const plural = (n: number) => `${n} site${n !== 1 ? 's' : ''}`;
    const stillLiveNote =
        stillLive.length > 0
            ? ` Pages may still be live for ${stillLive.join(', ')}. See Debug Logs for why.`
            : '';

    if (deleted.length > 0 && failed.length === 0) {
        const message = `Deleted ${plural(deleted.length)}.${stillLiveNote}`;
        if (stillLive.length > 0) {
            vscode.window.showWarningMessage(message);
        } else {
            vscode.window.showInformationMessage(message);
        }
    } else if (deleted.length > 0) {
        const failedList = failed.map(f => f.site).join(', ');
        vscode.window.showWarningMessage(
            `Deleted ${deleted.length}, failed ${failed.length}: ${failedList}.${stillLiveNote}`,
        );
    } else {
        vscode.window.showErrorMessage(`Failed to delete all ${plural(failed.length)}.`);
    }
}

/**
 * Show a QuickPick of GitHub namespaces the authenticated user can target —
 * personal account plus every org they belong to. Returns the picked slug,
 * or undefined if the user cancelled or has no GitHub auth.
 *
 * Mirrors the wizard's Spectrum picker (DaLiveServiceCard) but uses the
 * native VS Code QuickPick UI because this command runs outside the webview.
 * The default selection (the "$(check)" prefix) is always the personal
 * account — the namespace is always linked to the GitHub user.
 */
async function pickNamespace(
    context: vscode.ExtensionContext,
): Promise<string | undefined> {
    const { tokenService } = getGitHubServices(context.secrets);
    const validation = await tokenService.validateToken();
    if (!validation.valid || !validation.user) {
        vscode.window.showErrorMessage(
            'Sign in to GitHub via Demo Builder first — needed to list available namespaces.',
        );
        return undefined;
    }

    const githubUser = validation.user.login;
    const orgs = await tokenService.getUserOrgs();

    const items: NamespaceQuickPickItem[] = [
        {
            label: `$(check) ${githubUser} (Personal account)`,
            namespace: githubUser,
        },
        ...orgs.sort((a, b) => a.localeCompare(b)).map((org) => ({
            label: org,
            namespace: org,
        })),
    ];

    const picked = await vscode.window.showQuickPick(items, {
        title: 'Manage DA.live Sites',
        placeHolder: 'Pick the DA.live namespace whose sites you want to manage',
        ignoreFocusOut: true,
    });

    return picked?.namespace;
}
