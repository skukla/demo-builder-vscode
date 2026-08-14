/**
 * Core extension constants
 */

/**
 * Global state key for tracking last update check version
 */
export const LAST_UPDATE_CHECK_VERSION = 'lastUpdateCheckVersion';

/**
 * Global state key for the timestamp (ms) of the last successful auto
 * update check. Read by `SidebarProvider.triggerUpdateCheck` to throttle
 * the auto-check across workspace reloads.
 */
export const LAST_UPDATE_CHECK = 'lastUpdateCheck';

/**
 * Current version of the AI context bundle (skills, AGENTS.md/CLAUDE.md, MCP
 * config, settings) the extension generates into each project.
 *
 * Hand-bump this integer whenever any AI-context template/skill changes — see
 * skillsWriter / aiContextWriter / mcpConfigWriter (all writing through the
 * GeneratedFileWriter seam, ADR-013). It is stamped into the project manifest
 * (`Project.aiContextVersion`) each time the bundle is generated. Since v8 a
 * stale stamp no longer prompts anyone: the activation sweep
 * (aiBundleActivationRefresh) silently refreshes tiers 1+2 with hash-and-skip
 * protection; only the freshness check's COMPOSITION axis (a package download
 * genuinely needed) still surfaces the badge + Regenerate.
 */
// v2: Developer Agent tooling (commerce-extensibility MCP + integration-starter-kit
// skills) un-gated from EDS-only to all App Builder-adjacent projects — existing
// mesh/headless projects need a regenerate to receive it.
// v3: extend-app-builder-app skill + AGENTS.md "Adding Adobe API Access" section
// (the list_console_apis / add_console_apis loop) for App Builder-adjacent projects.
// v4: per-integration addressing (shell instancing) — a project can hold N AI-built
// integrations, each under components/<id>/ with its own app.config.yaml + isolated
// OpenWhisk package; extend-app-builder-app rewritten + AGENTS.md "App Builder
// Integrations" section added (confirm WHICH integration before editing).
// v5: AGENTS.md "Finding Adobe Documentation" section — routes agents to Adobe's
// own Wayfinder doc router (adobe-commerce/wayfinder), pinned to a commit rather
// than @main so upstream cannot alter a generated project's instructions without
// our review. Re-pinning the SHA is itself a bundle change: bump this again.
// v6: the generated PostToolUse git-sync hook actually FIRES. It read a
// `$CLAUDE_TOOL_INPUT` env var Claude Code never sets, so `TOOL_FILE` was always
// empty and the hook silently did nothing on every EDS project ever generated —
// while sync-changes.md told the agent the hook handled commit+push, so it
// skipped sync_storefront and AI-authored block edits never reached the live
// site. Existing projects MUST regenerate to get a hook that works.
// v7: new always-on `diagnose-demo` skill. Of the twelve generated skills none
// covered DIAGNOSIS — every one told the agent how to DO something, so a read
// like get_store_structure had no home and nothing told an agent to check store
// scope when product pages come back empty. Routes symptom → check, and carries
// the two traps that read as false negatives: pushed is not published, and
// deploy_mesh does not regenerate `.env` (only a Configure save does).
// v8: hash-and-skip edit survival (ADR-013) + tiered refresh + Playwright-skill
// gating. Every bundle file flows through GeneratedFileWriter (sha-256 recorded
// in the manifest's aiFileHashes; user-edited files are skipped and reported,
// never overwritten). The activation sweep repairs config paths silently on
// every start and refreshes content when this stamp is stale — so this is the
// last bump that touches every project uninvited, and from v8 on version
// staleness never flips the badge (only a genuinely-needed package download
// does, via the composition axis). The three Playwright-driven skills are
// written only when @playwright/mcp is actually installed. This bump triggers
// the first silent tier-2 sweep on next activation; pre-v8 files get
// overwrite-once + hash recording (ADR-013 grandfather rule).
// v9: the AGENTS.md generated-file banner told users "hand edits are
// overwritten" — the exact opposite of v8's hash-and-skip behavior. Reworded
// to state the real trade: edits are kept but freeze the file at your version
// until you delete it and regenerate. First bump under the silent-sweep model:
// nobody is prompted; the activation sweep folds it in.
export const AI_CONTEXT_VERSION = 9;

/**
 * Component IDs for standardized component instance access
 *
 * These IDs match the component definitions in templates/components.json
 * and are used for type-safe access to componentInstances entries.
 */
export const COMPONENT_IDS = {
    /** Edge Delivery Services storefront component */
    EDS_STOREFRONT: 'eds-storefront',
    /** EDS-specific API Mesh (for EDS PaaS storefronts) */
    EDS_COMMERCE_MESH: 'eds-commerce-mesh',
    /** EDS-specific API Mesh (for EDS ACCS storefronts) */
    EDS_ACCS_MESH: 'eds-accs-mesh',
    /** Headless-specific API Mesh (for Next.js storefronts) */
    HEADLESS_COMMERCE_MESH: 'headless-commerce-mesh',
} as const;

/** Type for component ID values */
export type ComponentId = (typeof COMPONENT_IDS)[keyof typeof COMPONENT_IDS];

/**
 * All mesh component IDs
 *
 * Use isMeshComponentId() or hasMeshInDependencies() for type-safe checks.
 */
export const MESH_COMPONENT_IDS = [
    COMPONENT_IDS.EDS_COMMERCE_MESH,
    COMPONENT_IDS.EDS_ACCS_MESH,
    COMPONENT_IDS.HEADLESS_COMMERCE_MESH,
] as const;

/** Type for mesh component ID values */
export type MeshComponentId = (typeof MESH_COMPONENT_IDS)[number];

/**
 * Check if a component ID is a mesh component
 */
export function isMeshComponentId(componentId: string): componentId is MeshComponentId {
    return MESH_COMPONENT_IDS.includes(componentId as MeshComponentId);
}

/**
 * Check if dependencies array includes any mesh component
 */
export function hasMeshInDependencies(dependencies: string[] | undefined): boolean {
    return dependencies?.some((id) => isMeshComponentId(id)) ?? false;
}
