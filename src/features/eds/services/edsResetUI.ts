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

import {
    executeEdsReset,
    extractResetParams,
    type EdsResetParams,
    type EdsResetResult,
} from './edsResetService';
import { COMPONENT_IDS } from '@/core/constants';
import { sleep } from '@/core/utils/sleep';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Project, ProjectStatus } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';

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
    /**
     * Demo packages config for parameter extraction. Injectable for tests;
     * defaults to the bundled demo-packages.json inside extractResetParams.
     */
    packages?: Parameters<typeof extractResetParams>[1];
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
async function checkOrgContext(
    project: Project,
    context: HandlerContext,
    originalStatus: ProjectStatus,
    logPrefix: string,
): Promise<EdsResetResult | null> {
    const { ensureProjectOrgContext } = await import(
        '@/features/authentication/services/ensureProjectOrgContext'
    );
    const { ServiceLocator } = await import('@/core/di');
    const authService = ServiceLocator.getAuthenticationService();

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
    // The DA.live session rides along: a site carrying any `access.admin` role
    // refuses the GitHub token outright, and storefront setup now pins one on
    // every project it registers.
    const { tryCreateDaLiveTokenProvider } = await import('../handlers/edsHelpers');
    const appService = new GitHubAppService(
        preCheckTokenService,
        context.logger,
        tryCreateDaLiveTokenProvider(context.context),
    );
    const { resolveAppInstallation } = await import('./appInstallationResolver');
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
        context.logger.warn(
            `${logPrefix} Could not verify AEM Code Sync on ${repoOwner}/${repoName} ` +
                `(HTTP ${outcome.httpStatus ?? 'no response'}) — continuing; this is a failed ` +
                `check, not a missing App.`,
        );
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
            {
                location: vscode.ProgressLocation.Notification,
                title: `"${projectName}" reset successfully`,
            },
            async () => sleep(TIMEOUTS.UI.NOTIFICATION),
        );

        if (result.errorType === 'CONFIG_WRITE_FAILED') {
            // A dialog, not a progress line: `report()` writes to the single-line
            // notification that steps 8-11 overwrite within seconds, so the
            // remedy was gone before it could be read.
            vscode.window.showWarningMessage(result.error ?? 'Site configuration incomplete.');
        }

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
            await vscode.env.openExternal(
                vscode.Uri.parse(result.errorDetails.installUrl as string),
            );
        }
    } else if (result.error) {
        if (showLogsOnError) {
            const { getLogger } = await import('@/core/logging');
            vscode.window
                .showErrorMessage(`Failed to reset EDS project: ${result.error}`, 'Show Logs')
                .then((sel) => {
                    if (sel === 'Show Logs') {
                        getLogger().show(false);
                    }
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
        project,
        context,
        logPrefix = '[EdsReset]',
        includeBlockLibrary = false,
        verifyCdn = false,
        redeployMesh,
        showLogsOnError = false,
        packages,
    } = options;

    const vscode = await import('vscode');
    const { getDaLiveAuthService, resolveByomOverlayConfig } = await import(
        '../handlers/edsHelpers'
    );
    const { createDaLiveServiceTokenProvider } = await import('./daLiveContentOperations');
    const { getMeshComponentInstance } = await import('@/types/typeGuards');

    const paramsResult = extractResetParams(project, packages);
    if (!paramsResult.success) {
        context.logger.error(`${logPrefix} resetEds: ${paramsResult.error}`);
        return { success: false, error: paramsResult.error };
    }

    const { repoOwner, repoName } = paramsResult.params;
    const repoFullName = `${repoOwner}/${repoName}`;

    // Started BEFORE the first modal and awaited after it, so the wait happens
    // while the user is reading a dialog rather than staring at nothing.
    //
    // MEASURED 2026-08-17: the second prompt took ~2s to appear. It is not the
    // HTTP call — that endpoint answers in 130-230ms. It is the IMS token, which
    // `tokenManager.inspectToken` reads by spawning the whole `aio` Node CLI
    // (~3.7s cold, per its own comment) whenever its inspection cache is empty. A
    // reset is a common way to arrive at that cold cache.
    //
    // Deliberately NOT awaited here, and gated on the recorded pack so a project
    // that will never be asked never pays for it. Cancelling the reset therefore
    // costs one GET whose answer is discarded — bounded, idempotent, and it warms
    // a token cache eight other call sites want anyway.
    const canRemoveSampleData = beginSampleDataCredentialCheck(project, context);

    const confirmButton = 'Reset Project';
    const confirmation = await vscode.window.showWarningMessage(
        `Are you sure you want to reset "${project.name}"? This will reset all code to the template state and re-copy demo content.`,
        { modal: true },
        confirmButton,
    );
    if (confirmation !== confirmButton) {
        context.logger.info(`${logPrefix} resetEds: User cancelled reset`);
        return { success: false, cancelled: true };
    }

    // Sample data is a SEPARATE question, asked only when there is something to
    // remove. Reset has always meant "put the storefront back" — repo, CDN,
    // DA.live content. This target is different: products, categories and
    // customers on a live Commerce instance. Folding it into the first modal
    // would widen what an existing button destroys without saying so.
    //
    // Gated on the project's recorded pack rather than on asking the service what
    // is installed — that is a per-datapack lookup this dialog does not need, and
    // the removal itself reports when there was nothing there. It DOES now make
    // one short credential call (see the function), which is bounded and silent
    // on failure; the older "no network call in front of a modal" phrasing here
    // overstated a rule that was really about not adding failure modes.
    const removeData = await confirmSampleDataRemoval(project, vscode, canRemoveSampleData);

    const originalStatus = project.status;
    project.status = 'resetting';
    await context.stateManager.saveProject(project);

    try {
        return await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Resetting EDS Project',
                cancellable: false,
            },
            async (progress) => {
                context.logger.info(`${logPrefix} Resetting EDS project: ${repoFullName}`);

                // Pre-flight auth checks
                progress.report({ message: 'Checking authentication...' });
                const daLiveResult = await checkDaLiveAuth(
                    context,
                    project,
                    originalStatus,
                    logPrefix,
                );
                if (daLiveResult) return daLiveResult;
                const daLiveAuthService = getDaLiveAuthService(context.context);

                const meshComponent = getMeshComponentInstance(project);
                const hasMesh = !!meshComponent?.path;

                // Adobe auth + org-mismatch pre-flight runs for any project carrying
                // an Adobe org — that covers mesh (a mesh IS an Adobe I/O project, so
                // it always has `project.adobe`) AND non-mesh ACCS. This ensures a
                // reset never runs against the wrong org; the gate aborts with a
                // "Switch IMS Org" prompt, mirroring DeployMeshCommand.
                if (project.adobe?.organization) {
                    progress.report({ message: 'Checking Adobe I/O authentication...' });
                    const adobeResult = await checkAdobeAuth(
                        project,
                        context,
                        originalStatus,
                        logPrefix,
                    );
                    if (adobeResult) return adobeResult;

                    progress.report({ message: 'Checking Adobe organization...' });
                    const orgResult = await checkOrgContext(
                        project,
                        context,
                        originalStatus,
                        logPrefix,
                    );
                    if (orgResult) return orgResult;
                }

                progress.report({ message: 'Checking GitHub App...' });
                const appResult = await checkGitHubAppInstallation(
                    vscode,
                    context,
                    repoOwner,
                    repoName,
                    project,
                    originalStatus,
                    logPrefix,
                );
                if (appResult) return appResult;

                // Execute reset
                const tokenProvider = createDaLiveServiceTokenProvider(daLiveAuthService);
                // VS Code setting `demoBuilder.byom.overlayUrl` wins over
                // demo-packages.json. The helper stamps `?org=&site=` so the
                // shared multi-tenant `render-pdp` action can identify which
                // storefront's `/products/default` template to fetch.
                const resetParams: EdsResetParams = {
                    ...paramsResult.params,
                    byomOverlayUrl: resolveByomOverlayConfig(
                        paramsResult.params.byomOverlayUrl,
                        paramsResult.params.daLiveOrg,
                        paramsResult.params.daLiveSite,
                    ),
                    includeBlockLibrary,
                    verifyCdn,
                    redeployMesh: redeployMesh ?? hasMesh,
                };

                // BEFORE the storefront reset, because the pipeline's last step
                // pre-warms the catalog: it enumerates the instance's SKUs and
                // pre-publishes a PDP page for each. Running the data step after
                // it meant reset pre-published 30 product pages and then deleted
                // those products — measured in two runs on 2026-08-17. Ordered
                // this way the warm cache describes the catalog the user is left
                // with.
                //
                // Never allowed to fail the reset: the storefront reset is what
                // was asked for, and a data step that refuses is reported while
                // the reset still stands.
                if (removeData) {
                    await removeProjectSampleData(project, context, progress);
                }

                const result = await executeEdsReset(resetParams, context, tokenProvider, (p) => {
                    progress.report({ message: `Step ${p.step}/${p.totalSteps}: ${p.message}` });
                });

                await showResetResultNotifications(vscode, result, project.name, showLogsOnError);
                return result;
            },
        );
    } finally {
        project.status = originalStatus;
        await context.stateManager.saveProject(project);
    }
}

