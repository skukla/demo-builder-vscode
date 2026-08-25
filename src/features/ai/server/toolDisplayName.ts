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

/**
 * Words that must not be sentence-cased. Tool names are snake_case, so an
 * acronym arrives indistinguishable from a word — "reset_eds_project" became
 * "Reset eds project", which reads as a typo in a dialog a producer is being
 * asked to approve.
 */
const ACRONYMS: Record<string, string> = {
    // Proper nouns belong here too — snake_case lowercases them exactly like an
    // acronym. "Create adobe project" was shipping in a consent dialog because
    // this map was written from imagination rather than from the tool list; a
    // sweep of all 103 names found it. Re-run that sweep when adding tools.
    adobe: 'Adobe',
    eds: 'EDS',
    ai: 'AI',
    mcp: 'MCP',
    api: 'API',
    apis: 'APIs',
    url: 'URL',
    urls: 'URLs',
    accs: 'ACCS',
    io: 'I/O',
    cdn: 'CDN',
    github: 'GitHub',
    dalive: 'DA.live',
    sku: 'SKU',
    pdp: 'PDP',
};

/** `reset_eds_project` → "Reset EDS project". */
export function humanize(toolName: string): string {
    const words = toolName.split('_').map((w) => ACRONYMS[w] ?? w);
    const [first, ...rest] = words;
    if (first === undefined) return '';
    const head = ACRONYMS[toolName.split('_')[0]]
        ? first
        : first.charAt(0).toUpperCase() + first.slice(1);
    return [head, ...rest].join(' ');
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
