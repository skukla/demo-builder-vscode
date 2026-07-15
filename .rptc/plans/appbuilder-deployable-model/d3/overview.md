# Plan: ADR-011 D3 — retire the singular write-paths; one durable keyed model

**Status:** Scoped 2026-07-15 (TDD-ready step table; awaiting PM review). Parent plan:
[`../overview.md`](../overview.md). ADR: [`011-app-builder-deployables`](../../../../docs/architecture/adr/011-app-builder-deployables.md)
(Accepted; D1–D2 shipped, D3 pending). Grounding research:
[`../../../research/app-builder-integration-model/research.md`](../../../research/app-builder-integration-model/research.md).

> **Step 0 — RPTC re-init (ALWAYS FIRST on re-entry):** if context was cleared, re-invoke
> `/rptc:feat "Plan is approved, continue to implementation"`. Confirm baseline GREEN before Step 01.

---

## What D3 closes

D1 shipped the keyed model (`project.appBuilderComponents: Record<id, AppBuilderComponentState>`),
the kind-dispatch runner, and a **load-time** read-migration. D2 shipped the live mesh subscribe +
selection UX. **But the keyed model is runtime-only and shadowed by the surviving singular special
cases.** Confirmed 2026-07-15 (research doc + the "state-coherence seam", parent overview
§"Gaps"):

1. **The keyed map is never persisted.** `ProjectConfigWriter.writeManifest` serializes only the
   singular `meshState`/`appState`; `ProjectFileLoader` **rebuilds** `appBuilderComponents` from
   those two singletons on load (`migrateLegacyToAppBuilderComponents`). So durable state tops out
   at **1 mesh + 1 integration** — N-integration deploys evaporate on reload.
2. **Two parallel write paths write different state.** The **keyed runner**
   (`appBuilderComponentRunner` → detail-dashboard list + creation phase) writes
   `appBuilderComponents[id]`. The **singular path** (`deployMeshHeadless`/`deployAppHeadless` →
   projects-dashboard card grid + kebab Redeploy) writes `meshState`/`appState` + `*StatusSummary`
   and **never** `setAppBuilderComponent`. The two surfaces read different state and don't
   cross-update.
3. **The singular add path is guarded to one** (`addAppComponent` rejects a 2nd), contradicting the
   keyed model's N.
4. **`ow.package` isolation is applied only on the keyed path** — a legacy `deployAppHeadless` app
   deploy is un-isolated and can prune siblings.
5. **Redeploy from the projects-dashboard is singular** (`appState`, one app); per-integration
   redeploy is the target.
6. **Mesh is still special-cased** (own badge, own `meshState`/staleness, excluded from the keyed
   list). The ADR's whole point is mesh = one kind of deployable.

> The 2026-07-15 `appState` persistence fix (`f91669cb`) made the **singular** `appState` durable —
> correct for today's authority, and a stepping stone. D3 **supersedes** it: once the keyed map is
> the persisted source, the singular `appState` write-side is retired (Step 07).

## Component structure — what D3 guarantees (per `app-builder-integration-model` research)

The researched structure is: **each integration is its own `components/<id>/` folder (own repo, build,
deploy) → all deploy into ONE shared Adobe I/O workspace → coexisting because each carries a distinct
OpenWhisk package (`deriveOwPackage(id)`), which is the `aio app deploy` prune boundary.** That
structure already exists (D1 + shared `componentInstallation`); D3 must **preserve, consolidate, and
prove** it, not re-establish it:

- **Own folder:** produced by the shared `componentInstallation` install path. Step 05 collapses to a
  single add path → a single install path → the folder structure holds by construction.
- **Own isolated package:** `applyIsolatedPackages(componentPath, deriveOwPackage(id))`
  (`appConfigPackages.ts`). Today it runs on the **keyed runner** path only; the **singular
  `deployAppHeadless`** path is un-isolated (research gap). Step 03 closes this by routing every deploy
  through the isolating runner — no un-isolated path survives.
- **Own durable provenance:** each integration's `source {owner,repo,branch}` is a field on the keyed
  `AppBuilderComponentState`, so persisting the keyed map (Step 01) makes per-integration provenance
  durable — superseding the never-persisted `appBuilderComponentSources` map.
- **Independent lifecycle:** per-integration deploy/redeploy/remove (Steps 04/05) — remove undeploys
  only that integration's own package entities.

**Structural invariant D3 must not break (asserted by the Step-03 test below):** N integrations ⇒ N
folders `components/<id>/`, each deployed under a distinct `ow.package`, each removable without touching
the others. Component count ≠ App Builder project count (always 1).

## Non-negotiable discipline (from the ADR)

- **The `MESH_ENDPOINT` → `config.json` → CDN edge stays green throughout.** Migrate mesh runtime
  behind accessors with byte-identical `config.json` output; **never big-bang** the load-bearing edge.
  Mesh-runtime retirement is the LAST work, only after parity is proven.
- **RED-first every step.** Additive migration; old projects keep loading.
- **Public repo:** no secrets in the manifest; `appBuilderComponentSources` holds only owner/repo.

## Staged step plan (each RED-first; mesh edge green throughout)

