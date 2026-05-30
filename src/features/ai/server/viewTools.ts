/**
 * View tools (Phase 3a) — the confirm-gated UI opener.
 *
 * Codifies the governing rule: no tool opens a VS Code view unsolicited. The
 * agent offers to open a view conversationally; only on the user's confirmation
 * does it call `open_view(view, confirm:true)`, which runs the corresponding
 * Demo Builder command.
 *
 * vscode-free: the command runner is injected from `extension.ts` so this module
 * carries no vscode import.
 */

import { z } from 'zod';

/** Friendly view name → Demo Builder command id. */
const VIEW_COMMANDS: Record<string, string> = {
    projects_list: 'demoBuilder.showProjectsList',
    dashboard: 'demoBuilder.showProjectDashboard',
    configure: 'demoBuilder.configureProject',
    logs: 'demoBuilder.showLogs',
};

const VIEW_NAMES = Object.keys(VIEW_COMMANDS) as [string, ...string[]];

/**
 * Register `open_view`.
 * @param server     McpServer (typed `any`; see registerProjectTools docstring).
 * @param runCommand Executes a VS Code command by id (injected; e.g.
 *   `(id) => vscode.commands.executeCommand(id)`).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerViewTools(server: any, runCommand: (commandId: string) => Promise<unknown>): void {
    server.registerTool(
        'open_view',
        {
            title: 'Open View',
            description: 'Open a Demo Builder view in VS Code (projects_list, dashboard, configure, logs). Requires confirm:true — opens a UI panel',
            inputSchema: {
                view: z.enum(VIEW_NAMES).describe('Which view to open'),
                confirm: z.boolean().optional().describe('Must be true — this opens a VS Code panel; ask the user first'),
            },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
            if (args?.confirm !== true) {
                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: 'open_view requires confirm:true — it opens a VS Code panel. Ask the user before opening a view.',
                        },
                    ],
                };
            }
            const commandId = VIEW_COMMANDS[args.view as string];
            await runCommand(commandId);
            return { content: [{ type: 'text' as const, text: JSON.stringify({ opened: args.view }) }] };
        },
    );
}
