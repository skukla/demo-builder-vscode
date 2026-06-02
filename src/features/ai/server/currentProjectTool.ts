/**
 * get_current_project — resolve the persisted current-project pointer.
 *
 * In the always-root home-Chat model the VS Code window stays homed at the
 * projects root, so a project is never inferred from the workspace folder.
 * Instead the active project is the persisted current-project pointer (set when
 * the user selects a project / creates one). This tool reads that pointer so the
 * agent can resolve "the project we're working on" without asking the user.
 *
 * Returns `{ currentProject: { name, path } | null }` — null when no project is
 * selected (the agent should then ask which project to act on).
 */

import type { HandlerContext } from '@/types/handlers';

function asText(value: unknown) {
    return { content: [{ type: 'text' as const, text: JSON.stringify(value) }] };
}

/**
 * Register `get_current_project`.
 * @param server     McpServer (typed `any`; see registerProjectTools docstring).
 * @param ctxFactory Builds a headless HandlerContext per call.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerCurrentProjectTool(server: any, ctxFactory: () => HandlerContext): void {
    server.registerTool(
        'get_current_project',
        {
            title: 'Get Current Project',
            description: 'Resolve the active project (the persisted current-project pointer). Returns { currentProject: { name, path } | null }; null means no project is selected — ask the user which one.',
            inputSchema: {},
        },
        async () => {
            const p = await ctxFactory().stateManager.getCurrentProject();
            return asText({ currentProject: p ? { name: p.name, path: p.path } : null });
        },
    );
}
