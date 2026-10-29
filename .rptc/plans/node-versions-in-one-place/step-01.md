# Step 1: The register

**New module:** `src/core/node/nodeRequirements.ts` (core, because the shell, prerequisites,
App Builder, AI and lifecycle all read it; ADR-015: pure functions over imported data, no
`vscode`).

**Declarations, each in its own catalog, one field name `nodeVersion`:**

| Catalog | Entry | Value |
|---|---|---|
| `components.json` | `infrastructure.adobe-cli` | "24" (new; decision 1) |
| `components.json` | the three mesh entries | removed: the mesh runs through the Adobe CLI, so it uses the CLI's (decision 1) |
| `components.json` | `frontends.headless` | "24", unchanged |
| `app-builder-components.json` | three entries | "24", unchanged |
| `ai-defaults.json` | top level | "24", unchanged (AI-13) |

`components.schema.json` gains `nodeVersion` (pattern `^\d+$`) where entries carry it.

**Answers:**

- `nodeFor(id)`: the major for a component, catalog integration, tool, `adobe-cli` or
  `ai-tools`. Throws for an id that declares none and has no rule, so a missing declaration fails
  loudly instead of falling back.
- `nodesFor(project)`: every major the project needs: its installed components, its App Builder
  integrations (catalog or recorded), the AI tools when they apply (the same
  `aiDefaultsEntryApplies` gate), and `adobe-cli` when anything in the project uses it.
- `needsAdobeCli(id)`: whether a thing runs through `aio` (mesh, App Builder integrations).

It reads the bundled JSON imports (as `aiDefaultsInstaller` does), never the extension folder on
disk. That retires `getMeshComponentNodeVersion` and the disk read behind
`getInfrastructureNodeVersion`.

**Tests:** each answer for real catalog entries (read the bundled JSON, not a fixture, so a
catalog edit that breaks it fails here); `nodesFor` for an EDS project, a mesh project, a project
with an ERP pair, a bare project; an unknown id throws.