/**
 * Can this project's sample data actually be removed? Started early, awaited late.
 *
 * Answering needs a Commerce credential, and getting one is the slow part of this
 * dialog — not the HTTP call (130-230ms measured) but the IMS token behind it,
 * which `tokenManager.inspectToken` reads by spawning the whole `aio` CLI when its
 * inspection cache is cold. Kicking it off before the reset confirmation spends
 * that time against a dialog the user is already reading.
 *
 * Returns undefined when there is no pack — nothing to ask about, so nothing to
 * spend. **Never rejects**: this is held unawaited across a modal, where a
 * rejection would surface as an unhandled promise rather than as a failed reset.
 *
 * Checked BEFORE the prompt rather than during the reset. Measured live
 * 2026-08-16: this asked, ran the full ~3-minute storefront reset, and only then
 * reported "no usable Commerce credentials" — three minutes spent on a question
 * that could not be honoured. The original gate was `datapack` alone, justified by
 * "no network call in front of a modal"; that rule was really about not adding
 * failure modes, and a bounded GET that degrades silently removes one.
 */
function beginSampleDataCredentialCheck(
    project: Project,
    context: HandlerContext,
): Promise<boolean> | undefined {
    if (!project.datapack) {
        return undefined;
    }

    // Through the shared resolver, which owns the `stackBackend` mapping. This
    // site passed a raw Project through `as never`, so the dispatch matched
    // neither backend and the prompt never appeared for any project — see
    // `resolveProjectCredentials` for the three sites that made that mistake.
    return (async () => {
        const { resolveProjectCredentials } = await import(
            '@/features/data-installer/services/commerceCredentialBroker'
        );
        const credentials = await resolveProjectCredentials(context, project);
        return credentials.ok;
    })().catch(() => false);
}

