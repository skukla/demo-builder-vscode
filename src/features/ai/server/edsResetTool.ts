/**
 * The Edge Delivery half of `reset_project` — reset an EDS storefront to its
 * template via the headless `executeEdsReset` core (the same pipeline
 * `resetEdsProjectWithUI` wraps, minus the modals/progress/status).
 *
 * The tool itself — the registration, the project lookup and the `confirm:true`
 * gate — lives in `resetProjectTool.ts`, which sends a headless project to the
 * component reset instead. This was the whole `reset_eds_project` tool until
 * 2026-10-03, when the two kinds became one tool.
 *
 * It is idempotent / re-runnable, so a failure returns `rerunSafe:true` alongside
 * the captured per-step timeline (the agent fixes the cause and re-runs the
 * identical call). Auth is pre-flighted silently — GitHub + DA.live always, Adobe
 * only when the project has a mesh to redeploy — and missing auth returns a
 * structured `needsAuth` handoff.
 */

import { runWithAdobeTarget } from './adobeTargetStore';
import { requireDaLive, requireGitHub } from './edsToolGuards';
import { asText } from './mcpToolResult';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { stepPhaseReporter } from '@/core/utils/agentPhaseChannel';
import { resetStageLabel } from '@/core/utils/resetStages';
import { stageLine } from '@/core/utils/stageLine';
import {
    getDaLiveAuthService,
    resolveByomOverlayConfig,
} from '@/features/eds/handlers/edsHelpers';
import { createDaLiveServiceTokenProvider } from '@/features/eds/services/daLive/daLiveTokenProviders';
import { extractResetParams, type EdsResetResult } from '@/features/eds/services/reset/edsResetParams';
import { executeEdsReset } from '@/features/eds/services/reset/edsResetService';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';
import { getMeshComponentInstance } from '@/types/typeGuards';

/** Silent Adobe IMS auth pre-flight. */
/**
 * The reset's caveats for the agent: what may not work on an added demo, then what the
 * content pipeline could not do (EDS-55). No key when there are none.
 */
function caveatsOf(result: Pick<EdsResetResult, 'demoCaveats' | 'pipelineWarnings'>): { caveats?: string[] } {
    const caveats = [...(result.demoCaveats ?? []), ...(result.pipelineWarnings ?? [])];
    return caveats.length > 0 ? { caveats } : {};
}

export async function adobeAuthed(): Promise<boolean> {
    try {
        return (await ServiceLocator.getAuthenticationService().getTokenManager().inspectToken())
            .valid;
    } catch {
        return false;
    }
}

/** The arguments of `reset_project` that only a storefront reset reads. */
interface EdsResetArgs {
    includeBlockLibrary?: boolean;
    verifyCdn?: boolean;
    /** The SC accepted Demo Builder's fixes for an added demo (EDS-13f). */
    applyFixes?: boolean;
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
): Promise<ReturnType<typeof asText>> {
    const paramsResult = extractResetParams(project);
    if (!paramsResult.success) {
        return asText({ error: paramsResult.error, code: paramsResult.code });
    }

    const github = await requireGitHub(ctx);
    if (github) return asText(github);
    const daLive = await requireDaLive(ctx);
    if (daLive) return asText(daLive);

    const hasMesh = Boolean(getMeshComponentInstance(project)?.path);
    if (hasMesh && !(await adobeAuthed())) {
        return asText({
            needsAuth: 'adobe',
            message:
                'Adobe sign-in required to redeploy the mesh. Check get_auth_status, then sign_in(provider:"adobe", confirm:true) once the user agrees.',
        });
    }

    const phases: Array<{ step: number; totalSteps: number; message: string }> = [];
    const sayStep = stepPhaseReporter();
    const tokenProvider = createDaLiveServiceTokenProvider(getDaLiveAuthService(ctx.context));
    try {
        // VS Code setting `demoBuilder.byom.overlayUrl` wins over
        // demo-packages.json. The helper stamps `?org=&site=` so the
        // shared multi-tenant `render-pdp` action can identify which
        // storefront's `/products/default` template to fetch.
        // Run under the stored session org context so the mesh redeploy
        // targets the selected org/workspace via env (no global mutation).
        const result = await runWithAdobeTarget(() =>
            executeEdsReset(
                {
                    ...paramsResult.params,
                    byomOverlayUrl: resolveByomOverlayConfig(
                        paramsResult.params.byomOverlayUrl,
                        paramsResult.params.daLiveOrg,
                        paramsResult.params.daLiveSite,
                    ),
                    includeBlockLibrary: args?.includeBlockLibrary ?? false,
                    verifyCdn: args?.verifyCdn ?? false,
                    applyDemoFixes: args?.applyFixes === true,
                    redeployMesh: hasMesh,
                },
                ctx,
                tokenProvider,
                {
                    commandManager: ServiceLocator.getCommandExecutor(),
                    authManager: ServiceLocator.getAuthenticationService(),
                },
                // Collected for the RESULT and reported LIVE. Reset runs
                // for minutes; the array is the agent's record afterwards,
                // the step reported live is what the user sees during the wait.
                (p) => {
                    phases.push({
                        step: p.step,
                        totalSteps: p.totalSteps,
                        message: p.message,
                    });
                    // The same step the button's modal and notification show,
                    // from the stage table: "Resetting the code (1 of 12)", once
                    // as it starts. The service's own message is the line under
                    // it, which a one-line agent surface does not have (progress
                    // vocabulary slice 8; PL-59 slice 7 before it).
                    const stage = resetStageLabel(p.step);
                    sayStep(stage ? stageLine(stage, { index: p.step, total: p.totalSteps }) : p.message);
                },
            ),
        );
        if (!result.success) {
            return asText({
                reset: false,
                project: project.name,
                stage: 'eds-reset',
                error: result.error,
                errorType: result.errorType,
                phases,
                rerunSafe: true,
            });
        }
        return asText({
            reset: true,
            project: project.name,
            kind: 'storefront',
            // What may not work on an added demo (D23), then what the content pipeline
            // could not do (EDS-55), in the words the SC sees.
            ...caveatsOf(result),
            // Applied by this reset, and fitting but left for the user to accept
            // (call again with applyFixes:true once they agree) (EDS-13f).
            ...(result.demoFixes ? { fixes: result.demoFixes } : {}),
            // Category pages and the catalog menu, re-written by the reset (EDS-24) —
            // including pages someone else made, left alone by name.
            ...(result.catalogMenu ? { categoryPages: result.catalogMenu } : {}),
            // The old catalog's product pages, removed before the new ones are made
            // (EDS-26) — or why they were left, which is never reported as clean.
            ...(result.productPages ? { productPages: result.productPages } : {}),
            // Pages still published from before that the reset did not republish
            // (EDS-33): removed, some left, or that Helix could not say, in words.
            ...(result.leftoverPages ? { leftoverPages: result.leftoverPages } : {}),
            filesReset: result.filesReset,
            contentCopied: result.contentCopied,
            meshRedeployed: result.meshRedeployed,
            phases,
        });
    } catch (err) {
        return asText({
            reset: false,
            stage: 'eds-reset',
            error: err instanceof Error ? err.message : String(err),
            phases,
            rerunSafe: true,
        });
    }
}
