/**
 * The one spelling of "an agent did this" in the VS Code window.
 *
 * Every notification the agent path raises — the progress card while a tool
 * runs, the status-bar flash when it finishes, the toast when it fails, the
 * consent dialog before a consequential one, the sign-in it asks for — opens
 * the same way, so a reader can tell at a glance which cards are the agent's.
 * Owner, 2026-09-12: the prefixes had drifted to four spellings ("Agent: …",
 * "Demo Builder — …", "Demo Builder: …", none), and one of them put two colons
 * in a row once VS Code added its own.
 *
 * @module features/ai/server/agentNotice
 */

/** The word, and the separator VS Code does not also use. */
export const AGENT_PREFIX = 'Agent ·';

/** "Agent · <text>" — for a title, a status line or a toast. */
export function agentNotice(text: string): string {
    return `${AGENT_PREFIX} ${text}`;
}