| Step | Title | One-line | Key risk |
|---|---|---|---|
| 00 | RPTC re-init | Re-invoke the originating `/rptc:feat`; confirm worktree + baseline GREEN | — |
| 01 | **Persist the keyed map** | `writeManifest` serializes `appBuilderComponents`; `ProjectFileLoader` **prefers** it and falls back to the read-migration only when absent. + add `name?: string` to `AppBuilderComponentState` (the #4 integration-name home, persisted here) | Old projects with no keyed map must still load via migration (don't drop the fallback) |
| 02 | **One writer** | Route `deployMeshHeadless`/`deployAppHeadless` through `setAppBuilderComponent` (keyed) as the source of truth; `meshStatusSummary`/`appStatusSummary` derive from the keyed entry so the card grid + keyed list agree | Card-grid gating reads must move to the keyed accessor without a status regression |
| 03 | **One isolating deploy path** | Route every deploy (incl. the projects-dashboard singular `deployAppHeadless` path) through the isolating keyed runner so `applyIsolatedPackages(deriveOwPackage(id))` runs by construction — no un-isolated path survives. **Structural-invariant test:** N integrations ⇒ N `components/<id>/` folders, each under a distinct `ow.package`, remove undeploys only its own | Re-isolating an already-deployed legacy app changes its package → prune/orphan; live-workspace probe required (ADR load-bearing assumption) |
| 04 | **Per-integration redeploy** | Projects-dashboard kebab "Redeploy App" (singular) → per-integration by id, matching the keyed model | Kebab currently assumes one app; needs the id in scope |
| 05 | **One add/remove system** | Retire the guarded singular `addApp`/`removeApp`; consolidate onto keyed `addAppBuilderComponent`/`removeAppBuilderComponent`; drop the one-app guard (`getAppBuilderInstance` reject) | A caller still on the singular handler; remove-confirm + undeploy parity |
| 06 | **Mesh onto the unified model** | Mesh status/staleness/`providesEnvVars` read/write through the keyed mesh entry; **`config.json` output byte-identical** (golden test) | THE load-bearing edge — regression here breaks every storefront |
| 07 | **Retire singular write-side** | Once parity proven: `writeManifest` stops writing `meshState`/`appState` as authority (kept migration-readable for old projects); keyed map = single source. Update `state-ownership.md` + `base.ts` docs | Removing the fallback before every reader moved to the accessor |
| 08 | **Unify mesh in the dashboard UI** | Wire the built-but-unwired `AppBuilderComponentsList` on the dashboard and fold mesh in as a card (retire the special-case badge). Groundwork for the grid UX | Dashboard integration UI is dormant — wiring may surface prop-drop gaps (`showDashboard` already passes the data) |
| 09 | **Migration + reset completeness** | Old `meshState`/`appState` migrate to the keyed map on first write; reset reconstructs ALL keyed deployables | Silent data loss on malformed/partial legacy state |

## Test strategy

- **Migration round-trip:** a legacy `meshState`+`appState` project → load → keyed map → write →
  reload → identical (Step 01/09). Malformed/partial legacy state degrades safely.
- **One-writer agreement:** a deploy via the singular path and via the keyed runner leave the SAME
  `appBuilderComponents[id]` + status; card grid and keyed list read identical (Step 02).
- **Golden `config.json`:** mesh-endpoint → `config.json` output byte-identical before/after Step 06
  (the load-bearing edge).
- **Structural invariant (Step 03):** after adding N integrations, each lives in its own
  `components/<id>/`, each deploys under a distinct `ow.package` (no two share; none on
  `application`/`dx-excshell-1`), and removing one undeploys only its own package entities — via
  BOTH the projects-dashboard path and the keyed list (they now route through the same isolating
  runner). This is the "proper component structure" guard.
- **Per-integration lifecycle:** deploy/redeploy/remove one of N leaves the others untouched
  (Steps 04/05).
- Coverage: 100% on the migration + `config.json` + one-writer paths.

## Risks

- **The mesh → storefront edge (highest).** Contained by Step 06's golden test + accessor migration;
  mesh-runtime retirement (Step 07) only after parity is proven.
- **Dual-path data during the transition.** Steps 01→02 make the keyed map authoritative before
  Step 07 removes the singular write — so there's always one source, never two authorities.
- **Live-workspace behaviors** (package re-isolation on an already-deployed legacy app, undeploy
  prune completeness) — Step 03 needs a live probe, per the ADR's load-bearing assumption.

## Explicitly downstream (NOT D3)

- **The full dashboard grid UX** and the **wizard calm list** — the two prototyped surfaces
  (`../../../research/app-builder-integration-model/prototype-integrations-*.html`). D3 delivers the
  durable model + mesh-UI unification groundwork (Step 08); the calm grid/list presentation is the
  separate UX build on top. The **wizard calm list can ship independently** of D3 (it's the existing
  list, calmed + named) — naming durability just needs Step 01's `name` field.
- **Remote Adobe I/O project rename** (#5) — independent small fix, unrelated to D3.
- D4 (AI shell), D5 (package binding), D6 (app-only project) — additive, later.

## Kickoff prompt
> Implement ADR-011 D3 (`.rptc/plans/appbuilder-deployable-model/d3/overview.md`). Start at Step 01
> (persist `appBuilderComponents` in `writeManifest` + loader-prefer + add the `name` field), RED-first.
> Keep the `MESH_ENDPOINT`→`config.json` edge byte-identical throughout (golden test in Step 06); retire
> the singular `meshState`/`appState` write-side (Step 07) only after mesh parity is proven. The
> 2026-07-15 `appState` persistence fix (`f91669cb`) is superseded by Step 01/07.
