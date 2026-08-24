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
    /** Human-readable description shown in the AI Overview screen. */
    description: string;
    /**
     * True for genuinely third-party tooling (published outside Adobe, e.g.
     * Playwright). Entries carrying this are additionally gated on the
     * `demoBuilder.ai.enableThirdPartyTools` setting — the escape hatch for
     * restricted environments. Skills that DRIVE such a tool
     * (`SKILL_MCP_TOOL_DEPENDENCIES`) are removed with it, atomically: a
     * skill instructing an agent to use a tool that is not there is worse
     * than no skill.
     */
    thirdParty?: boolean;
    /**
     * Which projects this entry applies to:
     * - 'eds-storefront': only projects with an installed EDS storefront
     *   (e.g. Playwright, which drives the EDS site-scraping skills).
     * - 'app-builder-tooling': any project doing App Builder-adjacent work —
     *   EDS storefront, mesh, or attached App Builder component (the
     *   Commerce Extensibility Developer Agent).
     * Evaluated by `aiDefaultsEntryApplies` (aiToolingGate.ts).
     */
    requires: 'eds-storefront' | 'app-builder-tooling';
}

export interface AiDefaults {
    mcpServers: AiDefaultsMcpServer[];
}
