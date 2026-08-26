---
id: DI-1
kind: feature
area: data-installer
needs: []
value: med
status: backlog
layer: F
---
# Datapack authoring loop — export, modify, publish-your-own via project skills

## Index hook

*The item in one paragraph. Moved off the index 2026-08-26, which carried a second copy that drifted from this file.*

Filed 2026-08-23 from user direction: a project's agent should carry the whole loop — export a datapack, modify it for a use case, publish your own version — through skills visible in the skills modal, with the instance as the working copy and export as the atomic commit. More exists than expected (export tools + modal + the `import-datapack` skill's capture guidance are all live), and the one blocker — **the export store-step lacks its database address (`MONGO_URI`) on the shared stage deployment, re-confirmed live 2026-08-23** (root cause in `docs/systems/data-installer.md` §6b). The architecture is unchanged: one shared service, the extension purely its client — the fix is a one-variable config-set + redeploy by whoever OPERATES the service now, and it fixes export for every SC at once. A personal throwaway deployment is recorded in the item as an optional testing stopgap only, explicitly not the design. Own-version publishing is CLOSED as the service's designed workflow (create a private `shared: false` pack, export versions into it, selective per-type filters — service docs distilled in [`../research/data-installer-service-docs/research.md`](../research/data-installer-service-docs/research.md); raw exports gitignored). The Bodea differentiation is the acceptance test — targeting a user-owned private pack, never the shared `bodea`. **The Postman collections (2026-08-23) revealed the full API and a route that works TODAY**: data-item editing (add/update/delete/batch-get, `add-data-item` proven on stage), version PROMOTE (the atomic-commit semantics), pack lifecycle, async+poll — so the pack-first half of the tools/skill is buildable now. The storage architecture is **OPEN with a binding constraint (2026-08-23): ONE pack registry** — the packs live in the database, so any new deployment is a second registry and the org's packs diverge. Three shapes in the item, preference-ordered: adopt/fix the existing deployment in place (exhaust first — the ask is workspace handover, not a variable); full cutover (App Builder Database migration + copy the registry + EVERY consumer repoints); or partition (shared packs read from the original, user packs in the new service, per-source routing). An organizational decision the user drives; the App Builder Database research stands whichever shape wins.

**↳ Acceptance milestone — Bodea's shared catalogs assign identical categories** ([`2026-08-17-bodea-shared-catalogs-are-undifferentiated.md`](2026-08-17-bodea-shared-catalogs-are-undifferentiated.md))

**Measured, and it changes what the Bodea demo can claim.** Picked up 2026-08-23: a concrete differentiation proposal is in the item — REVISED the same day after comparing against the actual pack data (drop only `software`/`wi-fi`/`critical-power-equipment` from ServerSavvy Solutions; the structural `bodea` root and `products` container stay in every catalog, since dropping a structural ancestor can hide its children from tree queries; Default and Platinum Buyer untouched so the tier-price demo is unconfounded). Re-measure satisfied by provenance: `get_datapack` shows `bodea@main` unchanged since 2026-06-18, which predates the measurement. **No pack change is needed to implement it** (clarified same day): the pack rows are only the import seed — an SC can apply the differentiation on any live instance via the Admin's Set Pricing and Structure today (per-instance, reset re-seeds it), and the durable form is a request to the pack's owner (CoreTech) or a versioned fork. Sequence: prove demo-locally first, then pursue the pack change. **The user is applying the instance edits himself (2026-08-23)** on a running Bodea-connected demo; the round trip back into a pack is the acceptance test of [`2026-08-23-datapack-authoring-loop.md`](2026-08-23-datapack-authoring-loop.md). Original finding: all three shared catalogs — Default (General), ServerSavvy Solutions, Platinum Buyer — assign the SAME 11 categories, compared as sets against the live service. So a nav driven by shared-catalog assignment, which is the correct mechanism, would render an identical menu for every company and group: the mechanism is right and the data has nothing to express. This is the real reason VIP nav gating was deferred; the "no clean patch insertion point in header.js" reason recorded in the plan is true but secondary. What the pack DOES demonstrate is price, not visibility — 49 of 56 products carry `tier_prices` naming "Platinum Buyer". Also records why `bodea-customer-group.js` is NOT redundant with shared catalogs: the catalog decides what the price is, the module tells Catalog Service who is asking, and deleting it silently shows guest prices to everyone, which looks like the demo working. If catalog-driven menus are wanted it is a DATA change first (differentiate the catalogs), then a new nav block reading Catalog Service — never a gate over the authored `/nav` document, which would drift toward showing what should be hidden. Filed 2026-08-17.

