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
 * skillsWriter / aiContextWriter / mcpConfigWriter. It is stamped into the
 * project manifest (`Project.aiContextVersion`) each time the bundle is
 * generated; the dashboard's on-open freshness check flags a project stale when
 * its stamp is older than this constant and offers to regenerate.
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
export const AI_CONTEXT_VERSION = 6;

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
