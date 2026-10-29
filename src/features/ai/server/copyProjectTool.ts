/**
 * copy_project — the agent's Copy from Existing (PL-56f).
 *
 * The projects list's Copy opens a picker and then the wizard; this takes the
 * source project's NAME and creates the copy headlessly. It reads the source the
 * way the human Copy does (`copySeedFromProject`: the file Export writes, read back
 * through `readProjectFile`) and then goes down `create_project_from_file`'s own
 * second half (`createFromProjectFile`), which ends in `runProjectCreation`. No
 * second creation pipeline, and no second reading of a project.
 *
 * Two owner rules (2026-10-04): the copy never carries a credential (they are not
 * in the file; the answer names the ones the copy still needs), and it gets its own
 * repository and DA.live site, so naming the source's own is refused.
 */

import { z } from 'zod';
import { NEW_PROJECT_FIELDS, createFromProjectFile } from './createProjectFromFileTool';
import { asText } from './mcpToolResult';
import type { McpToolServer } from './mcpToolServer';
import { copySeedFromProject } from '@/features/projects-dashboard/services/settingsSerializer';
import type { HandlerContext } from '@/types/handlers';
import type { ProjectFile } from '@/types/projectFile';

const OWN_STOREFRONT =
    'A copy gets its own repository and DA.live site. Name a repoName and a daLiveSite that are not the source project’s.';

/** Whether the call names the source's own repository or site for the copy. */
function reusesSourceStorefront(file: ProjectFile, args: Record<string, unknown>): boolean {
    const source = file.source.storefront;
    if (!source) return false;
    const sourceRepo = source.githubRepo?.split('/')[1];
    const sameRepo = Boolean(sourceRepo) && args.repoName === sourceRepo;
    const sameSite =
        Boolean(source.daLiveSite) &&
        args.daLiveSite === source.daLiveSite &&
        args.daLiveOrg === source.daLiveOrg;
    return sameRepo || sameSite;
}

/**
 * Register `copy_project`.
 *
 * @param server     The tool server.
 * @param ctxFactory Builds a headless HandlerContext per call.
 */
export function registerCopyProjectTool(server: McpToolServer, ctxFactory: () => HandlerContext): void {
    server.registerTool(
        'copy_project',
        {
            needsAuth: ['github', 'dalive'],
            annotations: { readOnlyHint: false, destructiveHint: false },
            title: 'Copy Project',
            description:
                "Create a new project as a copy of one on this machine (the projects list's Copy from Existing). " +
                'Takes the same package, stack, addons, settings, integrations, mesh and datapack; never a ' +
                'credential, and the answer lists the ones still needed. An Edge Delivery copy gets its own ' +
                'repository and DA.live site: pass a repoName, daLiveOrg and daLiveSite that are not the ' +
                "source's. Requires confirm:true",
            inputSchema: {
                sourceProject: z.string().describe('Name of the project to copy (from list_projects)'),
                ...NEW_PROJECT_FIELDS,
            },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
            const sourceProject = String(args?.sourceProject ?? '').trim();
            const projectName = String(args?.projectName ?? '').trim();
            if (!sourceProject || !projectName) {
                return asText({ error: 'sourceProject and projectName are both required.' });
            }
            const ctx = ctxFactory();
            const summaries = await ctx.stateManager.getAllProjects();
            const match = summaries.find((p) => p.name === sourceProject);
            if (!match) {
                return asText({
                    error: `No project named "${sourceProject}"`,
                    projects: summaries.map((p) => p.name),
                });
            }
            const project = await ctx.stateManager.loadProjectFromPath(match.path, undefined, {
                persistAfterLoad: false,
            });
            if (!project) return asText({ error: `Failed to load project "${sourceProject}"` });

            const read = copySeedFromProject(project);
            if (!read.ok) return asText({ error: read.error });
            if (reusesSourceStorefront(read.file, args)) return asText({ error: OWN_STOREFRONT });
            return createFromProjectFile(() => ctx, args, read, {
                toolName: 'copy_project',
                reportKey: 'fromProject',
                sourceProject,
            });
        },
    );
}
