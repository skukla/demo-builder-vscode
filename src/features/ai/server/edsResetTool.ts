/**
 * reset_eds_project (Phase 4) — reset an EDS storefront to its template via the
 * headless `executeEdsReset` core (the same pipeline `resetEdsProjectWithUI`
 * wraps, minus the modals/progress/status). Operates on the current project.
 *
 * Destructive: it rewrites the storefront repo + DA.live content to the template,
 * so it's gated by `confirm:true`. It is idempotent / re-runnable, so a failure
 * returns `rerunSafe:true` alongside the captured per-step timeline (the agent
 * fixes the cause and re-runs the identical call). Auth is pre-flighted silently
 * — GitHub + DA.live always, Adobe only when the project has a mesh to redeploy —
 * and missing auth returns a structured `needsAuth` handoff.
 */

import { z } from 'zod';
import { runWithAdobeTarget } from './adobeTargetStore';
import { requireDaLive, requireEdsProject, requireGitHub } from './edsToolGuards';
import { asText } from './mcpToolResult';
import type { McpToolServer } from './mcpToolServer';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { reportPhase } from '@/core/utils/agentPhaseChannel';
import {
    getDaLiveAuthService,
    resolveByomOverlayConfig,
} from '@/features/eds/handlers/edsHelpers';
import { createDaLiveServiceTokenProvider } from '@/features/eds/services/daLive/daLiveContentOperations';
import { executeEdsReset, extractResetParams } from '@/features/eds/services/reset/edsResetService';
import type { HandlerContext } from '@/types/handlers';
import { getMeshComponentInstance } from '@/types/typeGuards';

/** Silent Adobe IMS auth pre-flight. */
async function adobeAuthed(): Promise<boolean> {
    try {
        return (await ServiceLocator.getAuthenticationService().getTokenManager().inspectToken())
            .valid;
    } catch {
        return false;
    }
}

/**
 * Register the reset_eds_project tool on `server`.
 *
 * @param server     McpServer (typed `any`; see registerProjectTools docstring).
 * @param ctxFactory Builds a headless HandlerContext for each invocation.
 */
export function registerEdsResetTool(
    server: McpToolServer,
    ctxFactory: () => HandlerContext,
): void {
    server.registerTool(
        'reset_eds_project',
        {
            needsAuth: ['dalive'],
            annotations: { readOnlyHint: false, destructiveHint: true },
            description:
                'Reset an EDS storefront to its template (repo + DA.live content + config). Requires confirm:true.',
            inputSchema: {
                includeBlockLibrary: z
                    .boolean()
                    .optional()
                    .describe('Also reset the installed block library'),
                verifyCdn: z
                    .boolean()
                    .optional()
                    .describe('Verify config.json on the CDN after reset'),
                confirm: z
                    .boolean()
                    .optional()
                    .describe('Must be true — reset rewrites the storefront to its template'),
            },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
            // Resolve the target BEFORE the confirm gate, so the refusal can
            // name the project this call would reset. The pointer is re-read
            // from disk per call, but which project it names can still surprise
            // an agent (another window, another conversation, changed it) — an
            // anonymous "call again with confirm:true" gives the agent no
            // chance to notice, and the success payload was equally anonymous.
            const ctx = ctxFactory();
            const eds = await requireEdsProject(ctx, 'reset_eds_project');
            if (!eds.ok) return asText(eds.body);
            const { project } = eds;

            if (args?.confirm !== true) {
                return asText({
                    error:
                        `reset_eds_project rewrites the storefront repo and DA.live content of ` +
                        `"${project.name}" (${project.path}) to the template. Verify this is the ` +
                        `intended project, then call again with confirm:true.`,
                    project: project.name,
                    destructive: true,
                });
            }

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
                        // reportPhase is what the user sees during the wait.
                        (p) => {
                            phases.push({
                                step: p.step,
                                totalSteps: p.totalSteps,
                                message: p.message,
                            });
                            reportPhase(`${p.message} (${p.step}/${p.totalSteps})`);
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
        },
    );
}
