/**
 * delete_project (Phase 4) — permanently delete a Demo Builder project through the
 * button's own delete, `runProjectDelete` (PL-104 fix 6): the same order, stop rules and
 * DA.live sign-in, run with nobody to ask, so a sign-in it would ask for is refused with
 * the sentence saying which. Until then this tool re-ran the steps beside it.
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
 * uninstall_datapack settles them (saved into their own pack; else `changes` and `saveAs`, refused
 * until answered). A removal that does not finish deletes nothing. Off unless asked, and no
 * setting turns it on: it writes to a store. Deleting a datapack itself is the library's job
 * (delete_library_datapack), never a project delete's.
 */

import { z } from 'zod';
import { agentCloudOutcome, type CloudCleanupChoice, resolveCloudCleanup } from './agentProjectCleanup';
import { CHANGES_DESCRIPTION, changesAnswer, changesNeedAnswer, type DatapackAnswerArgs } from './datapackAnswerArgs';
import { asText } from './mcpToolResult';
import type { McpToolServer } from './mcpToolServer';
import { reportPhase } from '@/core/utils/agentPhaseChannel';
import type { AskSaveAsName } from '@/features/eds/services/reset/edsResetDatapack';
import { extractEdsMetadata, type CleanupResultItem } from '@/features/eds/services/resourceCleanupHelpers';
import { type SharedOnline, sharedOnlineOf } from '@/features/eds/services/storefront/sharedRepoProjects';
import { hasRemovableData } from '@/features/projects-dashboard/services/datapackDataRemoval';
import { runProjectDelete, type ProjectDeleteRun } from '@/features/projects-dashboard/services/projectDeletionService';
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
                `Permanently delete a project: its local files, optionally (removeData:true) its datapack's data in Commerce first, which datapackData reports (the user's changes in it are saved into their own pack; when the pack is not theirs it answers code CHANGES_NEED_ANSWER and deletes nothing until changes is keep with saveAs, or drop; changes:"drop" loses the user's changes in any pack, their own included; a removal that does not finish, or that leaves part in Commerce, deletes nothing and error names what was left), and optionally its GitHub repo and DA.live site (which also unpublishes the storefront and removes its product pages; productPages in the result says what happened to them; daLiveSite.publishSummary says whether the pages are gone, checked on the live host, or that it could not tell). When the pages are still live it stops: nothing else is deleted, the project is kept, and stopped says why. Irreversible. Requires confirm:true and confirmName="<project name>".`,
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

            const project = await ctx.stateManager.loadProjectFromPath(match.path);
            if (!project) {
                return asText({ error: `Failed to load project "${name}"` });
            }

            // Left out is not "no": the setting decides (AI-71). A word is not a tick either.
            const asked = resolveCloudCleanup({
                deleteGithubRepo: tickOf(args?.deleteGithubRepo),
                deleteDaLiveSite: tickOf(args?.deleteDaLiveSite),
                removeData: tickOf(args?.removeData),
            });
            // What another project here still uses is never deleted with this one, as the button never offers it.
            const { choice, kept } = keepShared(asked, await sharedOnlineOf(ctx.stateManager, extractEdsMetadata(project), [project.path]));
            const removable = choice.removeData === true && (await hasRemovableData(project));
            const ran = await runAgentDelete(ctx, project, choice, { removable, args });
            if ('stop' in ran) return asText({ deleted: false, name, ...ran.stop });

            const data = choice.removeData ? { datapackData: dataOutcome(removable, ran.run) } : {};
            const cloud = agentCloudOutcome(project, ran.run, ran.results);
            // Stopped: the data was not all removed, or pages are still live (EDS-65). The
            // project is how a second try finds what is left.
            if (ran.run.stopped) {
                return asText({ deleted: false, name, ...(cloud.stopped ? data : {}), ...cloud, error: ran.run.stopped });
            }
            return asText({
                deleted: true,
                name,
                ...data,
                ...cloud,
                ...(kept.length > 0 ? { kept } : {}),
                ...(choice.refusedBySetting ? { note: choice.refusedBySetting } : {}),
            });
        },
    );
}

/** What the agent's delete hands back: the button delete's run and rows, or why it answered early. */
type AgentDelete = { run: ProjectDeleteRun; results: CleanupResultItem[] } | { stop: Record<string, unknown> };

/**
 * The button's own delete (`runProjectDelete`, PL-104 fix 6): the datapack's data first, then
 * what the choice names online, then the files, in its order and with its stop rules. Nobody is
 * there to ask, so each sign-in it would ask for is refused instead (`nobodyToAsk`), and the
 * datapack's changes take the answer the call gave up front, or stop it until one is given.
 */
async function runAgentDelete(
    ctx: HandlerContext,
    project: Project,
    choice: CloudCleanupChoice,
    data: { removable: boolean; args: DatapackAnswerArgs | undefined },
): Promise<AgentDelete> {
    let unanswered: string | undefined;
    const askName: AskSaveAsName = (asked) => {
        unanswered = asked.sentence ?? "The user changed this datapack's data since it was installed.";
        return Promise.resolve(undefined);
    };
    const answer = changesAnswer(data.args);
    const results: CleanupResultItem[] = [];
    const cleanupOptions = {
        deleteGitHubRepo: choice.deleteGithubRepo,
        deleteDaLiveSite: choice.deleteDaLiveSite,
        removeDatapackData: data.removable,
        nobodyToAsk: true as const,
    };
    try {
        const run = await runProjectDelete(
            ctx,
            project,
            { cleanupOptions, askName: answer === undefined ? askName : { given: answer }, cleanupResults: results },
            (stage) => reportPhase(stage),
        );
        if (unanswered !== undefined) return { stop: changesNeedAnswer(unanswered, 'deleted') };
        return { run, results };
    } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        return { stop: { ...agentCloudOutcome(project, {}, results), error } };
    }
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

/** Nothing ran: no install record and no install target, so nothing of the pack was installed. */
const NOTHING_INSTALLED =
    "No website and store view were ever recorded for this project's datapack, so nothing of it was installed in Commerce and there was none to remove.";

/** No datapack data Demo Builder installed: nothing was asked of the removal. */
const NO_DATA =
    'This project has no datapack data Demo Builder installed in a Commerce instance, so there was none to remove.';

/** What removing the data did, beside a delete that went ahead. */
function dataOutcome(removable: boolean, run: ProjectDeleteRun): { removed: boolean; note?: string } {
    if (!removable) return { removed: false, note: NO_DATA };
    return run.nothingInstalled ? { removed: false, note: NOTHING_INSTALLED } : { removed: true };
}

/** A checkbox argument: a boolean as given, anything else left for the setting to decide. */
function tickOf(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined;
}
