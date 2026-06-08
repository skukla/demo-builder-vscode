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
import { ServiceLocator } from '@/core/di';
import { getDaLiveAuthService, getGitHubServices, resolveByomOverlayUrl } from '@/features/eds/handlers/edsHelpers';
import { createDaLiveServiceTokenProvider } from '@/features/eds/services/daLiveContentOperations';
import { executeEdsReset, extractResetParams } from '@/features/eds/services/edsResetService';
import type { HandlerContext } from '@/types/handlers';
import { getMeshComponentInstance, isEdsProject } from '@/types/typeGuards';

/** Wrap a JSON-serializable value as an MCP text result. */
function asText(value: unknown): { content: Array<{ type: 'text'; text: string }> } {
    return { content: [{ type: 'text' as const, text: JSON.stringify(value) }] };
}

/** Silent Adobe IMS auth pre-flight. */
async function adobeAuthed(): Promise<boolean> {
    try {
        return (await ServiceLocator.getAuthenticationService().getTokenManager().inspectToken()).valid;
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    server: any,
    ctxFactory: () => HandlerContext,
): void {
    server.registerTool(
        'reset_eds_project',
        {
            description: 'Reset an EDS storefront to its template (repo + DA.live content + config). Requires confirm:true.',
            inputSchema: {
                includeBlockLibrary: z.boolean().optional().describe('Also reset the installed block library'),
                verifyCdn: z.boolean().optional().describe('Verify config.json on the CDN after reset'),
                confirm: z.boolean().optional().describe('Must be true — reset rewrites the storefront to its template'),
            },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
            if (args?.confirm !== true) {
                return asText({
                    error: 'reset_eds_project rewrites the storefront repo and DA.live content to the template. Call again with confirm:true.',
                    destructive: true,
                });
            }

            const ctx = ctxFactory();
            const project = await ctx.stateManager.getCurrentProject();
            if (!project) {
                return asText({ error: 'No current project is open' });
            }
            if (!isEdsProject(project)) {
                return asText({ error: 'reset_eds_project applies only to EDS storefront projects' });
            }

            const paramsResult = extractResetParams(project);
            if (!paramsResult.success) {
                return asText({ error: paramsResult.error, code: paramsResult.code });
            }

            let githubOk = false;
            try {
                githubOk = (await getGitHubServices(ctx).tokenService.validateToken()).valid;
            } catch {
                githubOk = false;
            }
            if (!githubOk) {
                return asText({
                    needsAuth: 'github',
                    message:
                        'GitHub sign-in required. Check get_auth_status, then sign_in(provider:"github", confirm:true) once the user agrees.',
                });
            }

            const daLiveAuthService = getDaLiveAuthService(ctx.context);
            if (!(await daLiveAuthService.isAuthenticated())) {
                return asText({
                    needsAuth: 'dalive',
                    message:
                        'DA.live sign-in required. Check get_auth_status, then sign_in(provider:"dalive", confirm:true) once the user agrees.',
                });
            }

            const hasMesh = Boolean(getMeshComponentInstance(project)?.path);
            if (hasMesh && !(await adobeAuthed())) {
                return asText({
                    needsAuth: 'adobe',
                    message:
                        'Adobe sign-in required to redeploy the mesh. Check get_auth_status, then sign_in(provider:"adobe", confirm:true) once the user agrees.',
                });
            }

            const phases: Array<{ step: number; totalSteps: number; message: string }> = [];
            const tokenProvider = createDaLiveServiceTokenProvider(daLiveAuthService);
            try {
                const result = await executeEdsReset(
                    {
                        ...paramsResult.params,
                        // VS Code setting wins over demo-packages.json baked value.
                        byomOverlayUrl: resolveByomOverlayUrl(paramsResult.params.byomOverlayUrl),
                        includeBlockLibrary: args?.includeBlockLibrary ?? false,
                        verifyCdn: args?.verifyCdn ?? false,
                        redeployMesh: hasMesh,
                    },
                    ctx,
                    tokenProvider,
                    (p) => phases.push({ step: p.step, totalSteps: p.totalSteps, message: p.message }),
                );
                if (!result.success) {
                    return asText({
                        reset: false,
                        stage: 'eds-reset',
                        error: result.error,
                        errorType: result.errorType,
                        phases,
                        rerunSafe: true,
                    });
                }
                return asText({
                    reset: true,
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
