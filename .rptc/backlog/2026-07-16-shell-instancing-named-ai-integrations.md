# Shell instancing — N AI-built integrations via name-derived instance ids

## Provenance

Scoped 2026-07-16 from a direct user requirement during D3 live testing: *"What if I wanted the
Firefly integration AND the ERP integration to be built via AI and not imported?"* Today that is
impossible: "Build custom" commits the FIXED catalog id `app-builder-shell`, and the id is
simultaneously the folder name, the keyed-state key, and the `ow.package` derivation — selection
is id-deduplicated, so a second "Build custom" is a no-op. **One AI-built integration per
project.**

## Goal / Scope

Treat the blank shell repo as a **template, not an identity**. Picking "Build custom" prompts for
an integration name (the add flow already designed in
`.rptc/research/app-builder-integration-model/prototype-integrations-wizard.html`); the extension
derives a unique instance id from it and instantiates the shell under that id:

```
components/
├── firefly-image-gen/   ← cloned FROM skukla/app-builder-shell, id from the user's name
└── erp-sync/            ← second clone of the same template, different id
```

Everything downstream is already id-generic post-D3 — REUSE, do not rebuild:
- **Keyed state**: `appBuilderComponents[<instance-id>]` with the `name` field (added in D3
  Step 01 — this feature is what that field exists for) + `source` recording the template repo.
- **Runtime isolation**: `deriveOwPackage(instance-id)` → each instance gets its own OpenWhisk
  package automatically; N AI-built integrations deploy prune-safe in the one namespace.
- **Lifecycle**: per-id deploy/redeploy/remove + the per-id MCP tools already work.
- **Clone mechanics**: install-by-{id, cloneUrl} exists (`buildAppDefinition` /
  catalog-entry install path); an instance = the shell catalog entry with a generated id.

### Net-new work (the actual feature)
1. **Name-first add flow**: the "Build custom" branch of the Add-Integration modal gains the
   Integration-name field (per the wizard prototype); derive the instance id
   (`normalizeProjectName`-style slug), collision-check against existing component ids
   (fail-fast like `addAppComponent`'s duplicate-id guard).
2. **Instantiation**: commit the selection under the instance id with the shell's source as the
   clone URL; the executor/runner install path resolves the entry by the instance definition
   rather than a catalog lookup (mirror how custom-URL imports carry `appBuilderComponentSources`;
   the shell instance is "an import whose source is the shell template").
3. **Name threading**: user's name → keyed entry `name` → wizard rows + dashboard rows render it
   (`name ?? id` fallbacks already exist in the row resolvers from D3 Step 04).
4. **AI addressing**: `extend-app-builder-app` skill + AGENTS.md wording move from "the attached
   App Builder app" to per-integration addressing ("work in `components/<id>/`"); MCP tools are
   already per-id.

### Riders (pull forward, gated on this)
- **Promote-to-repo** ([`2026-07-13-promote-app-to-repo.md`](2026-07-13-promote-app-to-repo.md))
  becomes materially more important: N shell instances = N local-only codebases (delete the
  project, lose them all). Already re-scoped per-id post-D3.
- **D4 (scaffold-and-author, `aio app init`)** is partially subsumed: shell instancing IS the
  lightweight third acquisition mode. Reassess whether D4's `aio app init` path is still needed
  or the shell template covers it (YAGNI until a concrete non-shell scaffold need appears).

## Constraints

- **Gated on the D3 merge** — consumes D3's `name` field, per-id lifecycle, and isolation seams;
  do not build on the unmerged branch.
- Instance ids must be collision-free against ALL component ids (storefront/mesh/deps too — one
  `components/` namespace) and shell-safe (they feed `deriveOwPackage`).
- Public repo: instance `source` records only owner/repo of the template; nothing sensitive.
- The mesh dual-flow is untouched — instancing applies to `kind: 'integration'` only.
- Edit-mode round-trip: instance selections must survive edit (the §E `appBuilderComponentSources`
  persistence gap intersects here — an instance's template-source record needs the same durable
  home; solve together, don't fork).

## Kickoff prompt
> Implement shell instancing (`.rptc/backlog/2026-07-16-shell-instancing-named-ai-integrations.md`)
> via `/rptc:feat` AFTER the D3 branch merges. Start with the name-first add flow (the wizard
> prototype specifies the UX), derive collision-checked instance ids, and instantiate the shell
> catalog entry under the instance id — reuse the install-by-{id, cloneUrl} path and the keyed
> `name` field; do NOT build new state or isolation machinery (D3 provides it). Fold in the §E
> source-persistence home for instance template records. Reassess D4 scope at the end.
