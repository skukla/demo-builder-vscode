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
 * `sync_content` runs the full content publish (config + code + DA.live pages →
 * Helix preview/publish) via the shared `republishStorefrontContent` service —
 * the same pipeline the dashboard's Republish button now calls — pre-flighting
 * BOTH GitHub and DA.live auth with a structured `needsAuth` handoff.
 */

import { COMPONENT_IDS } from '@/core/constants';
import { getDaLiveAuthService, getGitHubServices } from '@/features/eds/handlers/edsHelpers';
import {
    republishStorefrontConfig,
    republishStorefrontContent,
} from '@/features/eds/services/storefrontRepublishService';
import type { Project } from '@/types';
import type { HandlerContext } from '@/types/handlers';
import { isEdsProject } from '@/types/typeGuards';

/** Wrap a JSON-serializable value as an MCP text result. */
function asText(value: unknown): { content: Array<{ type: 'text'; text: string }> } {
    return { content: [{ type: 'text' as const, text: JSON.stringify(value) }] };
}

/** Pull the GitHub repo + DA.live target from an EDS project's storefront metadata. */
function edsTargets(
    project: Project,
): { repoOwner: string; repoName: string; daLiveOrg: string; daLiveSite: string } | null {
    const meta = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT]?.metadata as
        | { githubRepo?: string; daLiveOrg?: string; daLiveSite?: string }
        | undefined;
    const [repoOwner, repoName] = (meta?.githubRepo ?? '').split('/');
    if (!repoOwner || !repoName) {
        return null;
    }
    return {
        repoOwner,
        repoName,
        daLiveOrg: meta?.daLiveOrg || repoOwner,
        daLiveSite: meta?.daLiveSite || repoName,
    };
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

    server.registerTool(
        'sync_content',
        {
            description: 'Publish all EDS storefront content (config + code + DA.live pages) to the CDN',
            inputSchema: {},
        },
        async () => {
            const ctx = ctxFactory();
            const project = await ctx.stateManager.getCurrentProject();
            if (!project) {
                return asText({ error: 'No current project is open' });
            }
            if (!isEdsProject(project)) {
                return asText({ error: 'sync_content applies only to EDS storefront projects' });
            }
            const targets = edsTargets(project);
            if (!targets) {
                return asText({ error: 'Project is missing GitHub repo metadata' });
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
                        'DA.live sign-in required to publish content. Check get_auth_status, then sign_in(provider:"dalive", confirm:true) once the user agrees.',
                });
            }

            const { tokenService: githubTokenService } = getGitHubServices(ctx);
            const result = await republishStorefrontContent({
                project,
                repoOwner: targets.repoOwner,
                repoName: targets.repoName,
                daLiveOrg: targets.daLiveOrg,
                daLiveSite: targets.daLiveSite,
                secrets: ctx.context.secrets,
                logger: ctx.logger,
                daLiveAuthService,
                githubTokenService,
            });
            return asText({ success: result.success, cdnVerified: result.cdnVerified, error: result.error });
        },
    );
}
