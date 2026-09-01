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

import { runWithAdobeTarget } from './adobeTargetStore';
import { isOrgMismatchError, orgMismatchResult } from './adobeTools';
import { requireDaLive, requireEdsProject, requireGitHub } from './edsToolGuards';
import { asText } from './mcpToolResult';
import { COMPONENT_IDS } from '@/core/constants';
import { phaseReporter } from '@/core/utils/agentPhaseChannel';
import { getDaLiveAuthService, getGitHubServices } from '@/features/eds/handlers/edsHelpers';
import { describeCdnPropagation } from '@/features/eds/services/configSyncService';
import {
    republishStorefrontConfig,
    republishStorefrontContent,
} from '@/features/eds/services/storefront/storefrontRepublishService';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';

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
            annotations: { readOnlyHint: false, destructiveHint: true },
            description: 'Regenerate and republish the EDS storefront config.json to GitHub and the CDN',
            inputSchema: {},
        },
        async () => {
            const ctx = ctxFactory();
            const eds = await requireEdsProject(ctx, 'republish');
            if (!eds.ok) return asText(eds.body);
            const { project } = eds;

            const github = await requireGitHub(ctx, ' to push config.json');
            if (github) return asText(github);

            try {
                // Run under the stored session org context so any `aio` work
                // targets the selected org via env (no global mutation).
                const result = await runWithAdobeTarget(() =>
                    republishStorefrontConfig({
                        persist: (p) => ctx.stateManager.saveProject(p),
                        project,
                        secrets: ctx.context.secrets,
                        logger: ctx.logger,
                        // The service already emits "Extracting configuration…",
                        // "Generating config.json…" and two more. Without this
                        // the tool passed no callback, so every one was computed
                        // and dropped and the chat sat silent through the whole
                        // publish. The DASHBOARD path is a different function
                        // (edsContentHandlers) — wiring that one does nothing for
                        // the agent, which is a mistake already made once here.
                        onProgress: phaseReporter(),
                    }),
                );
                return asText({
                    success: result.success,
                    githubPushed: result.githubPushed,
                    cdnPublished: result.cdnPublished,
                    cdnVerified: result.cdnVerified,
                    // The boolean alone left the caller to guess what an
                    // unverified publish meant; the ones that guessed read it as
                    // lost work. Say it outright.
                    cdnStatus: result.success
                        ? describeCdnPropagation({
                              cdnVerified: result.cdnVerified,
                              cdnError: result.cdnError,
                          })
                        : undefined,
                    error: result.error,
                });
            } catch (err) {
                if (isOrgMismatchError(err)) return orgMismatchResult();
                throw err;
            }
        },
    );

    server.registerTool(
        'sync_content',
        {
            annotations: { readOnlyHint: false, destructiveHint: true },
            description: 'Publish all EDS storefront content (config + code + DA.live pages) to the CDN',
            inputSchema: {},
        },
        async () => {
            const ctx = ctxFactory();
            const eds = await requireEdsProject(ctx, 'sync_content');
            if (!eds.ok) return asText(eds.body);
            const { project } = eds;
            const targets = edsTargets(project);
            if (!targets) {
                return asText({ error: 'Project is missing GitHub repo metadata' });
            }

            const github = await requireGitHub(ctx);
            if (github) return asText(github);
            const daLive = await requireDaLive(ctx, ' to publish content');
            if (daLive) return asText(daLive);
            const daLiveAuthService = getDaLiveAuthService(ctx.context);

            const { tokenService: githubTokenService } = getGitHubServices(ctx.context.secrets);
            try {
                const result = await runWithAdobeTarget(() =>
                    republishStorefrontContent({
                        project,
                        persist: (p) => ctx.stateManager.saveProject(p),
                        repoOwner: targets.repoOwner,
                        repoName: targets.repoName,
                        daLiveOrg: targets.daLiveOrg,
                        daLiveSite: targets.daLiveSite,
                        secrets: ctx.context.secrets,
                        logger: ctx.logger,
                        onProgress: phaseReporter(),
                        daLiveAuthService,
                        githubTokenService,
                    }),
                );
                return asText({
                    success: result.success,
                    cdnVerified: result.cdnVerified,
                    cdnStatus: result.success
                        ? describeCdnPropagation({ cdnVerified: result.cdnVerified })
                        : undefined,
                    error: result.error,
                });
            } catch (err) {
                if (isOrgMismatchError(err)) return orgMismatchResult();
                throw err;
            }
        },
    );
}