**Filed:** 2026-08-23, from user direction while closing the Bodea
differentiation question. The Bodea change is this feature's first live test.

## The user story (the spec, verbatim intent)

A user in a Demo Builder project should be able to — via the skills available
to him in that project — **export a datapack, update its data to support his
use case, and publish his own version of that pack.** The agent should have
enough context to recognize **atomic updates to the same pack**. If the task
spans multiple tools, skills, or agents across MCPs or other sources, **the
demo-builder MCP provides the orchestration skills**, and those skills appear
in the skills modal.

## What EXISTS today (verified 2026-08-23, live probe + repo record)

- **Export tools are built and exposed**: `list_datapack_export_items` →
  `start_datapack_export` (confirm-gated; takes datapackName + version +
  commerceInstance + dataTypes), plus the dashboard's `ExportDatapackModal`.
- **The generated `import-datapack` skill already covers the capture
  direction** ("captures data back out into a pack") — project agents have
  import, reset, validate AND export guidance today.
- **Skills modal is automatic**: `inspectSkills` walks `.claude/skills/`, so
  any generated orchestration skill appears in the AI Capabilities modal with
  no extra wiring.
- **The natural atomicity model already fits the service**: the INSTANCE is
  the working copy — N edits (Admin, REST, agent tools) accumulate there —
  and **export is the commit**, capturing the whole state into a pack
  identity in one call. "Recognizing atomic updates" is therefore a skill-
  guidance problem (edit freely, export once, name the version), not a new
  mechanism.

## The gaps (ordered by hardness)

1. **The export store-step lacks `MONGO_URI` on the service's stage
   deployment — a KNOWN, MEASURED deployment gap, not an open question.**
   (A first draft of this item called it an "unexplained defect needing
   owner diagnosis" — that took the plan HANDOFF's stale framing over the
   corrected record. `docs/systems/data-installer.md` §6b measured the root
   cause on 2026-08-14: the export processor fetches instance data fine and
   500s storing it — "MongoDB connection URI required" — which explains
   every observation including the types that "succeed" with zero items.)
   **Re-confirmed live 2026-08-23** via `start_datapack_export` against the
   user's Bodea instance: the two custom customer groups cleared the
   exclusion rules (`excluded: 0`) and failed at the store step with the
   same message. The ask to the service side is a DEPLOY ACTION, five
   minutes, not an investigation: `aio app config set MONGO_URI …` +
   redeploy for the export path (and ideally `COMMERCE_INSTANCE_URL_TEMPLATE`,
   which blocks `get-export-items` instance resolution — same section). The
   secret is the service's own; the extension neither holds nor sends it.
2. ~~"Publish his own version" semantics~~ — **CLOSED 2026-08-23: it is the
   service's DESIGNED workflow** (service docs, distilled in
   `.rptc/research/data-installer-service-docs/research.md`):
   `create-datapack` takes `datapack_name` + `version` + `owner` +
   **`shared: false`** — a user creates his own PRIVATE pack and exports
   versions into it; (name, version) pairs coexist, duplicates 409. Export
   also supports per-type `selections` filters, so the loop can capture
   exactly the changed types. Consequence for the acceptance test: use a
   user-owned private pack (e.g. "bodea-differentiated"), NOT a new version
   of the shared `bodea` — no shared-registry pollution. Remaining sliver
   once gap 1 lands: prove the extension's client path create-then-export
   end to end.
3. **The orchestration skill (and its tools) do not exist yet — and the
   Postman collections define their real scope** (full map in the research
   note): the service has data-item add/update/delete/get + batch-get,
   version PROMOTE, pack update/delete, and async process+poll — none
   exposed as MCP tools today. The loop therefore has TWO routes the skill
   must teach:
   - **Route B (pack-first, works on the shared deployment TODAY):**
     batch-get source rows → write edited rows into a user-owned private
     pack via add-data-item → import to verify. For surgical, known edits.
     `add-data-item` is proven working on stage (§6b).
   - **Route A (instance-first):** edit the instance (Admin deep links for
     what the API cannot reach) → selective export of changed types →
     needs the user's own deployment for a working export store-step.
   Atomicity: item edits accumulate on a working version; **`promote`** is
   the commit. New MCP tools ride the existing `dataInstallerClient`
   (`mcp-tool-authoring`); the skill is `ai-context-authoring` territory
   (generated + version bump); record which pack the project seeds from
   (`SampleDataStep`).
