/**
 * Storefront action tools (Phase 4) — EDS storefront operations as headless
 * adapters over existing services.
 *
 * `republish` regenerates and pushes the storefront's config.json to GitHub and
 * the Helix CDN via `republishStorefrontConfig` — the headless core the
 * dashboard's "Republish" button wraps (the button additionally pops DA.live
 * auth + progress modals, which we skip). It operates on the current project,
 * pre-flights GitHub auth with a structured `needsAuth` handoff, and is
 * idempotent (safe to re-run), so it needs no confirm gate — same class as the
 * existing `sync_storefront` tool.
 *
 * Note: this republishes the storefront CONFIG, not DA.live page content. A full
 * content publish (Helix preview+publish of DA.live pages) is a separate tool.
 */

import { getGitHubServices } from '@/features/eds/handlers/edsHelpers';
import { republishStorefrontConfig } from '@/features/eds/services/storefrontRepublishService';
import type { HandlerContext } from '@/types/handlers';
import { isEdsProject } from '@/types/typeGuards';

/** Wrap a JSON-serializable value as an MCP text result. */
function asText(value: unknown): { content: Array<{ type: 'text'; text: string }> } {
    return { content: [{ type: 'text' as const, text: JSON.stringify(value) }] };
}

/**
 * Register the storefront action tools on `server`.
 *
 * @param server     McpServer (typed `any`; see registerProjectTools docstring).
 * @param ctxFactory Builds a headless HandlerContext for each invocation.
 */
export function registerStorefrontTools(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    server: any,
    ctxFactory: () => HandlerContext,
): void {
    server.registerTool(
        'republish',
        {
            description: 'Regenerate and republish the EDS storefront config.json to GitHub and the CDN',
            inputSchema: {},
        },
        async () => {
            const ctx = ctxFactory();
            const project = await ctx.stateManager.getCurrentProject();
            if (!project) {
                return asText({ error: 'No current project is open' });
            }
            if (!isEdsProject(project)) {
                return asText({ error: 'republish applies only to EDS storefront projects' });
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
                        'GitHub sign-in required to push config.json. Check get_auth_status, then sign_in(provider:"github", confirm:true) once the user agrees.',
                });
            }

            const result = await republishStorefrontConfig({
                project,
                secrets: ctx.context.secrets,
                logger: ctx.logger,
            });
            return asText({
                success: result.success,
                githubPushed: result.githubPushed,
                cdnPublished: result.cdnPublished,
                cdnVerified: result.cdnVerified,
                error: result.error,
            });
        },
    );
}
