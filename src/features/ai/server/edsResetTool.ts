/**
 * The Edge Delivery half of `reset_project`: the one storefront reset (`resetEdsProject`) the
 * window's Reset runs, with an asker for a door that has nobody to ask (PL-104 fix 1). Each
 * question the window would put in a dialog is a refusal here, naming what to do, and the reset
 * stops with nothing touched: a missing sign-in is a `needsAuth` handoff, the wrong Adobe
 * organization is ORG_MISMATCH, a missing AEM Code Sync app answers the install link, and changes
 * in a datapack nobody answered for answer CHANGES_NEED_ANSWER.
 *
 * The tool itself — the registration, the project lookup and the `confirm:true`
 * gate — lives in `resetProjectTool.ts`, which sends a headless project to the
 * component reset instead. This was the whole `reset_eds_project` tool until
 * 2026-10-03, when the two kinds became one tool.
 *
 * It is idempotent / re-runnable, so a failure returns `rerunSafe:true` alongside
 * the captured per-step timeline (the agent fixes the cause and re-runs the
 * identical call).
 */

import { runWithAdobeTarget } from './adobeTargetStore';
import { orgMismatchResult } from './adobeTools';
import { answeredOf, changesNeedAnswer, datapackAnswer, type DatapackAnswerArgs } from './datapackAnswerArgs';
import { requireDaLive, requireGitHub } from './edsToolGuards';
import { asText } from './mcpToolResult';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { stepPhaseReporter } from '@/core/utils/agentPhaseChannel';
import { stageLine } from '@/core/utils/stageLine';
import type { ReportStage } from '@/core/vscode/withOperationProgress';
import { detectProjectOrgMismatch } from '@/features/authentication/services/detectProjectOrgMismatch';
import { resetCaveats, type EdsResetResult } from '@/features/eds/services/reset/edsResetParams';
import type { MissingApp } from '@/features/eds/services/reset/edsResetPreflight';
import { resetEdsProject, type ResetAsker } from '@/features/eds/services/reset/edsResetRun';
import { restoredSentence } from '@/features/eds/services/reset/importedProjectReset';
import { FailedAfterDatapack } from '@/features/eds/services/reset/resetDatapackStep';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';

type ToolResult = ReturnType<typeof asText>;

/**
 * The reset's caveats for the agent, in the words and order the SC reads them (`resetCaveats`, which
 * a batch row's warnings read too), less content kept on purpose (`noteOf`). No key when there are none.
 */
function caveatsOf(result: EdsResetResult): { caveats?: string[] } {
    const caveats = resetCaveats(result);
    return caveats.length > 0 ? { caveats } : {};
}

/** What the reset restored, for an imported project; no key for any other. */
function restoredOf(project: Project): { restored?: string } {
    const restored = restoredSentence(project);
    return restored ? { restored } : {};
}

/** Content kept on purpose (the demo's pages could not be reached), as the agent's `note`; no key without it. */
function noteOf(contentKept: string | undefined): { note?: string } {
    return contentKept ? { note: contentKept } : {};
}

/** Silent Adobe IMS auth pre-flight. */
export async function adobeAuthed(): Promise<boolean> {
    try {
        return (await ServiceLocator.getAuthenticationService().getTokenManager().inspectToken())
            .valid;
    } catch {
        return false;
    }
}

/** The arguments of `reset_project` a storefront reset reads: Uninstall Datapack and its answers. */
type EdsResetArgs = DatapackAnswerArgs;

/** One reset step as the agent's record keeps it. */
interface Phase {
    step: number;
    totalSteps: number;
    message: string;
}

/** The refusal an asker answered with, kept for the tool's answer. */
interface Refusal {
    result?: ToolResult;
}

/** The AEM Code Sync app is missing: the refusal, with the link to give the user. */
function appMissingAnswer(project: Project, missing: MissingApp): ToolResult {
    const repo = `${missing.repoOwner}/${missing.repoName}`;
    return asText({
        reset: false,
        project: project.name,
        errorType: 'APP_NOT_INSTALLED',
        error:
            `The AEM Code Sync GitHub App is not installed on ${repo}, so code changes would not reach the ` +
            'site. Give the user installUrl to install it, then reset again.',
        installUrl: missing.installUrl,
    });
}

/**
 * The asker for a door with nobody to ask: every question the window would put in a dialog is a
 * refusal, kept in `refusal` for the tool's answer.
 */
