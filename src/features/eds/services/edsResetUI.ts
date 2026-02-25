/**
 * EDS Reset UI Orchestration
 *
 * Handles the full reset flow with user-facing UI elements:
 * - Confirmation dialog
 * - Authentication checks (DA.live, Adobe I/O)
 * - GitHub App installation check
 * - Progress notification
 * - Success/error notifications
 *
 * Both dashboard and projects-dashboard handlers use resetEdsProjectWithUI()
 * as the single entry point for resetting EDS projects with UI.
 *
 * Extracted from edsResetService.ts for file size management.
 *
 * @module features/eds/services/edsResetUI
 */

import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Project, ProjectStatus } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';
import { executeEdsReset, extractResetParams, type EdsResetParams, type EdsResetResult } from './edsResetService';

// ==========================================================
// Types
// ==========================================================

/**
 * Options for the full reset UI flow
 */
export interface ResetWithUIOptions {
    /** Project to reset */
    project: Project;
    /** Handler context */
    context: HandlerContext;
    /** Log prefix for messages (e.g., '[Dashboard]' or '[ProjectsList]') */
    logPrefix?: string;
    /** Include block library configuration (default: false) */
    includeBlockLibrary?: boolean;
    /** Verify CDN resources after publish (default: false) */
    verifyCdn?: boolean;
    /** Redeploy API Mesh after reset (default: auto-detect based on project) */
    redeployMesh?: boolean;
    /** Show "Show Logs" button in error messages (default: false) */
    showLogsOnError?: boolean;
}

// ==========================================================
// Auth Checks
// ==========================================================

/**
 * Check DA.live authentication, prompting sign-in if expired.
 * @returns null if authenticated, or an EdsResetResult if auth failed/cancelled.
 */
async function checkDaLiveAuth(
    context: HandlerContext,
    project: Project,
    originalStatus: ProjectStatus,
    logPrefix: string,
): Promise<EdsResetResult | null> {
    const { ensureDaLiveAuth } = await import('../handlers/edsHelpers');
    const result = await ensureDaLiveAuth(context, logPrefix);

    if (result.authenticated) return null;

    project.status = originalStatus;
    await context.stateManager.saveProject(project);
    return {
        success: false,
        error: result.error || 'DA.live authentication required',
        errorType: 'DALIVE_AUTH_REQUIRED',
        cancelled: result.cancelled,
    };
}

/**
 * Check Adobe I/O authentication for mesh projects, prompting sign-in if expired.
 * @returns null if authenticated (or no mesh), or an EdsResetResult if auth failed/cancelled.
 */
async function checkAdobeAuth(
    project: Project,
    context: HandlerContext,
    originalStatus: ProjectStatus,
    logPrefix: string,
): Promise<EdsResetResult | null> {
    const { ensureAdobeIOAuth } = await import('@/core/auth/adobeAuthGuard');
    const { ServiceLocator } = await import('@/core/di');
    const authService = ServiceLocator.getAuthenticationService();

    const result = await ensureAdobeIOAuth({
        authManager: authService,
        logger: context.logger,
        logPrefix,
        projectContext: {
            organization: project.adobe?.organization,
            projectId: project.adobe?.projectId,
            workspace: project.adobe?.workspace,
        },
        warningMessage: 'Your Adobe I/O session has expired. Please sign in to continue.',
    });

    if (result.authenticated) return null;

    project.status = originalStatus;
    await context.stateManager.saveProject(project);
    return {
        success: false,
        error: 'Adobe I/O authentication required',
        errorType: 'ADOBE_AUTH_REQUIRED',
        cancelled: result.cancelled,
    };
}

/**
 * Check GitHub App installation and prompt user if not installed.
 * @returns null if installed or user chose to continue, or an EdsResetResult if cancelled.
 */
async function checkGitHubAppInstallation(
    vscode: typeof import('vscode'),
    context: HandlerContext,
    repoOwner: string,
    repoName: string,
    project: Project,
    originalStatus: ProjectStatus,
    logPrefix: string,
): Promise<EdsResetResult | null> {
    const { getGitHubServices } = await import('../handlers/edsHelpers');
    const { tokenService: preCheckTokenService } = getGitHubServices(context);
    const { GitHubAppService } = await import('./githubAppService');
    const appService = new GitHubAppService(preCheckTokenService, context.logger);
    const appCheck = await appService.isAppInstalled(repoOwner, repoName);

    if (appCheck.isInstalled) {
        return null;
    }

    context.logger.warn(`${logPrefix} AEM Code Sync app not installed on ${repoOwner}/${repoName}`);

    const appWarning = await vscode.window.showWarningMessage(
        'The AEM Code Sync GitHub App is not installed on this repository. ' +
        'Without it, code changes will not sync to the CDN and the site may not work correctly.',
        'Install App',
        'Continue Anyway',
    );

    if (appWarning === 'Install App') {
        const installUrl = appService.getInstallUrl(repoOwner, repoName);
        await vscode.env.openExternal(vscode.Uri.parse(installUrl));

        const afterInstall = await vscode.window.showInformationMessage(
            'After installing the app, click Continue to proceed with the reset.',
            'Continue', 'Cancel',
        );
        if (afterInstall === 'Continue') {
            return null;
        }
        context.logger.info(`${logPrefix} resetEds: User cancelled after app installation prompt`);
    } else if (appWarning === 'Continue Anyway') {
        return null;
    } else {
        context.logger.info(`${logPrefix} resetEds: User cancelled at app check`);
    }

    project.status = originalStatus;
    await context.stateManager.saveProject(project);
    return { success: false, cancelled: true };
}

