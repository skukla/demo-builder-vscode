/**
 * EDS Reset UI Orchestration
 *
 * A storefront reset run inside a caller's own window, in order:
 * - the added-demo source check (refuses, or offers to keep the content)
 * - the pre-flight checks, told to the caller's `report`
 * - the reset itself (executeEdsReset)
 *
 * The pieces live beside it: the pre-flight checks in `edsResetPreflight`, the
 * sample-data step in `edsResetSampleData` (EDS-8, 2026-10-08).
 *
 * Callers: the projects batch run (`projectsBatchHandlers.ts`, answered, every screen's Reset)
 * and Edit (`executorEditPackage.ts`). Both asked their questions before anything ran and
 * report the outcome themselves, so this asks none and shows no result of its own.
 *
 * @module features/eds/services/reset/edsResetUI
 */

import type { GitHubAppService } from '../github/githubAppService';
import type { GitHubRepoOperations } from '../github/githubRepoOperations';
import { checkDemoSource, offerToKeepContent } from './demoSourceCheck';
import type { MeshRedeployDeps } from './edsResetMeshHelper';
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
    recordSignedInOrg,
} from './edsResetPreflight';
import { executeEdsReset } from './edsResetService';
import { FailedAfterDatapack, removeAnsweredDatapack, type AnsweredDatapack } from './resetDatapackStep';
import { whileRunning } from '@/core/state/projectWorkRunning';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import { resetStageLabel } from '@/core/utils/resetStages';
import type { ReportStage } from '@/core/vscode/withOperationProgress';
import { commerceBackendOf } from '@/features/data-installer/services/commerceBackend';
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
    /**
     * The caller's window, which this run reports into: an Edit's Finish (PL-75), which shows
     * progress on the wizard's own screen, or a batch's one window. Either asked its questions,
     * this reset's included, before anything ran, and reports the outcome itself.
     */
    withinEdit: { report: ReportStage };
    /**
     * A reset of several projects at once (the projects list's Reset Selected, owner 2026-11-04):
     * the batch asked its questions before anything ran, so none is asked here, and it reports
     * through `withinEdit.report` into the batch's one window. `removeDatapack` is the batch's
     * Uninstall Datapack; `changes` answers a pack that is not the SC's (a name, or `drop`).
     * Absent (an Edit), no data is removed: the Edit's datapack step owns the data. A removal that
     * ran comes back as the result's `datapackRemoval`, or on the `FailedAfterDatapack` a reset
     * that throws after it throws, for the batch row to say what became of the store.
     */
    answered?: AnsweredDatapack;
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
 * Reset an EDS project inside the caller's window:
 * 1. The added-demo source check
 * 2. Parameter extraction and validation
 * 3. Auth checks (DA.live, Adobe I/O when the project carries an org)
 * 4. GitHub App check
 * 5. The datapack's data, when a batch answered Uninstall Datapack
 * 6. Actual reset via executeEdsReset
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

    // No reset offers Clear Demo Data (owner, 2026-11-12): it is its own command on the Datapacks screen.

    // Listed as resetting for the whole run: the projects list reads that, never
    // this in-memory status (found 2026-10-28, three resets all said "Needs reset").
    return whileRunning(project.path, 'resetting', async () => {
        const originalStatus = project.status;
        project.status = 'resetting';
        await context.stateManager.saveProject(project);

        try {
            const report = options.withinEdit.report;
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
            // "Switch IMS Org" prompt, mirroring DeployMeshCommand. An ACCS project
            // with NO org signs in too, and gains the org it lands in (F11).
            const accs = commerceBackendOf(project) === 'accs';
            if (project.adobe?.organization || accs) {
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
                await recordSignedInOrg(project, context, options.meshDeps.authManager, logPrefix);
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
            // A batch answered the changes already; asking here would stop it mid-run. Only when
            // it answered Uninstall Datapack, gated on the recorded pack rather than on asking the
            // service what is installed; the removal itself reports when there was nothing there.
            const datapackRemoval = await removeAnsweredDatapack(project, context, report, options.answered);

            // The reset's steps are a fixed list, so the count is known up
            // front and rides the stage as "(4 of 12)" — the one shape a count
            // is allowed to take (PL-59 wording rules).
            const steps = executeEdsReset(resetParams, context, tokenProvider, options.meshDeps, (p) => {
                const stage = resetStageLabel(p.step);
                report(stage ?? p.message, stage ? p.message : undefined, { index: p.step, total: p.totalSteps });
            });
            if (!datapackRemoval) return await steps;
            // The store was touched: whatever the reset does next, the row says what became of it.
            try {
                return { ...(await steps), datapackRemoval };
            } catch (error) {
                throw new FailedAfterDatapack(error, datapackRemoval);
            }
        } finally {
            project.status = originalStatus;
            await context.stateManager.saveProject(project);
        }
    });
}