function agentAsker(ctx: HandlerContext, project: Project, refusal: Refusal): ResetAsker {
    const refuse = (result: ToolResult): EdsResetResult => {
        refusal.result = result;
        return { success: false, cancelled: true };
    };
    return {
        signIns: async () => {
            const needs = (await requireGitHub(ctx)) ?? (await requireDaLive(ctx));
            return needs ? refuse(asText(needs)) : null;
        },
        adobeSignIn: async () =>
            (await adobeAuthed())
                ? null
                : refuse(
                      asText({
                          needsAuth: 'adobe',
                          message:
                              'Adobe sign-in required to reset this project. Check get_auth_status, then sign_in(provider:"adobe", confirm:true) once the user agrees.',
                      }),
                  ),
        orgContext: async () => {
            const org = await detectProjectOrgMismatch(ServiceLocator.getAuthenticationService(), project, ctx.logger);
            return org && !org.reachable ? refuse(orgMismatchResult()) : null;
        },
        appMissing: async (missing) => refuse(appMissingAnswer(project, missing)),
        changesUnanswered: async (removal) =>
            refuse(asText({ reset: false, project: project.name, ...changesNeedAnswer(removal.kept ?? '', 'reset') })),
    };
}

/** Each stage said once, as it starts; each numbered step kept for the answer's timeline too. */
function agentReport(phases: Phase[]): ReportStage {
    const sayStep = stepPhaseReporter();
    return (stage, detail, position) => {
        if (position) phases.push({ step: position.index, totalSteps: position.total, message: detail ?? stage });
        sayStep(stageLine(stage, position));
    };
}

/** What a finished reset answers: what it did and could not do, in the words the SC reads. */
function finishedAnswer(project: Project, result: EdsResetResult, datapack: { datapack?: string }, phases: Phase[]) {
    if (!result.success) {
        return asText({
            reset: false,
            project: project.name,
            stage: 'eds-reset',
            error: result.error,
            errorType: result.errorType,
            ...datapack,
            phases,
            rerunSafe: true,
        });
    }
    return asText({
        reset: true,
        project: project.name,
        kind: 'storefront',
        // What the reset could not do, in the words the SC sees; content kept on purpose is the
        // note, not a caveat, as the batch row and the Edit say it (owner walk Q6).
        ...caveatsOf({ ...result, contentKept: undefined }),
        ...noteOf(result.contentKept),
        // An imported project goes back to its import (EDS-72 decision 1): said in words.
        ...restoredOf(project),
        // What became of the datapack, when the call asked to uninstall it.
        ...datapack,
        // Category pages and the catalog menu, re-written by the reset (EDS-24).
        ...(result.catalogMenu ? { categoryPages: result.catalogMenu } : {}),
        // The old catalog's product pages, removed before the new ones are made (EDS-26).
        ...(result.productPages ? { productPages: result.productPages } : {}),
        // Links in the freshly copied content to pages that do not exist (EDS-64).
        ...(result.brokenLinks ? { brokenLinks: result.brokenLinks } : {}),
        // Pages still published from before that the reset did not republish (EDS-33).
        ...(result.leftoverPages ? { leftoverPages: result.leftoverPages } : {}),
        filesReset: result.filesReset,
        contentCopied: result.contentCopied,
        meshRedeployed: result.meshRedeployed,
        phases,
    });
}

/**
 * The Edge Delivery half of `reset_project`, after the caller has resolved the
 * project and taken consent.
 *
 * @param ctx     Headless HandlerContext for this call.
 * @param project The current project, already known to be an EDS storefront.
 * @param args    The tool's arguments.
 * @returns the tool result
 */
export async function runEdsReset(
    ctx: HandlerContext,
    project: Project,
    args: EdsResetArgs | undefined,
): Promise<ToolResult> {
    const phases: Phase[] = [];
    const refusal: Refusal = {};
    const answered = answeredOf(args);
    try {
        // Run under the stored session org context, so the mesh redeploy targets the selected
        // org and workspace through env (no global mutation).
        const result = await runWithAdobeTarget(() =>
            resetEdsProject({
                project,
                context: ctx,
                logPrefix: '[MCP reset_project]',
                meshDeps: {
                    commandManager: ServiceLocator.getCommandExecutor(),
                    authManager: ServiceLocator.getAuthenticationService(),
                },
                asker: agentAsker(ctx, project, refusal),
                report: agentReport(phases),
                answered,
            }),
        );
        if (refusal.result) return refusal.result;
        return finishedAnswer(project, result, await datapackAnswer(project, answered, result.datapackRemoval), phases);
    } catch (err) {
        const removal = err instanceof FailedAfterDatapack ? err.removal : undefined;
        return asText({
            reset: false,
            stage: 'eds-reset',
            error: err instanceof Error ? err.message : String(err),
            ...(await datapackAnswer(project, answered, removal)),
            phases,
            rerunSafe: true,
        });
    }
}