// ==========================================================
// Notifications
// ==========================================================

/** Show result notifications after reset completes. */
async function showResetResultNotifications(
    vscode: typeof import('vscode'),
    result: EdsResetResult,
    projectName: string,
    showLogsOnError: boolean,
): Promise<void> {
    if (result.success) {
        void vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: `"${projectName}" reset successfully` },
            async () => new Promise(resolve => setTimeout(resolve, TIMEOUTS.UI.NOTIFICATION)),
        );

        if (result.errorType === 'MESH_REDEPLOY_FAILED') {
            vscode.window.showWarningMessage(
                `${result.error} Commerce features may not work until mesh is manually redeployed.`,
            );
        }
    } else if (result.errorType === 'GITHUB_APP_NOT_INSTALLED') {
        const selection = await vscode.window.showErrorMessage(
            `Cannot reset EDS project: The AEM Code Sync GitHub App is not installed on ${result.errorDetails?.owner}/${result.errorDetails?.repo}. ` +
            `Please install the app and try again.`,
            'Install GitHub App',
        );
        if (selection === 'Install GitHub App' && result.errorDetails?.installUrl) {
            await vscode.env.openExternal(vscode.Uri.parse(result.errorDetails.installUrl as string));
        }
    } else if (result.error) {
        if (showLogsOnError) {
            const { getLogger } = await import('@/core/logging');
            vscode.window.showErrorMessage(`Failed to reset EDS project: ${result.error}`, 'Show Logs').then(sel => {
                if (sel === 'Show Logs') { getLogger().show(false); }
            });
        } else {
            vscode.window.showErrorMessage(`Failed to reset EDS project: ${result.error}`);
        }
    }
}

// ==========================================================
// Main Entry Point
// ==========================================================

/**
 * Reset an EDS project with full UI flow
 *
 * This is the consolidated entry point for resetting EDS projects.
 * It handles:
 * 1. Parameter extraction and validation
 * 2. Confirmation dialog (shown immediately)
 * 3. Progress notification (shown immediately after confirmation)
 * 4. Auth checks inside progress (DA.live, Adobe I/O if mesh exists)
 * 5. GitHub App check inside progress
 * 6. Actual reset via executeEdsReset
 * 7. Success/error notifications
 *
 * Both dashboard and projects-dashboard handlers should use this function
 * to eliminate code duplication.
 *
 * @param options - Reset options
 * @returns Reset result
 */
export async function resetEdsProjectWithUI(options: ResetWithUIOptions): Promise<EdsResetResult> {
    const {
        project, context,
        logPrefix = '[EdsReset]',
        includeBlockLibrary = false, verifyCdn = false, redeployMesh, showLogsOnError = false,
    } = options;

    const vscode = await import('vscode');
    const { getDaLiveAuthService } = await import('../handlers/edsHelpers');
    const { createDaLiveServiceTokenProvider } = await import('./daLiveContentOperations');
    const { getMeshComponentInstance } = await import('@/types/typeGuards');

    const paramsResult = extractResetParams(project);
    if (!paramsResult.success) {
        context.logger.error(`${logPrefix} resetEds: ${paramsResult.error}`);
        return { success: false, error: paramsResult.error };
    }

    const { repoOwner, repoName } = paramsResult.params;
    const repoFullName = `${repoOwner}/${repoName}`;

    const confirmButton = 'Reset Project';
    const confirmation = await vscode.window.showWarningMessage(
        `Are you sure you want to reset "${project.name}"? This will reset all code to the template state and re-copy demo content.`,
        { modal: true }, confirmButton,
    );
    if (confirmation !== confirmButton) {
        context.logger.info(`${logPrefix} resetEds: User cancelled reset`);
        return { success: false, cancelled: true };
    }

    const originalStatus = project.status;
    project.status = 'resetting';
    await context.stateManager.saveProject(project);

    try {
        return await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: 'Resetting EDS Project', cancellable: false },
            async (progress) => {
                context.logger.info(`${logPrefix} Resetting EDS project: ${repoFullName}`);

                // Pre-flight auth checks
                progress.report({ message: 'Checking authentication...' });
                const daLiveResult = await checkDaLiveAuth(context, project, originalStatus, logPrefix);
                if (daLiveResult) return daLiveResult;
                const daLiveAuthService = getDaLiveAuthService(context.context);

                const meshComponent = getMeshComponentInstance(project);
                const hasMesh = !!meshComponent?.path;

                if (hasMesh) {
                    progress.report({ message: 'Checking Adobe I/O authentication...' });
                    const adobeResult = await checkAdobeAuth(project, context, originalStatus, logPrefix);
                    if (adobeResult) return adobeResult;
                }

                progress.report({ message: 'Checking GitHub App...' });
                const appResult = await checkGitHubAppInstallation(
                    vscode, context, repoOwner, repoName, project, originalStatus, logPrefix,
                );
                if (appResult) return appResult;

                // Execute reset
                const tokenProvider = createDaLiveServiceTokenProvider(daLiveAuthService);
                const resetParams: EdsResetParams = {
                    ...paramsResult.params,
                    includeBlockLibrary, verifyCdn, redeployMesh: redeployMesh ?? hasMesh,
                };

                const result = await executeEdsReset(
                    resetParams, context, tokenProvider,
                    (p) => { progress.report({ message: `Step ${p.step}/${p.totalSteps}: ${p.message}` }); },
                );

                await showResetResultNotifications(vscode, result, project.name, showLogsOnError);
                return result;
            },
        );
    } finally {
        project.status = originalStatus;
        await context.stateManager.saveProject(project);
    }
}
