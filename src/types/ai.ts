/**
 * AI Inventory Types
 *
 * Shared types for the AI inventory inspectors that back the Project
 * Dashboard's "AI Ready" health badge and "View Skills" capability surface.
 *
 * The three inspectors live in `src/features/ai/`:
 *   - `skillInspector.ts`     → SkillInventoryEntry[]
 *   - `mcpInspector.ts`       → McpInventoryEntry[]
 *   - `sessionMcpDetector.ts` → SessionMcpEntry[]
 *
 * The combined inventory is exposed on `AiVerificationResult.inventory`.
 */

/**
 * The Demo Builder skills written into every generated project, in the order
 * the AI Capabilities modal lists them.
 *
 * THIS IS THE ONE HOME for these filenames. `skillsWriter` builds its write list
 * from it and `skillInspector` classifies against it, because the two used to
 * keep separate copies and drifted: `diagnose-demo.md` was added to the writer
 * and not the inspector, so a first-party skill was filed under "Custom" in the
 * modal as though a user had written it.
 *
 * Adding a skill: add it here, add its content to `skillsWriter`'s content map,
 * and remember `AI_CONTEXT_VERSION` (see the `ai-context-authoring` skill).
 */
export const DEMO_BUILDER_ALWAYS_ON_SKILLS = [
    // Lifecycle
    'add-component.md',
    'sync-changes.md',
    'update-credentials.md',
    'create-eds-project.md',
    // Diagnosis
    'diagnose-demo.md',
    // Sample data
    'import-datapack.md',
    // EDS site-scraping
    'scrape-reference-site.md',
    'connect-authenticated-site.md',
    'commerce-block-mapper.md',
    'demo-data-injector.md',
    'header-nav-footer.md',
    'refine-visual-match.md',
    // Custom block authoring
    'register-custom-block.md',
    'remove-custom-block.md',
] as const;

/**
 * Demo Builder skills written only for some projects. Conditional delivery does
 * not make them third-party — they classify as `'demo-builder'` wherever found.
 */
export const DEMO_BUILDER_CONDITIONAL_SKILLS = ['extend-app-builder-app.md'] as const;

/**
 * Which ai-defaults MCP tool a generated skill DRIVES — the machine-readable
 * form of a relationship that previously lived only as prose inside skill
 * bodies. Values are `ai-defaults.json` entry `id`s (pinned by test; the JSON
 * is not imported here because this module also reaches webview bundles).
 *
 * Classified by READING each skill (2026-08-14), not by counting mentions:
 * `scrape-reference-site` routes between two workflows but actively instructs
 * Playwright use in workflow B; `connect-authenticated-site` is entirely the
 * Playwright `storageState` flow; `refine-visual-match` declares itself
 * Playwright-workflow-only. The other three scraping skills
 * (`commerce-block-mapper`, `demo-data-injector`, `header-nav-footer`) work on
 * already-scraped material and never touch the tool — an opt-out that removed
 * them would delete working capability.
 *
 * A skill missing from this map depends on no MCP tool. A guard test holds the
 * map against the template bodies in both directions, so a skill that starts
 * (or stops) instructing a tool fails until this map says so.
 *
 * The code ACTS on this map: `writeSkillFiles` gates delivery on it — a skill
 * whose tool is not usable by the project (entry doesn't apply, or its package
 * isn't installed in `.demo-builder-mcp`, per `resolveAvailableMcpToolIds`) is
 * not written, and a previously-delivered copy is reconciled through the
 * ADR-013 removal matrix. Gating filters DELIVERY only —
 * `DEMO_BUILDER_ALWAYS_ON_SKILLS` stays the classifier list, so a gated-out
 * skill found on disk still classifies as first-party.
 */
export const SKILL_MCP_TOOL_DEPENDENCIES = {
    'scrape-reference-site.md': 'playwright',
    'connect-authenticated-site.md': 'playwright',
    'refine-visual-match.md': 'playwright',
} as const satisfies Partial<Record<(typeof DEMO_BUILDER_ALWAYS_ON_SKILLS)[number], string>>;

/** Every filename that identifies a first-party skill, however it was delivered. */
export const DEMO_BUILDER_SKILL_FILES: ReadonlySet<string> = new Set<string>([
    ...DEMO_BUILDER_ALWAYS_ON_SKILLS,
    ...DEMO_BUILDER_CONDITIONAL_SKILLS,
]);

/**
 * Where a skill originated.
 *
 * - `'demo-builder'` — a top-level `.claude/skills/<filename>.md` listed in
 *   `DEMO_BUILDER_SKILL_FILES` above.
 * - `'adobe'` — any `.md` nested under a subdirectory of `.claude/skills/`.
 *   `skillsWriter` only creates subdirectories for Adobe skill bundles, using a
 *   `<prefix>-<name>/` layout. Which bundle it came from is carried separately
 *   in `bundle` — `'adobe'` alone means only "arrived in a bundle", so do NOT
 *   render it as the name of any one Adobe product.
 * - `'unknown'` — a top-level `.md` that is not first-party (a user-authored
 *   skill).
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
    /**
     * For `source: 'adobe'`, the bundle prefix its directory carries (`aem`,
     * `appbuilder`) — the only thing distinguishing one Adobe bundle from
     * another. Undefined for top-level skills and for a bundle directory with
     * no prefix separator.
     */
    bundle?: string;
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

/**
 * Combined inventory payload added to `AiVerificationResult.inventory`.
 *
 * Each inspector runs in its own `Promise.allSettled` slot in
 * `gatherInventory`. When an inspector throws, its list field comes back
 * empty and the matching `*Error` field carries a short diagnostic so the
 * UI can distinguish "no items" from "introspection failed."
 */
export interface AiInventory {
    skills: SkillInventoryEntry[];
    /**
     * Tool-driving skills this project QUALIFIES for but does not have, with
     * why ('setting-disabled' = the third-party opt-out; 'tool-missing' =
     * Regenerate installs it). Rendered by the AI Capabilities modal so an
     * absence has a stated reason. Computed by `gatedSkillReasons`
     * (aiToolingGate); absent on inventory paths that lack the project.
     */
    gatedSkills?: Array<{
        file: string;
        toolId: string;
        reason: 'setting-disabled' | 'tool-missing';
    }>;
    /** Set when `skillInspector` rejected; the corresponding `skills` list is empty. */
    skillsError?: string;
    mcps: McpInventoryEntry[];
    /** Set when `mcpInspector` rejected; the corresponding `mcps` list is empty. */
    mcpsError?: string;
    sessionMcps: SessionMcpEntry[];
    /** Set when `sessionMcpDetector` rejected; the corresponding `sessionMcps` list is empty. */
    sessionMcpsError?: string;
    /**
     * ADR-013: bundle files the user has edited — project-relative posix paths
     * whose current disk sha-256 differs from the hash recorded at the last
     * generate (`project.aiFileHashes`). Derived fresh on every verify, so it
     * stays current without persisting a skip log; the modal renders it as
     * "Edited — kept your version". Absent/empty when no hashes are recorded
     * (pre-ADR projects must show zero false "edited" flags).
     */
    editedFiles?: string[];
}
