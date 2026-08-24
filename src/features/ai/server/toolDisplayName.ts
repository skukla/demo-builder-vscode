/**
 * Human-readable naming for agent-visible tool activity.
 *
 * Deliberately vscode-free so BOTH consumers can share it: the VS Code notifier
 * (`agentOperationNotifier.ts`, which does import vscode) and the MCP progress
 * announcer inside `inExtensionMcpServer.ts` (which must not — it is bundled on
 * the path that also serves the vscode-free `registerProjectTools`).
 *
 * Shared rather than copied because these strings are USER-FACING on two
 * surfaces at once. The same operation showing as "Deploy mesh" in the VS Code
 * notification and "Deploying mesh" in the chat reads as two different things
 * happening.
 *
 * @module features/ai/server/toolDisplayName
 */

/**
 * How this MCP server introduces itself in agent-visible text.
 *
 * The wire name is `demo-builder` (see `SERVER_NAME`), which is an identifier,
 * not a display name. Attribution matters because a chat can have several MCP
 * servers active at once — an unattributed "Deploying to Runtime…" is ambiguous
 * the moment a second server is connected.
 */
export const SERVER_DISPLAY_NAME = 'Demo Builder';

/** `snake_case_tool` → "Snake case tool". */
export function humanize(toolName: string): string {
    const words = toolName.replace(/_/g, ' ');
    return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The line an agent's chat shows while a tool runs, e.g.
 * "Demo Builder · Deploy mesh…".
 *
 * Attributed, because the point is telling the user WHICH tool of WHICH server
 * is responsible for the wait.
 */
export function progressLabel(toolName: string): string {
    return `${SERVER_DISPLAY_NAME} · ${humanize(toolName)}…`;
}
