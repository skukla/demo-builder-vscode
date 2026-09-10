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
            const p = await ctxFactory().stateManager.getCurrentProject();
            return asText({
                currentProject: p ? await resolveProjectStatus(p) : null,
                // WHY this project: the session's own directory, or the
                // dashboard's pointer. Scoped sessions never move the pointer.
                scope: scopedProjectDir ? 'session-directory' : 'dashboard-pointer',
            });
        },
    );
}
