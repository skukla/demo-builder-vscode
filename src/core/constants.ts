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
// v10: `promote_block_to_library` is now confirm-gated, matching its inverse
// `remove_block_from_library`. It commits, pushes and publishes to the live
// site; being the ADDING half of the pair never made that safe, and the gap was
// an inconsistency rather than a policy. register-custom-block.md now passes
// `confirm: true` and says why — without this bump, existing projects keep the
// old skill text and the tool refuses every call it makes.
// v11: phase 5 (guidance). `diagnose-demo` was routing the FIRST symptom it
// names — "product page renders empty" — straight to `get_store_structure` and
// then to the Commerce admin. The classic cause is a refused Configuration
// Service write, which leaves a storefront that builds, pushes and browses and
// serves no product page; an agent following the old table found scope healthy
// and told the user their catalog was empty while it was fine. The tools that
// distinguish the two (`get_site_access`, `repair_site_configuration`) did not
// exist when that skill was written. It now routes there first, and also knows
// the rest of the Group 1 diagnosis tools and `get_settings`. New skill
// `import-datapack.md` teaches the six-call sample-data loop, whose worst trap
// is that `start_datapack_import` returns a RECEIPT and reporting it as an
// outcome is invisible — the user sees "imported" and an empty catalog.
// v12: the import scope now defaults to the PROJECT's website/store view rather
// than the service's `base`/`default`. Omitting the pair used to send nothing,
// so an agent that skipped `list_datapack_import_scopes` could import — or
// RESET — against a website nobody chose. `import-datapack.md` says so, and
// says to send both or neither.
// v13: the SECOND wrong route in diagnose-demo, found the same way as the first.
// "Catalog is empty everywhere" pointed at store scope and then the Admin, but
// `GET /V1/categories` returns only the default store group's subtree — so on a
// multi-root instance a successful import reads as a no-op and an agent reports
// an empty catalog that is not empty. The cause is usually a root category
// nobody assigned, which is an Admin step. import-datapack also gains the
// instance-level limits (B2B enablement, pre-existing scopes, unsupported
// customer segments) that no API can report.
// v14: `update-credentials.md` was telling agents that ALL credentials live in
// component `.env` files and to read them with `get_component_config`. Passwords
// and client secrets now live in the OS keychain, so that instruction is both
// wrong and harmful — an agent following it would find nothing and could "fix"
// the gap by writing the secret back into project files with
// `update_project_config`, undoing the protection. The skill now separates the
// two kinds of value, says a secret read as absent is deliberate, and routes the
// user to Configure. It also corrects `ACCS_ENDPOINT`, which is not a key that
// exists — the catalog calls it `ACCS_GRAPHQL_ENDPOINT`.
// v15: `diagnose-demo` had no entry for "my change is not on the site", the
// symptom an agent hits every time it edits a storefront file. With nothing
// routing it to git, one agent verified against the DEPLOYED SITE, read CDN
// propagation lag as lost commits, re-applied work that had never been lost,
// and filed a bug report about the extension force-pushing — which never
// happened. The skill now says to run `git log` before concluding anything, and
// gives the `gh api .../compare` check that settles a rewrite claim outright.
// v16: ai-defaults gains the `dropins` MCP entry (@dropins/mcp — 21 tools for
// the boilerplate storefront's drop-in components; verified live against a
// real storefront, every vendored dropin knownInRegistry) for EDS storefront
// projects, and un-freezes Playwright: ^0.0.75 was an exact pin (caret on
// 0.0.x allows nothing newer), now ~0.0.79 so patch releases install.
// v17: two skills told users first Playwright use downloads ~150 MB of
// Chromium. Measured false (2026-08-22): the MCP drives the installed Google
// Chrome by default — verified with the bundled-browser store empty on both
// shipped versions. The wrong claim made agents warn customers about a
// download that never happens; corrected to name the real case (Chrome-less
// machines only, via install-browser).
// v18: the type-scale oracle (backlog 2026-08-13). The boilerplate ships 36
// `--type-*` custom properties in styles/styles.css and NO generated guidance
// mentioned them (measured with controls), so agents authoring blocks picked
// font sizes by eye — "fonts are too small", unbounded visual iteration.
// AGENTS.md's Storefront section now carries the standing rule (read the
// scale, `font: var(--type-…)`, never invent a size), and the two scrape-flow
// skills (commerce-block-mapper, refine-visual-match) route typography fixes
// through the scale. Phrased as "read the properties", never a token list —
// the scale belongs to aem-boilerplate-commerce and a hardcoded list rots.
export const AI_CONTEXT_VERSION = 18;

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
