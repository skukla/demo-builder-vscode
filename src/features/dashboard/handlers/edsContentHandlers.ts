/**
 * Dashboard EDS Content Handlers
 *
 * EDS storefront content operations from the dashboard: sync storefront code,
 * rebuild the DA.live block library, and republish DA.live content to the CDN.
 * Extracted from `dashboardHandlers.ts` for the 500-line handler cap; the parent
 * re-exports everything here so import sites are unchanged.
 */

import * as vscode from 'vscode';
import { handleRequestStatus } from './statusHandlers';
import { COMPONENT_IDS } from '@/core/constants';
import { withProgressRegister } from '@/core/vscode/progressRegister';
import { ErrorCode } from '@/types/errorCodes';
import { MessageHandler } from '@/types/handlers';
import { isEdsProject } from '@/types/typeGuards';

/**
 * Handle 'syncStorefront' message - Push storefront changes and refresh Helix preview/live
 */
export const handleSyncStorefront: MessageHandler = async () => {
    await vscode.commands.executeCommand('demoBuilder.syncStorefront');
    return { success: true };
};

/**
 * Handle 'refreshBlockLibrary' message - Rebuild the DA.live authoring library
 * from the project's current component-definition.json.
 *
 * EDS-only kebab action for users who hand-edit component-definition.json
 * outside the AI flow and want to re-sync the DA.live library destructively.
 *
 * Return contract: `{ success: true }` means the command was **dispatched**, not
 * that the rebuild succeeded. The pipeline runs asynchronously under the
 * RefreshBlockLibraryCommand and reports its outcome via VS Code notifications
 * (progress + success/error toasts). The webview does not poll for completion;
 * the kebab item simply fires-and-forgets and the user watches the notification.
 */
export const handleRefreshBlockLibrary: MessageHandler = async (context) => {
    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { success: false, error: 'No project loaded', code: ErrorCode.PROJECT_NOT_FOUND };
    }

    if (!isEdsProject(project)) {
        return {
            success: false,
            error: 'Block library refresh applies to EDS projects only',
            code: ErrorCode.INVALID_OPERATION,
        };
    }

    await vscode.commands.executeCommand('demoBuilder.refreshBlockLibrary');
    return { success: true };
};

/**
 * Handle 'republishContent' message - Republish DA.live content to CDN (EDS only)
 *
 * Mirrors the kebab's handleRepublishContent but resolves the project via
 * getCurrentProject(). Reuses republishStorefrontContent and the same EDS
 * metadata reads + DA.live auth + progress notification.
 */
export const handleRepublishContent: MessageHandler = async (context) => {
    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { success: false, error: 'No project found', code: ErrorCode.PROJECT_NOT_FOUND };
    }

    // Read EDS metadata from the storefront component instance
    const edsInstance = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT];
    const repoFullName = edsInstance?.metadata?.githubRepo as string | undefined;
    const daLiveOrg = edsInstance?.metadata?.daLiveOrg as string | undefined;
    const daLiveSite = edsInstance?.metadata?.daLiveSite as string | undefined;

    if (!repoFullName) {
        vscode.window.showErrorMessage(
            'Repository information not found. Republish is only available for EDS projects.',
        );
        return {
            success: false,
            error: 'Repository information not found. Republish is only available for EDS projects.',
        };
    }

    const [repoOwner, repoName] = repoFullName.split('/');
    if (!repoOwner || !repoName) {
        vscode.window.showErrorMessage('Invalid repository format');
        return { success: false, error: 'Invalid repository format' };
    }

    const effectiveDaLiveOrg = daLiveOrg || repoOwner;
    const effectiveDaLiveSite = daLiveSite || repoName;

    // withProgressRegister, not vscode.window.withProgress directly: the register
    // is the ONE place a phase fans out to both destinations (the notification and
    // an agent's chat). Calling withProgress here meant every step below reached
    // only the VS Code window — so `republish` and `sync_content`, the long
    // operations an EDS project actually runs, narrated nothing to the chat while
    // mesh deploy did.
    return withProgressRegister(
        { title: `Republishing ${project.name}` },
        async (report) => {
            try {
                context.logger.info(`[Dashboard] Republishing content for ${repoFullName}`);

                report('Checking authentication…');
                const { ensureDaLiveAuth, getDaLiveAuthService, getGitHubServices } = await import(
                    '@/features/eds/handlers/edsHelpers'
                );
                const daLiveAuthResult = await ensureDaLiveAuth(context, '[Dashboard]');

                if (!daLiveAuthResult.authenticated) {
                    return {
                        success: false,
                        error: daLiveAuthResult.error || 'DA.live authentication required',
                        errorType: 'DALIVE_AUTH_REQUIRED',
                        cancelled: daLiveAuthResult.cancelled,
                    };
                }

                const daLiveAuthService = getDaLiveAuthService(context.context);
                const { tokenService: githubTokenService } = getGitHubServices(context);

                report('Republishing content…');
                const { republishStorefrontContent } = await import(
                    '@/features/eds/services/storefront/storefrontRepublishService'
                );
                const contentResult = await republishStorefrontContent({
                    project,
                    persist: (p) => context.stateManager.saveProject(p),
                    repoOwner,
                    repoName,
                    daLiveOrg: effectiveDaLiveOrg,
                    daLiveSite: effectiveDaLiveSite,
                    secrets: context.context.secrets,
                    logger: context.logger,
                    daLiveAuthService,
                    githubTokenService,
                    onProgress: (message: string) => report(message),
                });

                if (!contentResult.success) {
                    return { success: false, error: contentResult.error };
                }
                if (!contentResult.cdnVerified) {
                    context.logger.warn(
                        '[Dashboard] CDN verification timed out - content may still be propagating',
                    );
                }

                context.logger.info(`[Dashboard] Content republished for ${repoFullName}`);
                // Push the new storefront status so the Republish tile drops its
                // amber dot. `buildStatusPayload` carries `edsStorefrontStatus`,
                // and without this the open dashboard keeps rendering whatever it
                // was handed at init. `handleRenameProject` refreshes for the same
                // reason — the title also comes from that payload.
                await handleRequestStatus(context);
                return { success: true };
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                context.logger.error('[Dashboard] Republish failed', error as Error);
                vscode.window.showErrorMessage(`Failed to republish content: ${errorMessage}`);
                return { success: false, error: errorMessage };
            }
        },
    );
};
