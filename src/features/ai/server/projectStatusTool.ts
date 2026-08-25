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
import { ServiceLocator } from '@/core/di';
import type { StateManager } from '@/core/state';
import { getMeshEndpoint } from '@/core/state/appBuilderComponentState';
import {
    buildStatusPayload,
    deriveMeshStatus,
} from '@/features/dashboard/services/dashboardStatusService';
import { detectFrontendChanges } from '@/features/mesh/services/stalenessDetector';

/** Registers `get_project_status` on the MCP server. */
export function registerProjectStatusTool(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    server: any,
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

            // Only meaningful while running, and it reads the project's files —
            // the dashboard guards it the same way rather than paying for it on
            // every status read.
            const frontendConfigChanged =
                project.status === 'running' ? detectFrontendChanges(project) : false;

            // Silent — see the module docstring. A false here reports `needs-auth`
            // rather than prompting, which is the honest answer for a surface that
            // cannot show a prompt.
            const authenticated = await ServiceLocator.getAuthenticationService().isAuthenticated();

            const mesh = deriveMeshStatus(project, authenticated);
            const payload = buildStatusPayload(
                project,
                frontendConfigChanged,
                mesh ? { status: mesh.status, endpoint: getMeshEndpoint(project) } : undefined,
            );

            return asText(payload);
        },
    );
}
