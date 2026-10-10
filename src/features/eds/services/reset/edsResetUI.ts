/**
 * EDS Reset UI Orchestration
 *
 * The full reset flow with user-facing UI elements, in order:
 * - the added-demo source check (refuses, or offers to keep the content)
 * - the confirmation dialog, and the separate sample-data question
 * - the progress window, with the pre-flight checks inside it
 * - the reset itself (executeEdsReset), then the result notifications
 *
 * The pieces live beside it: the pre-flight checks in `edsResetPreflight`, the
 * sample-data step in `edsResetSampleData`, the result notifications in
 * `edsResetNotifications` (EDS-8, 2026-10-08).
 *
 * Both dashboard and projects-dashboard handlers use resetEdsProjectWithUI()
 * as the single entry point for resetting EDS projects with UI.
 *
 * @module features/eds/services/reset/edsResetUI
 */

import type { GitHubAppService } from '../github/githubAppService';
import type { GitHubRepoOperations } from '../github/githubRepoOperations';
import { checkDemoSource, type DemoSourceCheck } from './demoSourceCheck';
import type { MeshRedeployDeps } from './edsResetMeshHelper';
import { showResetResultNotifications } from './edsResetNotifications';
import {
    extractResetParams,
    type EdsResetParams,
    type EdsResetResult,
} from './edsResetParams';
import {
    checkAdobeAuth,
    checkDaLiveAuth,
    checkGitHubAppInstallation,
    checkOrgContext,
} from './edsResetPreflight';
import {
    beginSampleDataCredentialCheck,
    confirmSampleDataRemoval,
    removeProjectSampleData,
} from './edsResetSampleData';
import { executeEdsReset } from './edsResetService';
import { resetOperationId } from '@/core/utils/operationIds';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import { withOperationProgress } from '@/core/vscode/withOperationProgress';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';

// ==========================================================
// Types
// ==========================================================

/**
 * Options for the full EDS reset UI flow.
 *
 * RENAMED 2026-08-28: this was `ResetWithUIOptions`, the same name the generic
 * reset in `lifecycle/services/projectResetService.ts` uses for a DIFFERENT
 * shape. They are variants, not duplicates — this one carries five EDS-only
 * toggles the generic reset must not have — but two exported types sharing a
 * name across modules is a trap: importing the wrong one typechecks wherever
 * the fields happen to overlap.
 */
