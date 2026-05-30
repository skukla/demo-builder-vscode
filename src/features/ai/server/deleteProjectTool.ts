/**
 * delete_project (Phase 4) — permanently delete a Demo Builder project's LOCAL
 * footprint (files + recent list + current-project pointer) via the headless
 * `deleteProjectFiles` core extracted from the deletion service (no modals).
 *
 * Name-addressed and EXTRA-STRICT for this irreversible op: requires
 * `confirm:true` AND a `confirmName` that exactly echoes the project name. It does
 * NOT touch cloud resources — the agent uses `delete_github_repo` /
 * `cleanup_dalive_site` for the GitHub repo and DA.live site.
 */

import { z } from 'zod';
import { deleteProjectFiles } from '@/features/projects-dashboard/services/projectDeletionService';
import type { HandlerContext } from '@/types/handlers';

/** Wrap a JSON-serializable value as an MCP text result. */
function asText(value: unknown): { content: Array<{ type: 'text'; text: string }> } {
    return { content: [{ type: 'text' as const, text: JSON.stringify(value) }] };
}

/**
 * Register the delete_project tool on `server`.
 *
 * @param server     McpServer (typed `any`; see registerProjectTools docstring).
 * @param ctxFactory Builds a headless HandlerContext for each invocation.
 */
export function registerDeleteProjectTool(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    server: any,
    ctxFactory: () => HandlerContext,
): void {
    server.registerTool(
        'delete_project',
        {
            description:
                'Permanently delete a project locally (files + recent list). Irreversible; does NOT delete cloud resources. Requires confirm:true and confirmName="<project name>".',
            inputSchema: {
                name: z.string().describe('Name of the project to delete'),
                confirm: z.boolean().optional().describe('Must be true to proceed'),
                confirmName: z
                    .string()
                    .optional()
                    .describe('Must equal the project name exactly — guards this irreversible deletion'),
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

            try {
                await deleteProjectFiles(ctx, project);
                return asText({ deleted: true, name });
            } catch (err) {
                return asText({ deleted: false, name, error: err instanceof Error ? err.message : String(err) });
            }
        },
    );
}