4. **Cross-surface manual steps need the assisted shape.** Shared-catalog
   structure edits happen in the ACCS Admin (no confirmed API surface — see
   the instance-wipe audit). The tabled instance-hygiene design's
   assisted-manual-step pattern (instruct with exact names → Admin deep
   link → verify by API re-read) is the right delivery for those steps
   inside the orchestration skill.

## The acceptance test (the Bodea scenario, end to end)

The user has a running demo connected to an instance with Bodea imported and
will apply the differentiation himself (drop `software`, `wi-fi`,
`critical-power-equipment` from ServerSavvy Solutions — see
`2026-08-17-bodea-shared-catalogs-are-undifferentiated.md`, which this test
also serves):

1. Modify the instance (Admin: Set Pricing and Structure).
2. From the project's agent, create a PRIVATE user-owned pack (e.g.
   "bodea-differentiated", `shared: false`) and export the changed types
   into it (selective export: the shared-catalog + customer-group types).
3. Reset/import from that pack onto a fresh scope and verify the
   differentiation survived the round trip.
4. Every step drives through skills visible in the skills modal.

Step 2 fails today (gap 1). Steps 1 and 3 work now.

## Constraints

- **THE ARCHITECTURE — OPEN, with a binding constraint added 2026-08-23
  (user): there must be ONE pack registry.** The packs live in the
  DATABASE, not the deployment — so any new deployment is a second
  registry, and two registries mean the org's packs diverge (a pack saved
  through one environment invisible to another). Three coherent shapes,
  in preference order; the choice is ORGANIZATIONAL, driven by the user:
  1. **Fix/adopt the existing deployment in place** (zero fragmentation,
     zero migration): the ask is not "set a variable" but "hand over
     operation of the workspace" — the author is done with it; adoption
     preserves the registry every consumer already uses. Exhaust this
     first.
  2. **Full cutover**: team deploys the migrated service (App Builder
     Database — see the research note: near drop-in, IMS-credentialed, no
     connection string, auto-provisioned; ~170 call sites, 4 to verify),
     copies the ENTIRE existing registry over (read APIs work), and EVERY
     consumer org-wide repoints. Only as good as the coordination; a
     partial cutover is the fragmentation the constraint forbids.
  3. **Partition**: shared packs stay in (and are read from) the original;
     user-authored packs live in the new service; the extension routes per
     pack-source. Nothing diverges (each pack has one home) but the org
     runs two services forever and the extension grows two-endpoint
     plumbing.
  Softener: TODAY nobody can export to the existing service — it is
  broken for every consumer equally — so divergence is a forward risk,
  not a current one. Every SC's extension points
  `demoBuilder.dataInstaller.apiBaseUrl` at whatever the decision yields.
- **Seeding:** the new registry starts empty; the user's Bodea-loaded
  instance seeds it via the first working export, and pack-item batch-copy
  can migrate any needed packs from the old stage registry (its read +
  add-data-item paths work).
- Revision trail, so the reasoning is not relitigated: (1) "relay a fix
  request to the operator" — dead, the operator will not change the
  deployment; (2) "user's own deployment with his own Mongo" — rejected:
  per-user infrastructure violates the adoption requirement; (3) the
  App Builder Database migration removes the database dependency entirely.
  Never on the table: hosting the service inside the extension.
- Generated-bundle changes follow `ai-context-authoring` (four gate seams,
  AI_CONTEXT_VERSION bump, regenerate parity).
- Build order (revised after the Postman map): **Route B's tools and skill
  half can be built NOW** — its endpoints (create-datapack, data-item ops,
  batch-get, promote) are proven or documented working on the shared
  deployment. Only Route A's export half waits on the user's own
  deployment; do not ship skill guidance for a step that fails ("worse
  than no skill" — the third-party-tooling item's rule) — mark Route A as
  gated inside the skill until an export succeeds against a configured
  endpoint.

## Kickoff prompt

> Read `.rptc/backlog/2026-08-23-datapack-authoring-loop.md`. First: has the
> export defect (gap 1) been answered? Re-run one export with
> `verbose: 'full'` against a disposable scope and check. If export works,
> settle gap 2 (own-version semantics) with one call, then design the
> orchestration skill per gap 3 using the Bodea acceptance test as the spec.
