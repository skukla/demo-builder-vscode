---
name: ai-context-authoring
description: Change what Demo Builder generates into a project's AI bundle (skills, AGENTS.md, .mcp.json, ai-defaults MCPs) without stranding existing projects or desyncing creation vs regenerate. Use when adding/editing a generated skill or AGENTS.md section, touching ai-defaults.json or its gating, editing skillsWriter/aiContextWriter/agentsMdSections/mcpConfigWriter/aiDefaultsInstaller, or deciding whether AI_CONTEXT_VERSION must bump.
---

# AI Context Authoring

The generated-AI-bundle system: who writes what, where the gates live, and the two
disciplines that rot silently when skipped.

## Discipline 1 — hand-bump `AI_CONTEXT_VERSION` (src/core/constants.ts)

Bump it on ANY change to generated content: a skill template, an AGENTS.md section, MCP
config shape, or ai-defaults gating. Since v8 the stamp drives the ACTIVATION SWEEP
(`aiBundleActivationRefresh`), not a prompt: a stale project is silently refreshed
(tiers 1+2, hash-and-skip protected) on the next extension start. Without the bump,
**existing projects never learn the bundle changed** — no sweep refresh, silent
staleness. The freshness check's badge now fires ONLY on the composition axis (a
package download genuinely needed). Record what each version added in the comment
above the constant.

## Discipline 1b — every bundle write goes through `GeneratedFileWriter` (ADR-013)

`generatedFileWriter.ts` is the single hash-and-skip write path: sha-256 per file,
recorded in the manifest's `aiFileHashes`; a user-edited file is skipped + reported,
never overwritten; removal needs positive proof (hash match, or byte-equal to today's
template). A writer that calls `fsPromises.writeFile` directly for a bundle file
reverts that file to overwrite behavior — the review grep is "zero direct writeFile in
skillsWriter/aiContextWriter/mcpConfigWriter". The tier API lives in
`aiBundleService.ts` (`refreshMcpConfigs` = tier 1 configs, `refreshContextAndSkills`
= tier 2 content, `generateAIContextFiles` = both + stamp); tier 3 stays
`installAiDefaultsMcpTools`. The three Playwright-driven skills
(`SKILL_MCP_TOOL_DEPENDENCIES` in `@/types/ai`) are written only when
`@playwright/mcp` is installed, and removed (with proof) when it is not.

## Discipline 2 — the gate has FOUR seams; change all or none

`projectNeedsAppBuilderTooling` / `aiDefaultsEntryApplies` (`aiToolingGate.ts`) decide who
gets the App Builder tooling (EDS storefront OR mesh instance OR attached App Builder
component). It is applied at:

1. `mcpConfigWriter.buildMcpConfig` — which ai-defaults entries land in `.mcp.json`
2. `aiDefaultsInstaller.installAiDefaultsMcpTools` — which packages npm-install into the
   isolated `.demo-builder-mcp/` dir (no-ops when nothing applies)
3. `componentInstallationOrchestrator` — the creation-time install call
4. `aiHandlers.handleRegenerateAiFiles` — the regenerate-path install call

Miss one and creation and regenerate produce different bundles. Each ai-defaults entry
declares its own gate via `requires`. The third-party opt-out
(`demoBuilder.ai.enableThirdPartyTools`, entries flagged `thirdParty`) is deliberately
NOT a fifth seam: it lives inside `aiDefaultsEntryApplies` via an injected resolver
(`setThirdPartyToolsResolver`, wired at activation), so every seam inherits it — and
`registerThirdPartyToolingSettingListener` makes re-enabling install. Each entry (`'eds-storefront'` = Playwright-style storefront-only;
`'app-builder-tooling'` = the predicate). New entries MUST declare it (schema-required).

## Who writes what

| Writer | Output | Gating pattern |
|---|---|---|
| `skillsWriter.writeSkillFiles` | `.claude/skills/<name>/SKILL.md` dirs | names in `DEMO_BUILDER_ALWAYS_ON_SKILLS` (v27 moved them off flat `<name>.md` — the flat layout is never REGISTERED as a skill by Claude Code, measured 2026-08-27) (3 delivery-gated via `SKILL_MCP_TOOL_DEPENDENCIES`); conditional skills append to the `written` list (e.g. `extend-app-builder-app` on the predicate) |
| same, Adobe bundles | prefixed skill DIRS | Two SOURCES: component `aiSkillBundle` copies from the component's own `node_modules` (EDS/aem); the integration-starter-kit copies from `resolveMcpToolsDir()` (installed by the installer — ordering matters, install precedes writers on both paths). `copyAdobeSkillBundle` ENOENT-skips silently |
| `aiContextWriter.generateAgentsMd` | `AGENTS.md` | Section builders returning `''` when not applicable (e.g. `buildConsoleApiAccess`; builders live in `agentsMdSections.ts`); sanitize every interpolated project value |
| `mcpConfigWriter` | `.mcp.json`, `.claude/mcp.json`, settings merge | demo-builder entry + per-entry ai-defaults gating; args anchored to the isolated tools dir |

Orchestrated by `generateAIContextFiles` (creation phase 6 + regenerate + update post-step).

## Test pins that move

- `skillsWriter.test.ts` — EDS projects pin an exact skill-file COUNT (14 as of v7:
  13 always-on + `extend-app-builder-app`); a new conditional skill bumps it and needs
  positive + negative (bare-project) cases.
- `aiContextWriter.writeAgentsMd.test.ts` — add section presence/absence tests.
- `aiHandlers-setup.test.ts` / `aiHandlers-toolingGate.test.ts` — regenerate gating;
  NOTE its `testUtils` mocks the services barrel: a new export used by `aiHandlers`
  must be added to the mock (use `jest.requireActual` for pure predicates).
- `mcpConfigWriter.test.ts` — entry presence per project shape.

## Regenerate parity rule

Anything creation writes, "Regenerate AI Files" must reproduce for a project that gains
the qualifying component LATER (dashboard add). If a new artifact depends on an install,
verify the regenerate path installs first (it does — keep it that way).

## Related

Docs to sync on bundle changes: `src/features/ai/README.md`, `src/features/CLAUDE.md`
(ai + skillsWriter blurbs), `docs/systems/mcp-server.md` §12.
