/**
 * Visibility for agent-triggered MCP mutations.
 *
 * The first slice of the consent/visibility design
 * (`.rptc/backlog/2026-08-23-mcp-destructive-ops-native-consent.md`): an
 * MCP-invoked republish/sync/refresh/reset used to run for minutes against
 * live resources with ZERO VS Code surface — on 2026-08-23 a two-minute
 * library refresh's only evidence was the CDN's `last-modified` header,
 * because the probe client had timed out and the chat was elsewhere.
 *
 * This is the `longRunningNotifier` the in-extension MCP server injects
 * around every non-read-shaped tool call (`isReadOnlyToolName` decides —
 * an allowlist that fails closed into "mutating"):
 *
 * - WHILE the call runs: a `withProgress` notification names the operation,
 *   exactly like the dashboard button for the same work would.
 * - WHEN it ends: the OUTCOME lands in the window — a status-bar message on
 *   success (quiet; agent bursts must not stack toasts), a warning toast on
 *   failure. The agent's own report cannot be relied on to reach the user:
 *   a disconnected client or a closed chat swallows it, and both happened
 *   live the day this was built.
 *
 * The consent dialog (the design's second leg) slots into this same wrapper
 * later — before `run()`, same classification.
 *
 * @module features/ai/server/agentOperationNotifier
 */

import * as vscode from 'vscode';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types/logger';

/** `snake_case_tool` → "Snake case tool", for notification copy. */
function humanize(toolName: string): string {
    const words = toolName.replace(/_/g, ' ');
    return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Build the notifier the extension passes to `InExtensionMcpServer`.
 *
 * @param logger - extension logger (failures are logged as well as shown)
 * @returns the wrapper: runs the tool call inside a progress notification
 *          and lands its outcome in the window
 */
export function createAgentOperationNotifier(
    logger: Logger,
): (toolName: string, run: () => Promise<unknown>) => Promise<unknown> {
    return (toolName, run) =>
        Promise.resolve(
        vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Demo Builder — agent: ${humanize(toolName)}…`,
                cancellable: false,
            },
            async () => {
                try {
                    const result = await run();
                    vscode.window.setStatusBarMessage(
                        `$(check) Agent: ${humanize(toolName)} completed`,
                        TIMEOUTS.STATUS_BAR_SUCCESS,
                    );
                    return result;
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    logger.warn(`[MCP] agent operation ${toolName} failed: ${message}`);
                    // A toast, not a status-bar flash: a failed live-site
                    // mutation is the one outcome the user must not miss.
                    void vscode.window.showWarningMessage(
                        `Demo Builder — agent operation "${humanize(toolName)}" failed: ${message}`,
                    );
                    throw error;
                }
            },
        ),
        );
}
