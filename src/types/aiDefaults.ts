/**
 * Type definitions for `src/features/project-creation/config/ai-defaults.json`.
 *
 * Declares the always-installed AI infrastructure (MCP servers) added to every
 * generated Demo Builder project alongside the `demo-builder` entry.
 *
 * @see src/features/project-creation/config/ai-defaults.schema.json
 */

export interface AiDefaultsMcpServer {
    /** Stable identifier used as the key in generated .mcp.json mcpServers map. */
    id: string;
    /** npm package installed as a devDependency on the storefront. */
    package: string;
    /** npm semver range (caret-pin matches Demo Builder's overall posture). */
    version: string;
    /** Command Claude Code runs to start the MCP server. */
    command: string;
    /** Arguments passed to command. Paths are relative to the storefront root. */
    args: string[];
    /** Human-readable description shown in the AI Configuration tab. */
    description: string;
}

export interface AiDefaults {
    mcpServers: AiDefaultsMcpServer[];
}
