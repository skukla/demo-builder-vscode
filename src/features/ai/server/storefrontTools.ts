/**
 * Storefront action tools (Phase 4) — EDS storefront operations as headless
 * adapters over existing services.
 *
 * `republish` is the dashboard's Republish button, for an agent: the same
 * `republishStorefrontContent` the button runs (settings, code and every DA.live
 * page, then the category pages, and the new store's pages after a store change),
 * with the button's result. It operates on the current project, pre-flights GitHub
 * and DA.live auth with a structured `needsAuth` handoff, and is idempotent — but it
 * OVERWRITES what visitors are currently served, so it carries a confirm gate.
 *
 * Until 2026-10-23 (EDS-63) this tool republished config.json alone, and the button's
 * job was reachable by an agent only as `sync_content`. Republishing JustRite's code
 * after a reset was the button's job; the tool by that name would have sent the
 * settings file and reported success. One name, one job now; `sync_content` is gone.
 *
 * It is NOT the same class as `sync_storefront`: that tool does git add, commit and
 * push, which is additive — a commit replaces nothing. Idempotence argues that
 * RETRYING is safe; it does not argue that starting is, because the first run is the
 * one that replaces the live content. (Reinvestigated 2026-09-02; see
 * .rptc/handoff/2026-09-02-destructive-tools-reinvestigation.md.)
 */

import { z } from 'zod';
import { runWithAdobeTarget } from './adobeTargetStore';
import { isOrgMismatchError, orgMismatchResult } from './adobeTools';
import { requireDaLive, requireEdsProject, requireGitHub } from './edsToolGuards';
import { asText } from './mcpToolResult';
import type { McpToolServer } from './mcpToolServer';
import { COMPONENT_IDS } from '@/core/constants';
import { stepPhaseReporter } from '@/core/utils/agentPhaseChannel';
import { getDaLiveAuthService, getGitHubServices } from '@/features/eds/handlers/edsHelpers';
import { describeCdnPropagation } from '@/features/eds/services/configSyncService';
import { republishStorefrontContent } from '@/features/eds/services/storefront/storefrontContentRepublishService';
import { readStorefrontReport, storefrontReportLines } from '@/features/eds/services/storefront/storefrontReport';
import { createStorefrontReportDeps } from '@/features/eds/services/storefront/storefrontReportDeps';
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
    server: McpToolServer,
    ctxFactory: () => HandlerContext,
): void {
    server.registerTool(
        'republish',
        {
            needsAuth: ['github', 'dalive'],
            annotations: { readOnlyHint: false, destructiveHint: true },
            description:
                "Republish this project's EDS storefront to the CDN, as the dashboard's Republish " +
                'button does: its settings (config.json), its code and every DA.live page, then the ' +
                'category pages, replacing what visitors are currently served. When the store changed ' +
                "since the last publish, it also replaces the product and category pages with the new " +
                "store's and answers storePages. Requires confirm:true. (Not sync_storefront, which " +
                'commits and pushes the storefront code and publishes only the home page.)',
            inputSchema: {
                confirm: z.boolean().optional().describe('Must be true to proceed'),
            },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
            const ctx = ctxFactory();
            const eds = await requireEdsProject(ctx, 'republish');
            if (!eds.ok) return asText(eds.body);
            const { project } = eds;
            const targets = edsTargets(project);
            if (!targets) {
                return asText({ error: 'Project is missing GitHub repo metadata' });
            }

            // Gated BEFORE the credential checks, so the refusal explains itself without
            // first demanding a sign-in. It names the storefront for the same reason
            // `delete_page` names the page: a consent prompt saying only "Republish" does
            // not tell anyone what is about to be replaced.
            if (args?.confirm !== true) {
                return asText({
                    error:
                        `republish publishes the settings, code and every page of ` +
                        `${targets.repoOwner}/${targets.repoName} to the CDN, replacing what is ` +
                        'currently live. To proceed, call again with confirm:true.',
                });
            }

            // The CDN publish needs the DA.live session on every storefront the extension
            // sets up (site admin role). An agent gets the refusal it can act on, never a
            // dialog.
            const github = await requireGitHub(ctx);
            if (github) return asText(github);
            const daLive = await requireDaLive(ctx, ' to publish the storefront');
            if (daLive) return asText(daLive);
            const daLiveAuthService = getDaLiveAuthService(ctx.context);

            const { tokenService: githubTokenService, fileOperations: githubFiles } = getGitHubServices(
                ctx.context.secrets,
            );
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
                        // Each step by its table name, once, in the agent's notification and
                        // the chat, as the dashboard names it (progress vocabulary slice 3).
                        onStage: stepPhaseReporter(),
                        daLiveAuthService,
                        githubTokenService,
                        githubFiles,
                        stateManager: ctx.stateManager,
                    }),
                );
                return asText({
                    success: result.success,
                    cdnVerified: result.cdnVerified,
                    // Category pages written or refreshed, and pages left alone by name (EDS-24).
                    ...(result.catalogMenu ? { categoryPages: result.catalogMenu } : {}),
                    // After a store change: the new store's pages, in the SC's sentence (EDS-44).
                    ...(result.storePages ? { storePages: result.storePages } : {}),
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

    registerStorefrontReportTool(server, ctxFactory);
}

/**
 * `get_storefront_report` (EDS-13f): the same report `Demo Builder: Storefront
 * Report` shows, as data plus the words a person reads. Read-only.
 */
function registerStorefrontReportTool(server: McpToolServer, ctxFactory: () => HandlerContext): void {
    server.registerTool(
        'get_storefront_report',
        {
            needsAuth: ['github'],
            annotations: { readOnlyHint: true, destructiveHint: false },
            description:
                "Where the open project's Edge Delivery storefront comes from (its boilerplate version against " +
                "Demo Builder's current one, the template GitHub records), what Demo Builder wrote into it, " +
                "links in its content to pages that do not exist, and needsReset when it is behind how Demo " +
                'Builder builds storefronts now. Read-only.',
            inputSchema: {},
        },
        async () => {
            const ctx = ctxFactory();
            const eds = await requireEdsProject(ctx, 'get_storefront_report');
            if (!eds.ok) return asText(eds.body);
            const github = await requireGitHub(ctx, ' to read the storefront');
            if (github) return asText(github);
            const report = await readStorefrontReport(
                eds.project,
                createStorefrontReportDeps(ctx.context.secrets, ctx.logger),
            );
            if (!report) return asText({ error: 'Project is missing GitHub repo metadata' });
            return asText({ ...report, summary: storefrontReportLines(report) });
        },
    );
}
