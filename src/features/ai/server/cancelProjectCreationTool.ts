/**
 * `cancel_project_creation` — stop a project creation that is running.
 *
 * The agent's half of the wizard's Cancel: it dispatches the same
 * `cancel-project-creation` handler, with the project's name, because an agent call
 * has no panel and a fresh context each time (PL-104 fix 14). Every creation, from the
 * wizard or from `create_project`, `create_project_from_file` or `copy_project`, runs
 * through `runCreation`, which registers its stop by project folder.
 *
 * Stopping lets the creation's running step finish, starts no further step, and then
 * runs its cleanup (the half-built project folder, and an API Mesh this creation made),
 * as the wizard's Cancel does (F274). A storefront an Edge Delivery creation already set
 * up stays.
 */

import { z } from 'zod';
import { asText } from './mcpToolResult';
import type { McpToolServer } from './mcpToolServer';
import { dispatchHandler } from '@/core/handlers/dispatchHandler';
import { projectCreationHandlers } from '@/features/project-creation/handlers/ProjectCreationHandlerRegistry';
import type { HandlerContext } from '@/types/handlers';

/**
 * Register `cancel_project_creation`.
 * @param server     the MCP tool server
 * @param ctxFactory builds a headless HandlerContext per call
 */
export function registerCancelProjectCreationTool(
    server: McpToolServer,
    ctxFactory: () => HandlerContext,
): void {
    server.registerTool(
        'cancel_project_creation',
        {
            needsAuth: false,
            annotations: { readOnlyHint: false, destructiveHint: false },
            title: 'Cancel Project Creation',
            description:
                "Stop a project creation that is running, by the project name: one this agent started with create_project, create_project_from_file or copy_project, or one the user started in the wizard. The half-built project is cleaned up as the wizard's Cancel does; a storefront already set up stays. Requires confirm:true",
            inputSchema: {
                projectName: z.string().describe('Name of the project being created'),
                confirm: z
                    .boolean()
                    .optional()
                    .describe(
                        'Must be true: stops the creation and removes the half-built project',
                    ),
            },
        },
        async (args: { projectName?: string; confirm?: boolean }) => {
            const projectName = String(args?.projectName ?? '').trim();
            if (!projectName) return asText({ error: 'projectName is required.' });
            if (args?.confirm !== true) {
                return asText({
                    error: 'cancel_project_creation requires confirm:true: it stops the creation and removes the half-built project. Ask the user to confirm.',
                });
            }
            const res = await dispatchHandler(
                projectCreationHandlers,
                ctxFactory(),
                'cancel-project-creation',
                { projectName },
            );
            const { message } = (res.data ?? {}) as { message?: string };
            return asText({ stopped: res.success, message });
        },
    );
}