/**
 * Ask whether to remove the imported sample data, when there is any to remove.
 *
 * ONE question with one action. A restore (remove, then import the same pack
 * again) was offered here for part of a day and taken out before release: it
 * roughly tripled the tail of an already three-minute operation, and it made
 * "reset" mean two different things depending on a button. Reset means what it
 * has always meant — put the storefront back, and optionally clear the data.
 *
 * Opt IN: anything other than the explicit button keeps the data. Someone
 * resetting code must not lose a catalog by pressing Escape, which is why the
 * dismissal path and the "keep" path are the same path.
 *
 * The duration is in the prompt because it is the surprising part — a six-type
 * removal was measured at 470 seconds, so a modal that says "this is quick" by
 * omission would be lying.
 */
async function confirmSampleDataRemoval(
    project: Project,
    vscode: typeof import('vscode'),
    canRemove: Promise<boolean> | undefined,
): Promise<boolean> {
    const { datapack } = project;
    if (!datapack || !canRemove) {
        return false;
    }
    if (!(await canRemove)) {
        return false;
    }

    const removeButton = 'Remove Datapack';
    // "anything you added by hand stays": pack-scoped removal confirmed by the
    // Data Installer service owner 2026-08-22 — a removal takes only what the
    // pack imported, so the reassurance is a fact, not a guess (backlog item
    // 2026-08-17-what-does-a-datapack-removal-actually-delete, now archived).
    const answer = await vscode.window.showWarningMessage(
        `Also remove the datapack this project imported (${datapack.name}@${datapack.version})? ` +
            'This deletes the data this pack imported from the Commerce instance — ' +
            'anything you added by hand stays — and can take several minutes. ' +
            'Resetting the storefront does not require it.',
        { modal: true },
        removeButton,
    );
    return answer === removeButton;
}

/**
 * Restore it — remove, then import the same pack again — reporting rather than
 * throwing.
 *
 * The storefront reset is the thing the user asked for, so no outcome here may
 * turn a good reset into a failed one. Everything is a log line.
 *
 * **Reported at three levels, because they mean different things.** A clean
 * restore says nothing. A refusal (no credentials, no pack, nothing stored) is a
 * warning. Data removed and NOT reinstalled is an ERROR: the instance is now
 * empty, which is a worse state than the user started in and the one case where
 * they must go and do something about it.
 */
async function removeProjectSampleData(
    project: Project,
    context: HandlerContext,
    progress: { report: (value: { message: string }) => void },
): Promise<void> {
    try {
        progress.report({ message: 'Removing datapack...' });

        const { removeSampleData } = await import(
            '@/features/data-installer/services/sampleDataInstall'
        );
        const { buildSampleDataDeps } = await import(
            '@/features/data-installer/services/sampleDataInstallDeps'
        );

        // The mode phrases the progress line; the poller's per-phase label comes
        // from the runner, which knows which half of a restore is running.
        const result = await removeSampleData(
            project,
            buildSampleDataDeps(
                context,
                project,
                (sd) =>
                    progress.report({
                        message: `${sd.verb} datapack (${sd.done}/${sd.total})${
                            sd.processing.length > 0 ? ` — ${sd.processing.join(', ')}` : ''
                        }`,
                    }),
                'remove',
            ),
        );

        if (result.ran && result.outcome !== 'success') {
            context.logger.error(
                `[EdsReset] Sample data was NOT removed: ${result.reason ?? 'no reason given'}`,
            );
            return;
        }
        if (!result.ran) {
            context.logger.warn(
                `[EdsReset] Sample data was not removed: ${result.reason ?? 'no reason given'}`,
            );
        }
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        context.logger.warn(`[EdsReset] Sample data removal failed, reset stands: ${reason}`);
    }
}
