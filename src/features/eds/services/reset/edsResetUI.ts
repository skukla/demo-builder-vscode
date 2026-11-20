/**
 * The window's storefront reset: the one reset (`resetEdsProject`), asking its questions in
 * dialogs inside the caller's window (the sign-ins, Switch IMS Org, Install the AEM Code Sync App).
 *
 * Callers: the projects batch run (`projectsBatchHandlers.ts`, answered, every screen's Reset)
 * and Edit (`executorEditPackage.ts`). Both asked their questions before anything ran and
 * report the outcome themselves, so this shows no result of its own. The agent's door is
 * `runEdsReset`, which runs the same reset with an asker that refuses instead (PL-104 fix 1).
 *
 * @module features/eds/services/reset/edsResetUI
 */

import type { GitHubAppService } from '../github/githubAppService';
import type { GitHubRepoOperations } from '../github/githubRepoOperations';
import type { MeshRedeployDeps } from './edsResetMeshHelper';
import type { EdsResetResult, extractResetParams } from './edsResetParams';
import { askToInstallApp, checkAdobeAuth, checkDaLiveAuth, checkOrgContext } from './edsResetPreflight';
import { resetEdsProject, type ResetAsker } from './edsResetRun';
import type { AnsweredDatapack } from './resetDatapackStep';
import type { ReportStage } from '@/core/vscode/withOperationProgress';
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
 * shape. They are variants, not duplicates — this one carries EDS-only
 * fields the generic reset must not have — but two exported types sharing a
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
 * The window's way of asking: each pre-flight question as a dialog, the project's status put back
 * before a refusal returns. The changes in a datapack were answered before the run, so a removal
 * that kept them carries on and the row says so.
 */
async function windowAsker(options: EdsResetWithUIOptions, logPrefix: string): Promise<ResetAsker> {
    const { project, context } = options;
    const vscode = await import('vscode');
    const originalStatus = project.status;
    const authManager = options.meshDeps.authManager;
    return {
        signIns: () => checkDaLiveAuth(context, project, originalStatus, logPrefix),
        adobeSignIn: () => checkAdobeAuth(project, context, originalStatus, logPrefix, authManager),
        orgContext: () => checkOrgContext(project, context, originalStatus, logPrefix, authManager),
        appMissing: (missing) => askToInstallApp(vscode, context, project, originalStatus, logPrefix, missing),
        changesUnanswered: async () => null,
    };
}

/**
 * Reset an EDS project inside the caller's window, through the one reset (`resetEdsProject`).
 *
 * @param options - Reset options
 * @returns Reset result
 */
export async function resetEdsProjectWithUI(options: EdsResetWithUIOptions): Promise<EdsResetResult> {
    const logPrefix = options.logPrefix ?? '[EdsReset]';
    return resetEdsProject({
        project: options.project,
        context: options.context,
        logPrefix,
        meshDeps: options.meshDeps,
        asker: await windowAsker(options, logPrefix),
        report: options.withinEdit.report,
        answered: options.answered,
        packages: options.packages,
        githubAppService: options.githubAppService,
        repoOperations: options.repoOperations,
        fetchImpl: options.fetchImpl,
    });
}
