/**
 * Storefront action tools (Phase 4) — EDS storefront operations as headless
 * adapters over existing services.
 *
 * `republish` regenerates and pushes the storefront's config.json to GitHub and
 * the Helix CDN via `republishStorefrontConfig` — the headless core the
 * dashboard's "Republish" button wraps (the button additionally pops DA.live
 * auth + progress modals, which we skip). It operates on the current project,
 * pre-flights GitHub auth with a structured `needsAuth` handoff, and is
 * idempotent (safe to re-run), which is why re-running it is harmless — but it OVERWRITES
 * what visitors are currently served, so it carries a confirm gate.
 *
 * It is NOT the same class as `sync_storefront`, which this comment used to claim: that
 * tool does git add, commit and push, which is additive — a commit replaces nothing.
 * Idempotence argues that RETRYING is safe; it does not argue that starting is, because
 * the first run is the one that replaces the live content. (Reinvestigated 2026-09-02;
 * see .rptc/handoff/2026-09-02-destructive-tools-reinvestigation.md.)
 *
 * `sync_content` runs the full content publish (config + code + DA.live pages →
 * Helix preview/publish) via the shared `republishStorefrontContent` service —
 * the same pipeline the dashboard's Republish button now calls — pre-flighting
 * BOTH GitHub and DA.live auth with a structured `needsAuth` handoff.
 */

import { z } from 'zod';
import { runWithAdobeTarget } from './adobeTargetStore';
import { isOrgMismatchError, orgMismatchResult } from './adobeTools';
import { requireDaLive, requireEdsProject, requireGitHub } from './edsToolGuards';
import { asText } from './mcpToolResult';
import type { McpToolServer } from './mcpToolServer';
import { COMPONENT_IDS } from '@/core/constants';
import { stepPhaseReporter } from '@/core/utils/agentPhaseChannel';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import { getDaLiveAuthService, getGitHubServices } from '@/features/eds/handlers/edsHelpers';
import { describeCdnPropagation } from '@/features/eds/services/configSyncService';
import { createDaLiveServiceTokenProvider } from '@/features/eds/services/daLive/daLiveTokenProviders';
import { republishStorefrontContent } from '@/features/eds/services/storefront/storefrontContentRepublishService';
import { readStorefrontReport, storefrontReportLines } from '@/features/eds/services/storefront/storefrontReport';
import { createStorefrontReportDeps } from '@/features/eds/services/storefront/storefrontReportDeps';
import {
    republishStorefrontConfig,
    type RepublishResult,
} from '@/features/eds/services/storefront/storefrontRepublishService';
import { hasCatalogPagesPending } from '@/features/eds/services/storefront/storeScopeChange';
import { replaceStoreScopePages } from '@/features/eds/services/storefront/storeScopePages';
import { createStoreScopePagesDeps } from '@/features/eds/services/storefront/storeScopePagesDeps';
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
 * After a config publish that put another store live (EDS-44): replace the old store's
 * product and category pages with the new store's — the one service Configure and the
 * dashboard use — and answer with its sentence. Nothing when the store did not change,
 * or the CDN did not take the new config (the old pages still fit what is live).
 */