export interface EdsResetWithUIOptions {
    /** Project to reset */
    project: Project;
    /** Handler context */
    context: HandlerContext;
    /** Log prefix for messages (e.g., '[Dashboard]' or '[ProjectsList]') */
    logPrefix?: string;
    /** ADR-015: collaborators the mesh-redeploy step needs, from the handler. */
    meshDeps: MeshRedeployDeps;
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
    /**
     * GitHub App service. Injectable for tests; defaults to one built from the
     * context's GitHub and DA.live credentials inside the App check.
     *
     * The check reaches it through `await import(...)`, which is precisely why the
     * six suites in this family could only supply one by mocking the module —
     * ADR-016's wall. A dynamic import has no seam unless the caller offers one.
     */
    githubAppService?: GitHubAppService;
    /** Started from a screen that hosts the progress modal (PL-59 R1). */
    progress?: 'modal';
    /** The id that screen named the operation by, so its modal follows this run. */
    operationId?: string;
    /**
     * GitHub repository reads, for the added-demo source check. Injectable for
     * tests; defaults to the cached services built from the context's secrets.
     */
    repoOperations?: Pick<GitHubRepoOperations, 'getRepository'>;
    /** The published-index probe for the demo's content site; defaults to global fetch. */
    fetchImpl?: typeof fetch;
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
export async function resetEdsProjectWithUI(options: EdsResetWithUIOptions): Promise<EdsResetResult> {
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
    const { getDaLiveAuthService, resolveByomOverlayConfig } = await import('../../handlers/edsHelpers'
    );
    const { createDaLiveServiceTokenProvider } = await import('../daLive/daLiveTokenProviders');
    const { getMeshComponentInstance } = await import('@/types/typeGuards');

    // An added demo's source is checked BEFORE the first modal (decided 2026-09-11):
    // a reset that cannot reach the demo refuses in a sentence here rather than
    // failing midway with git output. A renamed repository is followed silently.
    let keepContent = false;
    if (project.demo) {
        const { getGitHubServices } = await import('../../handlers/edsHelpers');
        const sourceCheck = await checkDemoSource(
            project,
            options.repoOperations ?? getGitHubServices(context.context.secrets).repoOperations,
            context,
            options.fetchImpl,
        );
        if (!sourceCheck.reachable) {
            context.logger.warn(`${logPrefix} resetEds: ${sourceCheck.message}`);
            void vscode.window.showWarningMessage(sourceCheck.message);
            return { success: false, error: sourceCheck.message, errorType: 'DEMO_SOURCE_UNREACHABLE' };
        }
        if (!sourceCheck.contentReachable) {
            const keep = await offerToKeepContent(vscode, project.demo.name, sourceCheck);
            if (keep === undefined) {
                context.logger.info(`${logPrefix} resetEds: User cancelled reset (content site unreachable)`);
                return { success: false, cancelled: true };
            }
            keepContent = keep;
        }
    }

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
        return await withOperationProgress(
            {
                id: options.operationId ?? resetOperationId(project.name),
                title: `Resetting ${project.name}`,
                inModal: options.progress === 'modal',
            },
            async (report) => {
                context.logger.info(`${logPrefix} Resetting EDS project: ${repoFullName}`);

                // Four pre-flight checks under one stage: each names what it is
                // asking about, rather than a stage of its own for a call that
                // usually answers in under a second.
                report(OPERATION_STAGES.checkingRequirements.label, 'Your DA.live sign-in');
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
                    report(OPERATION_STAGES.checkingRequirements.label, 'Your Adobe sign-in');
                    const adobeResult = await checkAdobeAuth(
                        project,
                        context,
                        originalStatus,
                        logPrefix,
                        options.meshDeps.authManager,
                    );
                    if (adobeResult) return adobeResult;

                    report(OPERATION_STAGES.checkingRequirements.label, 'The Adobe organization');
                    const orgResult = await checkOrgContext(
                        project,
                        context,
                        originalStatus,
                        logPrefix,
                        options.meshDeps.authManager,
                    );
                    if (orgResult) return orgResult;
                }

                report(OPERATION_STAGES.checkingRequirements.label, 'The GitHub app on your repo');
                const appResult = await checkGitHubAppInstallation(
                    vscode,
                    context,
                    repoOwner,
                    repoName,
                    project,
                    originalStatus,
                    logPrefix,
                    options.githubAppService,
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
                    ...(keepContent ? { keepContent } : {}),
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
                    await removeProjectSampleData(project, context, report);
                }

                // The reset's steps are a fixed list, so the count is known up
                // front and rides the stage as "(4 of 12)" — the one shape a count
                // is allowed to take (PL-59 wording rules).
                const result = await executeEdsReset(resetParams, context, tokenProvider, options.meshDeps, (p) => {
                    report(p.message, undefined, { index: p.step, total: p.totalSteps });
                });

                await showResetResultNotifications(
                    vscode,
                    result,
                    project.name,
                    showLogsOnError,
                    options.progress === 'modal',
                );
                return result;
            },
        );
    } finally {
        project.status = originalStatus;
        await context.stateManager.saveProject(project);
    }
}

/**
 * The demo's content site cannot be reached: reset the code only and keep the
 * current content, or stop. Content is not forkable, so there is nothing else
 * to offer. Undefined = cancelled.
 */
async function offerToKeepContent(
    vscode: typeof import('vscode'),
    demoName: string,
    check: DemoSourceCheck,
): Promise<boolean | undefined> {
    const keepButton: import('vscode').MessageItem = { title: 'Keep current content' };
    const answer = await vscode.window.showWarningMessage(
        `${check.contentMessage ?? `The ${demoName} demo's pages can't be reached right now.`} ` +
            'You can reset the code and keep the content this site has now.',
        { modal: true },
        keepButton,
    );
    return answer?.title === keepButton.title ? true : undefined;
}
