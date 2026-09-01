/**
 * Editor tools — the confirm-gated things that act on the WINDOW rather than on a
 * project.
 *
 * Codifies the governing rule: no tool touches the user's editor unsolicited. The
 * agent offers conversationally; only on the user's confirmation does it call
 * `open_view(view, confirm:true)` or `reload_window(confirm:true)`, each of which
 * runs a VS Code command.
 *
 * Both live here because they need the same one thing — a command runner — and a
 * second module for a second tool would double the wiring and the registration
 * pins for nothing.
 *
 * vscode-free: the command runner is injected from `extension.ts` so this module
 * carries no vscode import.
 */

import { z } from 'zod';
import { asRawText, asText } from './mcpToolResult';
import type { McpToolServer } from './mcpToolServer';

/**
 * How long to wait before restarting the host.
 *
 * The reload tears down the extension host, which is what serves this very MCP
 * call — so the response must be written to the socket FIRST. Deferring by a tick
 * is not enough: the handler's return value still has to be serialized and
 * flushed. This is the margin for that, and it is deliberately generous, because
 * the failure mode is a caller who cannot tell a successful reload from a crashed
 * server.
 */
const RELOAD_DEFER_MS = 750;

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
export function registerViewTools(server: McpToolServer, runCommand: (commandId: string) => Promise<unknown>): void {
    server.registerTool(
        'open_view',
        {
            // Reviewed 2026-08-31: no service and no token on any path.
            needsAuth: false,
            // NOT read-only: it opens a panel in the user's window — same as open_url.
            annotations: { readOnlyHint: false, destructiveHint: false },
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
                return asRawText(
                    'open_view requires confirm:true — it opens a VS Code panel. Ask the user before opening a view.',
                );
            }
            const commandId = VIEW_COMMANDS[args.view as string];
            await runCommand(commandId);
            return asText({ opened: args.view });
        },
    );

    server.registerTool(
        'reload_window',
        {
            // Reviewed 2026-08-31: no service and no token on any path.
            needsAuth: false,
            // Destructive in the sense that matters: it restarts the extension
            // host and discards whatever was in flight in that window.
            annotations: { readOnlyHint: false, destructiveHint: true },
            title: 'Reload Window',
            description:
                'Restart the VS Code window so the extension host picks up a newly compiled bundle. Requires confirm:true — this discards in-flight work and drops the MCP socket. Use after `npm run compile` when a change to extension code must take effect.',
            inputSchema: {
                confirm: z
                    .boolean()
                    .optional()
                    .describe('Must be true — this restarts the editor window; ask the user first'),
            },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
            if (args?.confirm !== true) {
                return asRawText(
                    'reload_window requires confirm:true — it restarts the VS Code window and discards in-flight work. Ask the user before reloading.',
                );
            }

            // ANSWER FIRST. `workbench.action.reloadWindow` restarts the extension
            // host that is serving this call, so running it before the response is
            // flushed gives the caller a dropped socket instead of a result — and a
            // dropped socket is indistinguishable from a crash.
            setTimeout(() => {
                void runCommand('workbench.action.reloadWindow');
            }, RELOAD_DEFER_MS);

            return asText({
                reloading: true,
                inMs: RELOAD_DEFER_MS,
                note:
                    'The MCP socket will drop and rebind as the host restarts. Poll `node .claude/skills/mcp-live-probe/probe.mjs info` until it answers; its build stamp is also how you confirm the new bundle is the one now serving.',
            });
        },
    );
}
