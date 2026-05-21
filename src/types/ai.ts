/**
 * AI Inventory Types (Cycle C)
 *
 * Shared types for the AI inventory inspectors that back the Configure
 * screen's AI Setup tab (and the upcoming AI Configuration tab in Cycle D).
 *
 * The three inspectors live in `src/features/ai/`:
 *   - `skillInspector.ts`     → SkillInventoryEntry[]
 *   - `mcpInspector.ts`       → McpInventoryEntry[]
 *   - `sessionMcpDetector.ts` → SessionMcpEntry[]
 *
 * The combined inventory is exposed on `AiVerificationResult.inventory`.
 */

/**
 * Where a skill originated.
 *
 * - `'demo-builder'` — top-level `.claude/skills/<filename>.md` where the
 *   filename matches one of the three lifecycle skills `skillsWriter` writes
 *   (`add-component.md`, `sync-changes.md`, `update-credentials.md`).
 * - `'adobe'` — any `.md` nested under a subdirectory of `.claude/skills/`.
 *   `skillsWriter` only creates subdirectories for Adobe skill bundles
 *   (`@adobe-commerce/commerce-extensibility-tools`) using a
 *   `<prefix>-<name>/` layout, so any nested skill is treated as Adobe.
 * - `'unknown'` — a top-level `.md` that is not one of the three
 *   Demo Builder lifecycle skills (e.g., a user-authored skill).
 */
export type SkillSource = 'demo-builder' | 'adobe' | 'unknown';

export interface SkillInventoryEntry {
    /** Skill name — from YAML frontmatter `name:` field; falls back to filename basename. */
    name: string;
    /** Description from YAML frontmatter `description:` field, or `null` if absent. */
    description: string | null;
    /** Absolute path to the skill file. */
    path: string;
    /** Classification based on where the skill lives on disk. */
    source: SkillSource;
}

/** A single tool advertised by an MCP server's `tools/list` response. */
export interface McpToolEntry {
    name: string;
    description: string;
}

/** Inspection result for one server entry in `<project>/.claude/mcp.json`. */
export interface McpInventoryEntry {
    /** Server id — the key in `mcpServers` (e.g., `"demo-builder"`). */
    id: string;
    /**
     * - `'ok'` — server responded; `tools` populated.
     * - `'timeout'` — spawn or list call exceeded the per-server budget.
     * - `'error'` — server crashed, sent invalid responses, or lacks the
     *   `tools` capability. `error` contains a short diagnostic.
     */
    status: 'ok' | 'timeout' | 'error';
    tools?: McpToolEntry[];
    error?: string;
}

/**
 * A session-level MCP that the user has connected through Claude Code's
 * catalog (the `mcp__claude_ai_*` connectors).
 *
 * Best-effort detection: derived from `~/.claude.json`'s top-level
 * `claudeAiMcpEverConnected` array cross-referenced with
 * `~/.claude/mcp-needs-auth-cache.json`. Both files are undocumented
 * Claude Code internal state; the schema may change without notice.
 *
 * `needsAuth: false` means "not currently flagged for re-auth" — it is NOT
 * a hard "currently authenticated" guarantee.
 */
export interface SessionMcpEntry {
    /** Display name (e.g., `"claude.ai AEM Content - Prod"`). */
    displayName: string;
    /** True when listed in `mcp-needs-auth-cache.json`. */
    needsAuth: boolean;
    /** Unix-ms timestamp of the last time Claude Code flagged this MCP. */
    lastSeen?: number;
}

/** Combined inventory payload added to `AiVerificationResult.inventory`. */
export interface AiInventory {
    skills: SkillInventoryEntry[];
    mcps: McpInventoryEntry[];
    sessionMcps: SessionMcpEntry[];
}
