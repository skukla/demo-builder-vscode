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
 * `removeData` is the button's third box, "Uninstall Datapack" (walk F96): the data the
 * project's datapack put in Commerce, removed FIRST, the user's changes in it settled as
 * reset_datapack settles them (saved into their own pack; else `changes` and `saveAs`, refused
 * until answered). A removal that does not finish deletes nothing. Off unless asked, and no
 * setting turns it on: it writes to a store. Deleting a datapack itself is the library's job
 * (delete_library_datapack), never a project delete's.
 */

import { z } from 'zod';
import { type CloudCleanupChoice, cleanUpProjectCloud, resolveCloudCleanup } from './agentProjectCleanup';
import { CHANGES_DESCRIPTION, changesAnswer, changesNeedAnswer, type DatapackAnswerArgs } from './datapackAnswerArgs';
import { asText } from './mcpToolResult';
import type { McpToolServer } from './mcpToolServer';
import { reportPhase } from '@/core/utils/agentPhaseChannel';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import type { AskSaveAsName } from '@/features/eds/services/reset/edsResetSampleData';
import { extractEdsMetadata } from '@/features/eds/services/resourceCleanupHelpers';
import { type SharedOnline, sharedOnlineOf } from '@/features/eds/services/storefront/sharedRepoProjects';
import { hasRemovableData, removeDataBeforeDelete } from '@/features/projects-dashboard/services/datapackDataRemoval';
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
                `Permanently delete a project: its local files, optionally (removeData:true) its datapack's data in Commerce first, which datapackData reports (the user's changes in it are saved into their own pack; when the pack is not theirs it answers code CHANGES_NEED_ANSWER and deletes nothing until changes is keep with saveAs, or drop; changes:"drop" loses the user's changes in any pack, their own included; a removal that does not finish deletes nothing), and optionally its GitHub repo and DA.live site (which also unpublishes the storefront and removes its product pages; productPages in the result says what happened to them; daLiveSite.publishSummary says whether the pages are gone, checked on the live host, or that it could not tell). When the pages are still live it stops: nothing else is deleted, the project is kept, and stopped says why. Irreversible. Requires confirm:true and confirmName="<project name>".`,
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
                removeData: z
                    .boolean()
                    .optional()
                    .describe(
                        "Also remove the project's datapack data from its Commerce instance, before anything else (default: false under every cleanupBehavior; refused under localOnly)",
                    ),
                changes: z.enum(['keep', 'drop']).optional().describe(CHANGES_DESCRIPTION),
                saveAs: z
                    .object({ displayName: z.string().min(1).describe('The name the user gave the new datapack, e.g. My Bodea') })
                    .optional()
                    .describe('With changes:"keep": the new datapack of the user\'s that their changes are saved as'),
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
            const asked = resolveCloudCleanup({
                deleteGithubRepo: tickOf(args?.deleteGithubRepo),
                deleteDaLiveSite: tickOf(args?.deleteDaLiveSite),
                removeData: tickOf(args?.removeData),
            });
            // What another project here still uses is never deleted with this one, as the button never offers it.
            const { choice, kept } = keepShared(asked, await sharedOnlineOf(ctx.stateManager, extractEdsMetadata(project), [project.path]));
            // The data first, as the button removes it: a removal that does not finish keeps it all (walk F96).
            const data = choice.removeData ? await removeDataFirst(ctx, project, args) : undefined;
            if (data && 'stop' in data) return asText({ deleted: false, name, ...data.stop });
            const cloud = await cleanUpProjectCloud(ctx, project, choice);
            // Pages still live: the project is how a second try finds them (EDS-65).
            if (cloud.stopped) {
                return asText({ deleted: false, name, ...data, ...cloud, error: cloud.stopped });
            }

            try {
                // The button's own words for the step it runs (PL-59 slice 7).
                reportPhase(OPERATION_STAGES.removingProjectFiles.label);
                await deleteProjectFiles(ctx, project);
                return asText({
                    deleted: true,
                    name,
                    ...data,
                    ...cloud,
                    ...(kept.length > 0 ? { kept } : {}),
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

/** The choice with what another project uses taken out, and a sentence for each kept. */
function keepShared(choice: CloudCleanupChoice, shared: SharedOnline): { choice: CloudCleanupChoice; kept: string[] } {
    const kept: string[] = [];
    const out = { ...choice };
    if (out.deleteGithubRepo && shared.repo.length > 0) {
        out.deleteGithubRepo = false;
        kept.push(`Kept the GitHub repository: ${shared.repo.join(', ')} also uses it.`);
    }
    if (out.deleteDaLiveSite && shared.site.length > 0) {
        out.deleteDaLiveSite = false;
        kept.push(`Kept the DA.live site: ${shared.site.join(', ')} also uses it.`);
    }
    return { choice: out, kept };
}

/** What removing the data did: reported beside the delete, or why nothing was deleted. */
type DataOutcome = { datapackData: { removed: boolean; note?: string } } | { stop: Record<string, unknown> };

/** The project's datapack data, removed before anything else, as the button removes it. */
async function removeDataFirst(ctx: HandlerContext, project: Project, args: DatapackAnswerArgs | undefined): Promise<DataOutcome> {
    if (!(await hasRemovableData(project))) {
        return { datapackData: { removed: false, note: 'This project has no datapack data Demo Builder installed in a Commerce instance, so there was none to remove.' } };
    }
    // An answer goes up front, as the window's does (step-05 S1), so a drop reaches the user's own
    // pack too; with none, the removal asks, and a pack that is not theirs stops the delete.
    let unanswered: string | undefined;
    const askName: AskSaveAsName = (asked) => {
        unanswered = asked.sentence ?? "The user changed this datapack's data since it was installed.";
        return Promise.resolve(undefined);
    };
    const answer = changesAnswer(args);
    const why = await removeDataBeforeDelete(ctx, project, (stage) => reportPhase(stage), answer === undefined ? askName : { given: answer });
    if (unanswered !== undefined) return { stop: changesNeedAnswer(unanswered, 'deleted') };
    return why ? { stop: { error: why } } : { datapackData: { removed: true } };
}

/** A checkbox argument: a boolean as given, anything else left for the setting to decide. */
function tickOf(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined;
}
