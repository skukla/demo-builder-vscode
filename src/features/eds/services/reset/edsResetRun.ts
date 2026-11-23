/**
 * The one storefront reset (PL-104 fix 1): every door runs this, the window's Reset (single,
 * batch and an Edit, through `resetEdsProjectWithUI`) and the agent's `reset_project`
 * (`runEdsReset`). In order:
 * - the added-demo source check (refuses, or keeps the content and says so)
 * - listed as resetting for the whole run, which the projects list reads
 * - the pre-flight: the sign-ins, the Adobe sign-in and organization for a project carrying an
 *   Adobe org or an ACCS backend, and the AEM Code Sync app on the repository
 * - the datapack's data, when the door's caller answered Uninstall Datapack
 * - the reset's steps (`executeEdsReset`), restoring the block library and checking the CDN
 *
 * What runs, and when, is decided here. How a question is put is the door's: its `asker`. A
 * window asks the SC in a dialog; the agent has nobody to ask, so its asker refuses with the
 * reason, and the reset stops with nothing touched.
 *
 * @module features/eds/services/reset/edsResetRun
 */

import type { GitHubAppService } from '../github/githubAppService';
import type { GitHubRepoOperations } from '../github/githubRepoOperations';
import { CONTENT_KEPT_LINE } from './demoSourceCheck';
import type { MeshRedeployDeps } from './edsResetMeshHelper';
import { extractResetParams, type EdsResetParams, type EdsResetResult } from './edsResetParams';
import { findMissingApp, recordSignedInOrg, type MissingApp } from './edsResetPreflight';
import { executeEdsReset } from './edsResetService';
import {
    FailedAfterDatapack,
    removeAnsweredDatapack,
    type AnsweredDatapack,
    type DatapackRemoval,
} from './resetDatapackStep';
import { decideResetSource } from './resetSourceDecision';
import { whileRunning } from '@/core/state/projectWorkRunning';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import { resetStageLabel } from '@/core/utils/resetStages';
import type { ReportStage } from '@/core/vscode/withOperationProgress';
import { commerceBackendOf } from '@/features/data-installer/services/commerceBackend';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';
import { getMeshComponentInstance } from '@/types/typeGuards';

/**
 * How a door puts the reset's questions. Each answers null to carry on, or the result the reset
 * stops with. A window asks the SC; a door with nobody to ask refuses with the reason.
 */
export interface ResetAsker {
    /** The storefront sign-ins: DA.live, which every reset needs. */
    signIns(): Promise<EdsResetResult | null>;
    /** The Adobe sign-in, for a project carrying an Adobe org or an ACCS backend. */
    adobeSignIn(): Promise<EdsResetResult | null>;
    /** Whether the sign-in reaches the project's Adobe organization. */
    orgContext(): Promise<EdsResetResult | null>;
    /** The AEM Code Sync app is not on the repository: install it, go on without it, or stop. */
    appMissing(missing: MissingApp): Promise<EdsResetResult | null>;
    /**
     * Uninstall Datapack kept the data because nobody answered for the changes in it. A window
     * asked before the run, so its answer stands and the reset goes on; a door whose caller was
     * never asked stops, with nothing reset, so the question can be put.
     */
    changesUnanswered(removal: DatapackRemoval): Promise<EdsResetResult | null>;
}

/** What one storefront reset needs, from whichever door started it. */
export interface EdsResetRunOptions {
    project: Project;
    context: HandlerContext;
    /** Log prefix for messages (e.g., '[ProjectsBatch]' or '[Project Edit]'). */
    logPrefix?: string;
    /** ADR-015: collaborators the mesh-redeploy step needs, from the door. */
    meshDeps: MeshRedeployDeps;
    /** How this door puts the pre-flight's questions. */
    asker: ResetAsker;
    /** Where each stage is reported: the door's window, or the agent's progress line. */
    report: ReportStage;
    /** Uninstall Datapack as answered before the run (a batch's box, the agent's `removeData`). */
    answered?: AnsweredDatapack;
    /** Demo packages config for parameter extraction. Injectable for tests. */
    packages?: Parameters<typeof extractResetParams>[1];
    /** GitHub App service for the App check. Injectable for tests. */
    githubAppService?: GitHubAppService;
    /** GitHub repository reads, for the added-demo source check. Injectable for tests. */
    repoOperations?: Pick<GitHubRepoOperations, 'getRepository'>;
    /** The published-index probe for the demo's content site; defaults to global fetch. */
    fetchImpl?: typeof fetch;
}

/**
 * The pre-flight, in the order the window has always run it, under one stage: each names what
 * it is asking about rather than a stage of its own for a call that usually answers in a second.
 */
async function preflight(
    options: EdsResetRunOptions,
    repo: { repoOwner: string; repoName: string },
    logPrefix: string,
): Promise<EdsResetResult | null> {
    const { project, context, asker, report } = options;
    const checking = OPERATION_STAGES.checkingRequirements.label;

    report(checking, 'Your DA.live sign-in');
    const signIns = await asker.signIns();
    if (signIns) return signIns;

    // Any project carrying an Adobe org (a mesh IS an Adobe I/O project, so it always has one)
    // and any ACCS one: a reset never runs against the wrong org. An ACCS project with NO org
    // signs in too, and gains the org it lands in (F11).
    if (project.adobe?.organization || commerceBackendOf(project) === 'accs') {
        report(checking, 'Your Adobe sign-in');
        const adobe = await asker.adobeSignIn();
        if (adobe) return adobe;

        report(checking, 'The Adobe organization');
        await recordSignedInOrg(project, context, options.meshDeps.authManager, logPrefix);
        const org = await asker.orgContext();
        if (org) return org;
    }

    report(checking, 'The GitHub app on your repo');
    const missing = await findMissingApp(
        context,
        repo.repoOwner,
        repo.repoName,
        logPrefix,
        options.githubAppService,
    );
    return missing ? asker.appMissing(missing) : null;
}

