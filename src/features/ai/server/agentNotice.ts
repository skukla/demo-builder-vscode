/**
 * The one spelling of "an agent did this" in the VS Code window.
 *
 * Every notification the agent path raises — the progress card while a tool
 * runs, the status-bar flash when it finishes, the toast when it fails, the
 * consent dialog before a consequential one, the sign-in it asks for — opens
 * the same way, so a reader can tell at a glance which cards are the agent's.
 * Owner, 2026-09-12: the prefixes had drifted to four spellings ("Agent: …",
 * "Demo Builder — …", "Demo Builder: …", none). The owner chose "Agent:" for the
 * one spelling on 2026-11-13 (step-07 A2), replacing a middle dot, which reads as
 * AI-written.
 *
 * @module features/ai/server/agentNotice
 */

/** The word, and a colon. */
export const AGENT_PREFIX = 'Agent:';

/** "Agent: <text>" — for a title, a status line or a toast. */
export function agentNotice(text: string): string {
    return `${AGENT_PREFIX} ${text}`;
}
