# Step 1 — Un-gate the Developer Agent tooling for App Builder projects

## Goal

Any project carrying an App Builder component OR a mesh gets the Adobe Commerce
Extensibility Developer Agent tooling (the `commerce-extensibility` MCP from
`ai-defaults.json`, plus its skills) installed and configured — today only EDS-storefront
projects do.

## Where the gates live (verified)

1. **`mcpConfigWriter.buildMcpConfig`**
   (`src/features/project-creation/services/mcpConfigWriter.ts:331-342`): ai-defaults MCP
   entries are appended only when `resolveStorefrontPath(project)` returns a path. The
   comment says "headless projects (no storefront) get no MCP tooling."
2. **`installAiDefaultsMcpTools`**
   (`src/features/project-creation/services/aiDefaultsInstaller.ts:74`): find its call
   site(s) in `projectFinalizationService` / update post-step and check what gates the call.
3. **Skills**: the Adobe skill bundle rides `aiSkillBundle` on the EDS storefront component
   definition (`skillsWriter.writeSkillFiles`, `skillsWriter.ts:134-145`). Decide the
   attachment point for app-builder projects: either declare `aiSkillBundle` on a component
   definition that app-builder projects always carry, or add an explicit app-builder branch
   in `writeSkillFiles` keyed on `project.appBuilderComponents` / mesh presence.

## Design decisions

- **New predicate, one place**: `projectNeedsAppBuilderTooling(project)` — true when the
  project has any `appBuilderComponents` entry, any mesh (`components.dependencies`
  mesh id or `meshState`), or an EDS storefront. Use it in both gates. Keep Playwright
  gated on the storefront only (it exists for the EDS site-scraping skills).
- **Regeneration parity**: "Regenerate AI Files" and the update post-step must apply the
  same predicate so an integration added post-creation (dashboard add) gains the tooling on
  regenerate.
- The `#token_type=bearer…` fragment in the reference URL is an auth artifact — the doc
  page is `developer.adobe.com/commerce/extensibility/developer-agent/`.

## TDD

- `mcpConfigWriter.test.ts`: config for a headless project WITH a mesh/integration now
  includes `commerce-extensibility` (and NOT `playwright`); a bare headless project without
  either still gets neither.
- Installer test: `installAiDefaultsMcpTools` invoked for app-builder projects; package set
  excludes Playwright when no storefront.
- Skills test: extensibility skills present for an app-builder project without a storefront.

## Out of scope

- Any change to what the extensibility package itself does; we only widen delivery.
