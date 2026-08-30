# Features

Each feature owns a vertical slice — services, types, UI, and the handler map that
backs both its webview and its MCP tools. Grouped by what it does for the user, not
by technical layer.

```
ai/                  AI context verification + the in-extension MCP server
app-builder/         attach, deploy, remove N App Builder integrations (→ README.md)
authentication/      Adobe auth, Console SDK, token management
components/          component registry and lifecycle
dashboard/           project dashboard (detail view) and Configure
data-installer/      browse the Data Installer service's datapack catalog and
                     install packs into a project's Commerce backend
eds/                 Edge Delivery Services (→ README.md)
lifecycle/           start, stop, restart a demo
mesh/                API Mesh deployment and verification
prerequisites/       tool detection, install, version checking
project-creation/    the wizard, templates, and the generated AI bundle
projects-dashboard/  the home screen card grid
sidebar/             contextual navigation (WebviewViewProvider)
updates/             auto-update for the extension and components
```

## Import rules

Features import `@/core/*` and `@/types`. **A feature does not import another
feature** — if two need the same thing it moves to `core/`. Commands are the
exception, because orchestrating features is their job. Enforced by eslint.

**Deep imports are the convention for features.** Import the module that defines the
symbol (`@/features/authentication/services/authenticationService`), not a feature
`index.ts`, and do not add a new feature barrel. This does NOT apply to `@/core/*`
or `@/types`, which are imported through their barrels by design — `@/types` has 168
importers, `@/core/shell` 104, `@/core/di` 86. See
[ADR-022](../../docs/architecture/adr/022-barrel-files.md) for the rule and the
measurement.

Nothing under `src/core/` imports a feature; that direction is enforced separately
by the `layerDirection` ledger.

## The features with behaviour you cannot infer from the source

The rest of the list above is what its name says. These are not.

### ai

`verifyAiSetup` checks that `.claude/CLAUDE.md`, `.claude/mcp.json`, the MCP binary
and `.claude/skills/` are present and valid; it feeds the dashboard's "AI Ready"
badge. `gatherInventory` runs three inspectors through `Promise.allSettled`, so a
failing inspector degrades to an empty list with a diagnostic field rather than
taking the panel down.

`inspectAllServers` probes each `.claude/mcp.json` server — third-party ones through
the MCP SDK's stdio client, the in-extension `demo-builder` server through a **direct
socket probe with no subprocess**. 15s per server, 5-minute success-only cache, and
an env allowlist on the spawned path so host secrets do not leak into a third-party
server.

`InExtensionMcpServer` runs on a per-workspace Unix socket and reuses extension
services, so an agent tool does the same work as the button. Clients reach it through
the `dist/mcp-proxy.js` stdio↔socket forwarder. Full reference:
[`docs/systems/mcp-server.md`](../../docs/systems/mcp-server.md).

### app-builder

Attach, deploy and remove **N** custom App Builder integrations, dashboard-first. A
sibling of the mesh deploy path, not a fork: since ADR-011 D3 they share one state
model, the keyed `project.appBuilderComponents` map (`kind: 'mesh' | 'integration'`),
which is the single persisted authority. The mesh is one component kind in that map.
The singular `meshState`/`appState` fields are legacy-read-only — manifests migrate
on load and forward-migrate on first save.

Add and remove are additive and per-id (`appBuilderComponentRunner.ts`): add leaves
siblings untouched, keys the entry, and reconciles the selection lists; remove
undeploys remotely, then cleans up only that integration's files and keyed state.

**Reconciling selections is the part that bites.** A parallel `appComponentManager`
once owned add/remove and was the only code maintaining `componentSelections`. When
the runner took over it went callerless and was deleted — but while it lived,
dashboard-added components went unselected and project reset dropped them.

Every per-integration deploy, UI and agent alike, goes through the keyed runner.
There is deliberately no headless variant: `deployAppHeadless` was retired once its
last caller went, because being UI-free is the wrong goal for an agent-triggered
deploy — that is precisely when the user needs telling.

Rename changes the display name only. The id, folder and `ow.package` are immutable.

### dashboard

