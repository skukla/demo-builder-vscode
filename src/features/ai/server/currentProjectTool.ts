/**
 * get_current_project — resolve the persisted current-project pointer.
 *
 * In the always-root home-Chat model the VS Code window stays homed at the
 * projects root, so a project is never inferred from the workspace folder.
 * Instead the active project is the persisted current-project pointer (set when
 * the user selects a project / creates one). This tool reads that pointer so the
 * agent can resolve "the project we're working on" without asking the user.
 *
 * Returns `{ currentProject: <status> | null }` — null when no project is
 * selected (the agent should then ask which project to act on).
 *
 * ## Why it answers with the STATUS and not just a name
 *
 * It used to return `{ name, path }` in ~22 tokens, and `agent-gap-scan`
 * measured 83% of its calls followed immediately by another of our reads. It
 * told an agent where it was and nothing it could act on, so the next step
 * always paid a second round trip — a shape problem no count of how often a
 * tool is called can see.
 *
 * `get_project_status` already returned a strict superset of those two fields,
 * for 24 more tokens, so the two tools answered the same question two ways and
 * the thinner one was reached for 2.4x more often. Now they share one payload
 * (`resolveProjectStatus`). Both names stay: "which project am I in" and "did
 * `start_demo` take effect" are different questions, and an agent should not
 * have to route the second through a tool called *current project*.
 *
 * The NULL ENVELOPE is deliberate and is why this is not simply an alias.
 * `get_project_status` answers a prose error with no current project; this one
 * answers `null`, which is a fact an agent can branch on rather than a failure
 * it might retry.
 */

import { z } from 'zod';
import { asText } from './mcpToolResult';
import type { McpToolServer } from './mcpToolServer';
import { resolveProjectStatus } from './projectStatusTool';
import type { HandlerContext } from '@/types/handlers';


/**
 * Register `get_current_project`.
 * @param server     McpServer (typed `any`; see registerProjectTools docstring).
 * @param ctxFactory Builds a headless HandlerContext per call.
 * @param scopedProjectDir Set when THIS CONNECTION is scoped to the project its
 *   session directory sits in (connectionScope) — the response then says so,
 *   because an agent must be able to tell "the project I'm standing in" from
 *   "whatever the dashboard points at" (the tier-2 battery run measured an
 *   agent inspecting one project while its tools acted on another).
 */
 
export function registerCurrentProjectTool(
    server: McpToolServer,
    ctxFactory: () => HandlerContext,
    scopedProjectDir?: string,
): void {
    server.registerTool(
        'get_current_project',
        {
            // Reviewed 2026-08-31: no service and no token on any path.
            needsAuth: false,
            annotations: { readOnlyHint: true, destructiveHint: false },
            title: 'Get Current Project',
            description: 'Resolve the active project and its state in one call — name, path, running/stopped, port, Adobe org, whether the frontend config is stale, EDS publish state, mesh. Returns { currentProject: {...} | null }; null means no project is selected — ask the user which one.',
            inputSchema: {},
        },
        async () => {
            const ctx = ctxFactory();
            const p = await ctx.stateManager.getCurrentProject();
            return asText({
                currentProject: p ? await resolveProjectStatus(p) : null,
                // WHY this project: the session's own directory, a project this agent
                // created or picked, or the dashboard's pointer (AI-15).
                scope: scopeOf(ctx, scopedProjectDir),
            });
        },
    );

    server.registerTool(
        'set_current_project',
        {
            needsAuth: false,
            annotations: { readOnlyHint: false, destructiveHint: false },
            title: 'Set Current Project',
            description:
                'Choose the project your other tools act on (get_project, configure_project, deploy_*, ' +
                "start_demo…). Takes the path from list_projects. It changes only what YOU work on: " +
                "the person's open project and screens stay where they are. Unrelated to select_project, " +
                'which picks an Adobe Console project.',
            inputSchema: {
                projectPath: z.string().describe('Absolute project path (from list_projects)'),
            },
        },
        async (args: { projectPath?: unknown }) => asText(await chooseProject(ctxFactory(), args?.projectPath)),
    );
}

/** Why `get_current_project` answered with this project. */
function scopeOf(ctx: HandlerContext, scopedProjectDir: string | undefined): string {
    const chosen = ctx.agentWorkingProject?.path;
    if (!chosen) return 'dashboard-pointer';
    return chosen === scopedProjectDir ? 'session-directory' : 'agent-chosen';
}

/**
 * Point this agent connection at a project (AI-15). Until 2026-10-19 this ran the projects
 * list's "open project", which made the project current for the PERSON and opened its
 * dashboard on their screen; an agent picking a project now moves nothing of theirs.
 */
async function chooseProject(ctx: HandlerContext, projectPath: unknown) {
    if (typeof projectPath !== 'string' || !projectPath) return { error: 'projectPath is required (from list_projects).' };
    if (!ctx.agentWorkingProject) return { error: 'This connection cannot choose a project.' };
    // Only a project the projects list would show: the path came from an agent.
    const known = (await ctx.stateManager.getAllProjects()).some((p) => p.path === projectPath);
    const project = known
        ? await ctx.stateManager.loadProjectFromPath(projectPath, undefined, { persistAfterLoad: false })
        : null;
    if (!project) return { error: `No project at ${projectPath}. Use a path from list_projects.` };
    ctx.agentWorkingProject.path = project.path;
    return { currentProject: { name: project.name, path: project.path }, scope: 'agent-chosen' };
}
