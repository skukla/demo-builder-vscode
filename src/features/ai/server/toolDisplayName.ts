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
import { narrationFor } from './toolNarration';

export const SERVER_DISPLAY_NAME = 'Demo Builder';

/**
 * Words that must not be sentence-cased. Tool names are snake_case, so an
 * acronym arrives indistinguishable from a word — "reset_eds_project" became
 * "Reset eds project", which reads as a typo in a dialog a producer is being
 * asked to approve.
 */
/**
 * The chat's opening line for a tool call.
 *
 * Returns undefined when the tool has no authored phrase. Callers must say
 * NOTHING in that case — there is no fallback that derives words from the tool
 * name, because that derivation is what `toolNarration.ts` exists to remove.
 *
 * @param toolName - MCP tool name
 * @returns the line to show, or undefined if the tool has no phrase
 */
export function progressLabel(toolName: string): string | undefined {
    const phrase = narrationFor(toolName);
    return phrase ? `${SERVER_DISPLAY_NAME} · ${phrase}…` : undefined;
}