async function replacePagesAfterStoreChange(
    ctx: HandlerContext,
    project: Project,
    published: RepublishResult,
    step: (stage: string) => void,
): Promise<string | undefined> {
    if (!published.success || published.cdnError || !hasCatalogPagesPending(project)) return undefined;
    const target = edsTargets(project);
    if (!target) return undefined;
    const { tokenService, fileOperations } = getGitHubServices(ctx.context.secrets);
    const deps = createStoreScopePagesDeps({
        project,
        target,
        daLiveTokenProvider: createDaLiveServiceTokenProvider(getDaLiveAuthService(ctx.context)),
        githubTokenService: tokenService,
        githubFiles: fileOperations,
        stateManager: ctx.stateManager,
        persist: (p) => ctx.stateManager.saveProject(p),
        logger: ctx.logger,
    });
    const { sentence } = await replaceStoreScopePages(project, deps, step);
    return sentence;
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
                "Regenerate this project's EDS storefront config.json and publish it to " +
                'GitHub and the CDN, replacing the config visitors are currently served. ' +
                'When the store changed since the last publish, it also replaces the ' +
                "storefront's product and category pages with the new store's and answers " +
                'storePages. Requires confirm:true.',
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

            // Gated BEFORE the credential checks, so the refusal explains itself without
            // first demanding a sign-in. It names the storefront for the same reason
            // `delete_page` names the page: a consent prompt saying only "Republish" does
            // not tell anyone what is about to be replaced.
            if (args?.confirm !== true) {
                const site = edsTargets(project);
                const where = site ? `${site.repoOwner}/${site.repoName}` : project.name;
                return asText({
                    error:
                        `republish regenerates config.json for ${where} and replaces the ` +
                        'config currently live on the CDN. To proceed, call again with ' +
                        'confirm:true.',
                });
            }

            const github = await requireGitHub(ctx, ' to push config.json');
            if (github) return asText(github);
            // The CDN publish needs the DA.live session on every storefront the
            // extension sets up (site admin role). An agent gets the refusal it can
            // act on — the same one sync_content gives — never a dialog.
            const daLive = await requireDaLive(ctx, ' to publish config.json to the CDN');
            if (daLive) return asText(daLive);

            try {
                // Each step by its table name, once, in the agent's notification and
                // the chat (progress vocabulary slice 3, owner 2026-10-16), as the
                // dashboard names it. Until a callback was passed here the chat sat
                // silent through the whole publish; the DASHBOARD path is a different
                // function (edsContentHandlers), and wiring that one does nothing for
                // the agent, a mistake already made once here.
                const step = stepPhaseReporter();
                step(OPERATION_STAGES.publishingSettings.label);
                // Run under the stored session org context so any `aio` work
                // targets the selected org via env (no global mutation).
                const result = await runWithAdobeTarget(() =>
                    republishStorefrontConfig({
                        persist: (p) => ctx.stateManager.saveProject(p),
                        project,
                        secrets: ctx.context.secrets,
                        logger: ctx.logger,
                    }),
                );
                const storePages = await replacePagesAfterStoreChange(ctx, project, result, step);
                return asText({
                    success: result.success,
                    githubPushed: result.githubPushed,
                    cdnPublished: result.cdnPublished,
                    cdnVerified: result.cdnVerified,
                    ...(storePages ? { storePages } : {}),
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
            needsAuth: ['github', 'dalive'],
            annotations: { readOnlyHint: false, destructiveHint: true },
            description:
                "Publish ALL of this project's EDS storefront content — config, code and " +
                'DA.live pages — to the CDN, replacing what visitors are currently served. ' +
                'Requires confirm:true. (Not the same as sync_storefront, which commits and ' +
                'pushes the storefront code and publishes only the home page.)',
            inputSchema: {
                confirm: z.boolean().optional().describe('Must be true to proceed'),
            },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
            const ctx = ctxFactory();
            const eds = await requireEdsProject(ctx, 'sync_content');
            if (!eds.ok) return asText(eds.body);
            const { project } = eds;
            const targets = edsTargets(project);
            if (!targets) {
                return asText({ error: 'Project is missing GitHub repo metadata' });
            }

            // Before the credential checks, and naming the site — see `republish`.
            if (args?.confirm !== true) {
                return asText({
                    error:
                        `sync_content republishes every page of ${targets.daLiveOrg}/` +
                        `${targets.daLiveSite} to the CDN, replacing what is currently ` +
                        'live. To proceed, call again with confirm:true.',
                });
            }

            const github = await requireGitHub(ctx);
            if (github) return asText(github);
            const daLive = await requireDaLive(ctx, ' to publish content');
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
                        // Each step by its table name, once, as the dashboard names it.
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
 * Report` shows, as data plus the words a person reads. Read-only: accepting
 * the fixes it finds is `reset_project` with `applyFixes:true`, a separate,
 * confirmed write.
 */
function registerStorefrontReportTool(server: McpToolServer, ctxFactory: () => HandlerContext): void {
    server.registerTool(
        'get_storefront_report',
        {
            needsAuth: ['github'],
            annotations: { readOnlyHint: true, destructiveHint: false },
            description:
                "Where the open project's Edge Delivery storefront comes from (its boilerplate version against " +
                "Demo Builder's current one, the template GitHub records), what Demo Builder wrote into it, and " +
                "each Demo Builder fix's state on its code (applied, fits, missing). Read-only. `offer` lists the " +
                'fixes that fit an added demo; the user accepts them with reset_project applyFixes:true.',
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