Handler maps for the dashboard, the Configure screen, and the standalone AI surface.
AI prompts are scope-routed by `pinned`: pinned prompts persist in globalState and
appear in every project, unpinned ones live in the current project's manifest, and a
pin toggle is a cross-scope move.

**The status placement rule** — stated in full at the top of `ActionGrid.tsx`:
environment health goes in the masthead band; artifact state goes to the ActionGrid
zone that owns the part, as a **remedy tile** — the button that fixes it, wearing an
amber dot when due, with a tooltip saying why.

The rule exists because the Frontend badge broke it: the badge sat in the band while
its remedies sat in the grid, so it was the only status that named a problem and
offered nothing to do about it. Note which tile takes the dot — `Republish`, not
`Sync Storefront`, because Sync pushes storefront *code* and never clears the
storefront status summary.

**Every dotted tile goes through `DashboardTile`**, whose `status` prop carries the
dot and its tooltip as one value, so a dot with no explanation is not expressible.
The integrations tile shipped exactly that for months before it was enforced.

AI health and AI capability are separate on purpose: the passive "AI Ready" badge
reflects setup health, while a distinct "View Skills" link opens the capability
catalogue and carries Regenerate AI files.

### eds

The largest feature. Beyond the obvious GitHub/DA.live/Helix services:

`configServiceAccess` is the admin-role side of the Configuration Service — org
roster reads, site grant read/write, and `probeConfigWriteAccess`, the 403→200
oracle. Use `ensureSiteAdmin`/`revokeSiteAdmin`, which read-merge-write.
`grantSiteAdmin` is module-private **because it REPLACES the role list.**
`restoreSiteRoles` re-applies grants captured before a delete/re-register cycle, and
an edit refuses to save when the current list cannot be read.

`configAccessRecovery` telegraphs access to both the log and the wizard *before* the
write that depends on it, then verifies by polling. `siteConfigRegistrar` owns the
409/401/403 registration protocol shared by the wizard, the reset path and the repair
command. `repairSiteConfigHeadless` takes `verified` from a read-back, never from the
write's own status.

The recurring shape here: **every mutation is confirmed by a re-read**, because these
APIs return success for writes that did not take effect.

### project-creation

The wizard, plus the generated AI bundle. Three writers, all landing through the
ADR-013 hash-and-skip seam so a user-edited file is never overwritten:

- `aiContextWriter.ts` — `AGENTS.md` at the project root, with `CLAUDE.md` and
  `.claude/CLAUDE.md` as one-line `see @AGENTS.md` pointers. Section content lives in
  `agentsMdSections.ts`. The Adobe documentation section is **pinned to a commit**,
  never `@main`, because that line becomes part of an agent's instructions inside a
  user's repo. Re-pinning is a bundle change: bump `AI_CONTEXT_VERSION`.
- `mcpConfigWriter.ts` — `.claude/mcp.json`, `.mcp.json`, `.claude/settings.json`.
  Cursor and Codex read `.mcp.json` natively, so there are no per-tool config files.
- `skillsWriter.ts` — the always-on skills, written as `<name>/SKILL.md` directories,
  which is the only shape Claude Code registers as invocable.

Which skills a project gets follows **what it builds**, not what it has installed —
the gate lives in `aiToolingGate`. Changing that gate means changing all four of its
seams; see the `ai-context-authoring` skill.

### sidebar

One rendered layout across all three context types: a centred AI zone plus the
utility bar. AI access is global because MCP is wired at the extension level, not per
project. The wizard and Configure are **not** sidebar contexts — they own their own
surfaces.

## Adding a feature

Create the directory, put business logic in `services/`, keep feature-specific types
beside it, add a README only if the feature has behaviour a reader would otherwise
have to infer, and add a row to the list at the top of this file.

Tests do **not** live beside the source. They mirror `src/` under `tests/` — 1,202
test files are there and none are under `src/`. See
[`tests/README.md`](../../tests/README.md).

## Related

- [`../core/CLAUDE.md`](../core/CLAUDE.md) — the infrastructure features build on
- [`../CLAUDE.md`](../CLAUDE.md) — source layout and import aliases