/**
 * Reset an Edge Delivery storefront to its template, from any door.
 *
 * @returns the reset's result; a refused pre-flight answers its own result with nothing reset
 * @throws FailedAfterDatapack when the steps throw after the datapack's data was removed
 */
export async function resetEdsProject(options: EdsResetRunOptions): Promise<EdsResetResult> {
    const { project, context, logPrefix = '[EdsReset]' } = options;
    const { getGitHubServices, getDaLiveAuthService, resolveByomOverlayConfig } = await import(
        '../../handlers/edsHelpers'
    );
    const { createDaLiveServiceTokenProvider } = await import('../daLive/daLiveTokenProviders');

    // An added demo's source is checked before anything is asked (decided 2026-09-11): a reset
    // that cannot reach the demo refuses in a sentence; one that cannot reach its pages keeps
    // the content and says so, never a dialog mid-run (P5-Q8, step-07 D5).
    const source = await decideResetSource(
        project,
        () => options.repoOperations ?? getGitHubServices(context.context.secrets).repoOperations,
        context,
        options.fetchImpl,
    );
    if (source.refused) return { success: false, ...source.refused };
    const kept = source.keepContent ? { contentKept: CONTENT_KEPT_LINE } : {};

    const paramsResult = extractResetParams(project, options.packages);
    if (!paramsResult.success) {
        context.logger.error(`${logPrefix} resetEds: ${paramsResult.error}`);
        return { success: false, error: paramsResult.error, errorType: paramsResult.code };
    }
    const { repoOwner, repoName } = paramsResult.params;

    // Listed as resetting for the whole run: the projects list reads that, never this
    // in-memory status (found 2026-10-28, three resets all said "Needs reset").
    return whileRunning(project.path, 'resetting', async () => {
        const originalStatus = project.status;
        project.status = 'resetting';
        await context.stateManager.saveProject(project);
        try {
            context.logger.info(`${logPrefix} Resetting EDS project: ${repoOwner}/${repoName}`);
            const refused = await preflight(options, { repoOwner, repoName }, logPrefix);
            if (refused) return refused;

            // The block library and the CDN check are the reset's decision, not a door's
            // (PL-104 fix 1): a reset puts the storefront back as setup left it.
            const resetParams: EdsResetParams = {
                ...paramsResult.params,
                // `demoBuilder.byom.overlayUrl` wins over demo-packages.json; the helper stamps
                // `?org=&site=` for the shared multi-tenant `render-pdp` action.
                byomOverlayUrl: resolveByomOverlayConfig(
                    paramsResult.params.byomOverlayUrl,
                    paramsResult.params.daLiveOrg,
                    paramsResult.params.daLiveSite,
                ),
                includeBlockLibrary: true,
                verifyCdn: true,
                redeployMesh: Boolean(getMeshComponentInstance(project)?.path),
                ...(source.keepContent ? { keepContent: true } : {}),
            };
            return await runSteps(
                options,
                resetParams,
                kept,
                createDaLiveServiceTokenProvider(getDaLiveAuthService(context.context)),
            );
        } finally {
            project.status = originalStatus;
            await context.stateManager.saveProject(project);
        }
    });
}

/**
 * The datapack's data, then the reset's steps. The data step runs BEFORE the steps, because their
 * last pre-warms the catalog: run after, reset pre-published product pages and then deleted
 * those products (measured twice, 2026-08-17). It never fails the reset; changes nobody answered
 * are the asker's to settle (step-05 S7).
 */
async function runSteps(
    options: EdsResetRunOptions,
    resetParams: EdsResetParams,
    kept: { contentKept?: string },
    tokenProvider: Parameters<typeof executeEdsReset>[2],
): Promise<EdsResetResult> {
    const { project, context, report } = options;
    const datapackRemoval = await removeAnsweredDatapack(
        project,
        context,
        report,
        options.answered,
    );
    const unanswered = datapackRemoval?.unanswered ? await options.asker.changesUnanswered(datapackRemoval) : null;
    if (unanswered) return unanswered;

    // The steps are a fixed list, so the count rides the stage as "(4 of 12)" (PL-59).
    const steps = executeEdsReset(resetParams, context, tokenProvider, options.meshDeps, (p) => {
        const stage = resetStageLabel(p.step);
        report(stage ?? p.message, stage ? p.message : undefined, {
            index: p.step,
            total: p.totalSteps,
        });
    });
    if (!datapackRemoval) return { ...(await steps), ...kept };
    // The store was touched: whatever the reset does next, the row says what became of it.
    try {
        return { ...(await steps), ...kept, datapackRemoval };
    } catch (error) {
        throw new FailedAfterDatapack(error, datapackRemoval, kept.contentKept);
    }
}
