---
name: ai-context-authoring
description: Change what Demo Builder generates into a project's AI bundle (skills, AGENTS.md, .mcp.json, ai-defaults MCPs) without stranding existing projects or desyncing creation vs regenerate. Use when adding/editing a generated skill or AGENTS.md section, touching ai-defaults.json or its gating, editing skillsWriter/aiContextWriter/mcpConfigWriter/aiDefaultsInstaller, or deciding whether AI_CONTEXT_VERSION must bump.
---

# AI Context Authoring

The generated-AI-bundle system: who writes what, where the gates live, and the two
disciplines that rot silently when skipped.

## Discipline 1 — hand-bump `AI_CONTEXT_VERSION` (src/core/constants.ts)

Bump it on ANY change to generated content: a skill template, an AGENTS.md section, MCP
config shape, or ai-defaults gating. The on-open freshness check compares each project's
stamp against this constant; without the bump, **existing projects never learn the bundle
changed** — no badge, no regenerate prompt, silent staleness. Record what each version
added in the comment above the constant.

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
declares its own gate via `requires` (`'eds-storefront'` = Playwright-style storefront-only;
`'app-builder-tooling'` = the predicate). New entries MUST declare it (schema-required).

## Who writes what

| Writer | Output | Gating pattern |
|---|---|---|
| `skillsWriter.writeSkillFiles` | `.claude/skills/*.md` | 12 always-on `DEMO_BUILDER_SKILLS`; conditional skills append to the `written` list (e.g. `extend-app-builder-app` on the predicate) |
| same, Adobe bundles | prefixed skill DIRS | Two SOURCES: component `aiSkillBundle` copies from the component's own `node_modules` (EDS/aem); the integration-starter-kit copies from `resolveMcpToolsDir()` (installed by the installer — ordering matters, install precedes writers on both paths). `copyAdobeSkillBundle` ENOENT-skips silently |
| `aiContextWriter.generateAgentsMd` | `AGENTS.md` | Section builders returning `''` when not applicable (e.g. `buildConsoleApiAccess`); sanitize every interpolated project value |
| `mcpConfigWriter` | `.mcp.json`, `.claude/mcp.json`, settings merge | demo-builder entry + per-entry ai-defaults gating; args anchored to the isolated tools dir |

Orchestrated by `generateAIContextFiles` (creation phase 6 + regenerate + update post-step).

## Test pins that move

- `skillsWriter.test.ts` — EDS projects pin an exact skill-file COUNT (13 as of v3);
  a new conditional skill bumps it and needs positive + negative (bare-project) cases.
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
