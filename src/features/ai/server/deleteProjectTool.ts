/**
 * delete_project (Phase 4) — permanently delete a Demo Builder project's LOCAL
 * footprint (files + recent list + current-project pointer) via the headless
 * `deleteProjectFiles` core extracted from the deletion service (no modals).
 *
 * Name-addressed and EXTRA-STRICT for this irreversible op: requires
 * `confirm:true` AND a `confirmName` that exactly echoes the project name.
 *
 * The cloud resources are the checklist the button shows, as arguments, both
 * obeying `demoBuilder.cleanupBehavior` (AI-9, answered 2026-09-19): an argument the
 * call leaves out takes the setting's default, as the button's boxes do. Under `ask`
 * a plain call deletes only the local footprint; under `deleteAll` it deletes the
 * repository and site too. Until 2026-10-19 a left-out argument was read as `false`
 * before the setting was consulted, so `deleteAll` never applied to an agent (AI-71).
 */

import { z } from 'zod';
import { cleanUpProjectCloud, resolveCloudCleanup } from './agentProjectCleanup';
import { asText } from './mcpToolResult';
import type { McpToolServer } from './mcpToolServer';
import { reportPhase } from '@/core/utils/agentPhaseChannel';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import { deleteProjectFiles } from '@/features/projects-dashboard/services/projectFilesDeletion';
import type { HandlerContext } from '@/types/handlers';

/**
 * Register the delete_project tool on `server`.
 *
 * @param server     McpServer (typed `any`; see registerProjectTools docstring).
 * @param ctxFactory Builds a headless HandlerContext for each invocation.
 */
export function registerDeleteProjectTool(
    server: McpToolServer,
    ctxFactory: () => HandlerContext,
): void {
    server.registerTool(
        'delete_project',
        {
            needsAuth: false,
            annotations: { readOnlyHint: false, destructiveHint: true },
            description:
                'Permanently delete a project: its local files, and optionally its GitHub repo and DA.live site (which also unpublishes the storefront and removes its product pages; productPages in the result says what happened to them; daLiveSite.publishSummary says whether the pages are gone, checked on the live host, or that it could not tell). Irreversible. Requires confirm:true and confirmName="<project name>".',
            inputSchema: {
                name: z.string().describe('Name of the project to delete'),
                confirm: z.boolean().optional().describe('Must be true to proceed'),
                confirmName: z
                    .string()
                    .optional()
                    .describe('Must equal the project name exactly — guards this irreversible deletion'),
                deleteGithubRepo: z
                    .boolean()
                    .optional()
                    .describe(
                        "Also delete the project's GitHub repository (default: false, or true when the cleanupBehavior setting is deleteAll)",
                    ),
                deleteDaLiveSite: z
                    .boolean()
                    .optional()
                    .describe(
                        "Also delete the project's DA.live site and take its pages off the CDN (default: false, or true when the cleanupBehavior setting is deleteAll)",
                    ),
            },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
            const name = String(args?.name ?? '').trim();
            if (!name) {
                return asText({ error: 'name is required' });
            }
            if (args?.confirm !== true || args?.confirmName !== name) {
                return asText({
                    error: `delete_project permanently deletes the local project "${name}". To proceed, call again with confirm:true and confirmName:"${name}".`,
                    irreversible: true,
                });
            }

            const ctx = ctxFactory();
            const summaries = await ctx.stateManager.getAllProjects();
            const match = summaries.find((p) => p.name === name);
            if (!match) {
                return asText({ error: `No project named "${name}"`, projects: summaries.map((p) => p.name) });
            }

            const project = await ctx.stateManager.loadProjectFromPath(match.path, undefined, { persistAfterLoad: false });
            if (!project) {
                return asText({ error: `Failed to load project "${name}"` });
            }

            // The cloud first: the local record is how the cloud resources are
            // found, so deleting it first would strand them (the button orders it
            // the same way).
            // Left out is not "no": the setting decides (AI-71). A word is not a tick either.
            const choice = resolveCloudCleanup({
                deleteGithubRepo: tickOf(args?.deleteGithubRepo),
                deleteDaLiveSite: tickOf(args?.deleteDaLiveSite),
            });
            const cloud = await cleanUpProjectCloud(ctx, project, choice);

            try {
                // The button's own words for the step it runs (PL-59 slice 7).
                reportPhase(OPERATION_STAGES.removingProjectFiles.label);
                await deleteProjectFiles(ctx, project);
                return asText({
                    deleted: true,
                    name,
                    ...cloud,
                    ...(choice.refusedBySetting ? { note: choice.refusedBySetting } : {}),
                });
            } catch (err) {
                return asText({
                    deleted: false,
                    name,
                    ...cloud,
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        },
    );
}

/** A checkbox argument: a boolean as given, anything else left for the setting to decide. */
function tickOf(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined;
}
