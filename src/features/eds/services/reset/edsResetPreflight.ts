/**
 * The reset's pre-flight checks, run inside its progress window before anything
 * is touched: the DA.live sign-in, the Adobe sign-in, the Adobe organization, and
 * the AEM Code Sync GitHub App on the repository.
 *
 * Each answers null to carry on, or the result the reset stops with (the
 * project's status restored first).
 *
 * Extracted from `edsResetUI` (EDS-8, 2026-10-08) so that file keeps only the
 * reset door's orchestration.
 *
 * @module features/eds/services/reset/edsResetPreflight
 */

import type { GitHubAppService } from '../github/githubAppService';
import type { EdsResetResult } from './edsResetParams';
import { COMPONENT_IDS } from '@/core/constants';
import { askDuringOperation } from '@/core/vscode/operationPrompt';
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import type { Project, ProjectStatus } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';

/**
 * Check DA.live authentication, prompting sign-in if expired.
 * @returns null if authenticated, or an EdsResetResult if auth failed/cancelled.
 */
export async function checkDaLiveAuth(
    context: HandlerContext,
    project: Project,
    originalStatus: ProjectStatus,
    logPrefix: string,
): Promise<EdsResetResult | null> {
    const { ensureDaLiveAuth } = await import('../../handlers/edsHelpers');
    // The org hands the guard its server probe target: a locally-valid token
    // the server refuses is caught HERE, before the three-minute pipeline,
    // instead of surfacing as 52 "missing permission" 403s mid-reset.
    const probeOrg = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT]?.metadata
        ?.daLiveOrg as string | undefined;
    const result = await ensureDaLiveAuth(context, logPrefix, probeOrg);

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
export async function checkAdobeAuth(
    project: Project,
    context: HandlerContext,
    originalStatus: ProjectStatus,
    logPrefix: string,
    authService: AuthenticationService,
): Promise<EdsResetResult | null> {
    const { ensureAdobeIOAuth } = await import('@/core/auth/adobeAuthGuard');

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
 * Ensure the current token reaches the project's Adobe org before the
 * (destructive) reset, recovering INLINE on mismatch. Uses the canonical
 * action-time gate ensureProjectOrgContext — it shows a "Switch IMS Org" / Cancel
 * prompt right here, does the forced sign-in, re-verifies, and lets the reset
 * continue once the right org is active (no dependency on the passive dashboard
 * banner, which hides when the token can't be checked). Self-skips when the
 * project has no Adobe org.
 *
 * @returns null when the org is reachable (proceed), or an EdsResetResult when the
 *   user cancelled or the switch didn't land in the right org (status restored).
 */
export async function checkOrgContext(
    project: Project,
    context: HandlerContext,
    originalStatus: ProjectStatus,
    logPrefix: string,
    authService: AuthenticationService,
): Promise<EdsResetResult | null> {
    const { ensureProjectOrgContext } = await import(
        '@/features/authentication/services/ensureProjectOrgContext'
    );
    const result = await ensureProjectOrgContext({
        authManager: authService,
        project,
        logger: context.logger,
        logPrefix,
    });
    if (result.reachable) return null;

    context.logger.warn(
        `${logPrefix} resetEds: aborted — project org not reachable (cancelled=${result.cancelled})`,
    );
    project.status = originalStatus;
    await context.stateManager.saveProject(project);
    return {
        success: false,
        error: 'Adobe organization mismatch',
        errorType: 'ORG_MISMATCH',
        cancelled: result.cancelled,
    };
}

/**
 * Check GitHub App installation and prompt user if not installed.
 * @returns null if installed or user chose to continue, or an EdsResetResult if cancelled.
 */
export async function checkGitHubAppInstallation(
    vscode: typeof import('vscode'),
    context: HandlerContext,
    repoOwner: string,
    repoName: string,
    project: Project,
    originalStatus: ProjectStatus,
    logPrefix: string,
    injectedAppService?: GitHubAppService,
): Promise<EdsResetResult | null> {
    const { getGitHubServices } = await import('../../handlers/edsHelpers');
    const { tokenService: preCheckTokenService } = getGitHubServices(context.context.secrets);
    const { GitHubAppService } = await import('../github/githubAppService');
    // The DA.live session rides along: a site carrying any `access.admin` role
    // refuses the GitHub token outright, and storefront setup now pins one on
    // every project it registers.
    const { tryCreateDaLiveTokenProvider } = await import('../../handlers/edsHelpers');
    const appService =
        injectedAppService ??
        new GitHubAppService(
            preCheckTokenService,
            context.logger,
            tryCreateDaLiveTokenProvider(context.context),
        );
    const { resolveAppInstallation } = await import('../appInstallationResolver');
    const outcome = await resolveAppInstallation(
        appService,
        { repoOwner, repoName, repoUrl: '' },
        context.logger,
    );

    if (outcome.kind === 'installed') {
        return null;
    }

    // AEM never answered. Warning that the App "is not installed" would be a
    // claim the evidence does not support — the same false statement that had a
    // user reinstall a working App eleven times. Report the real cause and let
    // the reset continue; the check is advisory here, not a gate.
    if (outcome.kind === 'undetermined') {
        // An inner 400 is an answer that cannot say (EDS-23), not a missing response.
        const answered = outcome.codeStatus !== undefined
            ? `code.status ${outcome.codeStatus}`
            : `HTTP ${outcome.httpStatus ?? 'no response'}`;
        context.logger.warn(
            `${logPrefix} Could not verify AEM Code Sync on ${repoOwner}/${repoName} ` +
                `(${answered}) — continuing; this is a failed ` +
                `check, not a missing App.`,
        );
        return null;
    }

    context.logger.warn(`${logPrefix} AEM Code Sync app not installed on ${repoOwner}/${repoName}`);

    const appWarning = await askDuringOperation(
        'The AEM Code Sync GitHub App is not installed on this repository. ' +
            'Without it, code changes will not sync to the CDN and the site may not work correctly.',
        'Install App',
        'Continue Anyway',
    );

    if (appWarning === 'Install App') {
        const installUrl = appService.getInstallUrl(repoOwner, repoName);
        await vscode.env.openExternal(vscode.Uri.parse(installUrl));

        const afterInstall = await askDuringOperation(
            'After installing the app, click Continue to proceed with the reset.',
            'Continue',
            'Cancel',
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
