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
 *
 * `deletePack` is the button's third box, "Also delete its pack" (datapack-engine step 07):
 * every version of the project's own library pack, after the local files. Off unless asked,
 * and no setting turns it on, because keeping a pack is reversible and deleting one is not.
 */

import { z } from 'zod';
import { cleanUpProjectCloud, resolveCloudCleanup } from './agentProjectCleanup';
import { asText } from './mcpToolResult';
import type { McpToolServer } from './mcpToolServer';
import { reportPhase } from '@/core/utils/agentPhaseChannel';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import { deleteProjectDemoPack } from '@/features/projects-dashboard/services/demoPackDeletion';
import { deleteProjectFiles } from '@/features/projects-dashboard/services/projectFilesDeletion';
import type { Project } from '@/types/base';
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
                'Permanently delete a project: its local files, optionally (deletePack:true) every version of its own pack in the datapack library, which datapack.deleted reports, and optionally its GitHub repo and DA.live site (which also unpublishes the storefront and removes its product pages; productPages in the result says what happened to them; daLiveSite.publishSummary says whether the pages are gone, checked on the live host, or that it could not tell). When the pages are still live it stops: nothing else is deleted, the project is kept, and stopped says why. Irreversible. Requires confirm:true and confirmName="<project name>".',
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
                deletePack: z
                    .boolean()
                    .optional()
                    .describe(
                        "Also delete every version of the project's own pack in the datapack library, after its files (default: false under every cleanupBehavior; refused under localOnly)",
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
                deletePack: tickOf(args?.deletePack),
            });
            const cloud = await cleanUpProjectCloud(ctx, project, choice);
            // Pages still live: the project is how a second try finds them (EDS-65).
            if (cloud.stopped) {
                return asText({ deleted: false, name, ...cloud, error: cloud.stopped });
            }

            try {
                // The button's own words for the step it runs (PL-59 slice 7).
                reportPhase(OPERATION_STAGES.removingProjectFiles.label);
                await deleteProjectFiles(ctx, project);
                const datapack = choice.deletePack ? await deleteOwnPack(ctx, project) : undefined;
                return asText({
                    deleted: true,
                    name,
                    ...cloud,
                    ...(datapack ? { datapack } : {}),
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

/** What deleting the project's own pack did, for the agent. */
interface PackAnswer {
    name?: string;
    deleted: boolean;
    error?: string;
}

/** The project's own pack, deleted last, as the button deletes it (step 07). Never throws. */
async function deleteOwnPack(ctx: HandlerContext, project: Project): Promise<PackAnswer> {
    if (!project.ownDatapack) return { deleted: false, error: 'This project has no pack of its own.' };
    reportPhase(OPERATION_STAGES.deletingOwnPack.label);
    const result = await deleteProjectDemoPack(ctx, project.ownDatapack);
    return { name: result.name, deleted: result.success && !result.skipped, ...(result.error ? { error: result.error } : {}) };
}

/** A checkbox argument: a boolean as given, anything else left for the setting to decide. */
function tickOf(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined;
}
