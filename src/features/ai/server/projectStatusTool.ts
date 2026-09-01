/**
 * `get_project_status` — is this demo actually working?
 *
 * The gap this closes: `start_demo` and `stop_demo` have shipped since phase 1
 * with NO way for an agent to ask whether they worked. Every later action tool
 * has the same problem, which is why this one is built first — it is the
 * instrument the others are verified with.
 *
 * ## Why a tool and not a descriptor row
 *
 * `handleRequestStatus` is the dashboard's equivalent and it cannot be reused:
 * it returns `{success: false, error: 'No panel available'}` before doing
 * anything when `context.panel` is undefined (`statusHandlers.ts:54`), which is
 * every headless call. It also posts to the webview and fires the on-open check
 * orchestrator — background work an agent's read must not trigger.
 *
 * So this builds over the same SERVICE the handler uses. `deriveMeshStatus` is
 * shared by both, so the dashboard and the agent cannot describe one mesh two
 * ways; only the auth question differs, and deliberately:
 *
 *   dashboard → `ensureAdobeIOAuth`, which may surface a sign-in warning
 *   here      → `isAuthenticated()`, silent
 *
 * A tool has no UI to show a prompt in, and an agent stalled on a dialog it
 * cannot see is worse than a status that says `needs-auth`.
 */

import { asRawText, asText } from './mcpToolResult';
import type { McpToolServer } from './mcpToolServer';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { getMeshEndpoint } from '@/core/state/appBuilderComponentState';
import type { StateManager } from '@/core/state/stateManager';
import {
    buildStatusPayload,
    deriveMeshStatus,
} from '@/features/dashboard/services/dashboardStatusService';
import { detectFrontendChanges } from '@/features/mesh/services/stalenessDetector';
import type { Project } from '@/types/base';

/**
 * The status facts for a project: name, path, running state, port, org, whether
 * the frontend config is stale, the EDS publish state, and the mesh.
 *
 * Extracted because `get_current_project` answers with it too. That tool used to
 * return a name and a path in ~22 tokens, and `agent-gap-scan` measured 83% of
 * its calls followed immediately by another of our reads — it told an agent
 * WHERE it was and nothing it could act on, so the next step always paid a
 * second round trip. This payload is a strict superset of the old one for 24
 * more tokens, which is the entire cost of removing that hop.
 *
 * Two doors, one answer. The framings are genuinely different — "which project
 * am I in" is not "did start_demo take effect" — so both tools keep their names
 * and descriptions; what they must NOT keep is two different answers to the same
 * underlying question.
 *
 * Everything here is in-memory: `detectFrontendChanges` is an object diff and
 * `isAuthenticated` is a silent cached check. Measured at ~14ms over the pointer
 * read, against ~63ms of process overhead.
 */
export async function resolveProjectStatus(project: Project): Promise<unknown> {
    // Only meaningful while running, and it reads the project's files — the
    // dashboard guards it the same way rather than paying for it on every read.
    const frontendConfigChanged =
        project.status === 'running' ? detectFrontendChanges(project) : false;

    // Silent — see the module docstring. A false here reports `needs-auth`
    // rather than prompting, which is the honest answer for a surface that
    // cannot show a prompt.
    //
    // And it must not THROW. `get_current_project` answers with this payload, so
    // this is now the most-called read on the surface and the one an agent uses
    // to find its feet. A ServiceLocator that is not initialized yet is exactly
    // the moment orientation matters most; degrading the mesh to `needs-auth` is
    // an answer, and an exception is not.
    let authenticated = false;
    try {
        authenticated = await ServiceLocator.getAuthenticationService().isAuthenticated();
    } catch {
        authenticated = false;
    }

    const mesh = deriveMeshStatus(project, authenticated);
    return buildStatusPayload(
        project,
        frontendConfigChanged,
        mesh ? { status: mesh.status, endpoint: getMeshEndpoint(project) } : undefined,
    );
}

/** Registers `get_project_status` on the MCP server. */
export function registerProjectStatusTool(
    server: McpToolServer,
    stateManager: StateManager,
): void {
    server.registerTool(
        'get_project_status',
        {
            annotations: { readOnlyHint: true, destructiveHint: false },
            description:
                'Is the current demo running, on what port, is its frontend config stale, is the EDS storefront published, and what is the mesh status. Use after start_demo/stop_demo to confirm they took effect.',
            inputSchema: {},
        },
        async () => {
            const project = await stateManager.getCurrentProject();
            if (!project) {
                return asRawText(
                    'Error: no current project. Use list_projects then set the current project.',
                );
            }

            return asText(await resolveProjectStatus(project));
        },
    );
}
