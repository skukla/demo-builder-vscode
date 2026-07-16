# Edit Mode — usefulness audit & removal assessment

- **Date:** 2026-07-16
- **Type:** Codebase + history research (three parallel agents) + product audit
- **Status:** Complete. Decision taken so far: **remove the edit-DRAFT subsystem** (the
  autosave-while-editing feature, shipped 2026-07-15 `bb489a0e`) — removed same-day. The
  **parent question** (remove Edit Project entirely) is an OPEN product decision; this doc is
  its decision record.

---

## Scope note

The owner's question arrived as "edit mode," which covers two nested things:
1. **Edit Project** (Dec 2025): reopen the wizard on an existing project; Finish = full rebuild
   (temp-dir install + atomic component swap). The PARENT.
2. **Edit draft** (2026-07-15): autosave in-progress edit-wizard state to globalState; silent
   restore + banner + Discard on reopen. A survivability layer FOR the parent.

The owner meant #2; the audit of #1 stands as the decision record below.

---

## Part 1 — The parent: Edit Project

### Origin (hypothesis test)
The owner's recollection — "built because data wasn't being saved to state and fell through
cracks" — **inverts cause and effect**. The founding docs
(`.rptc/research/project-editing-post-wizard/research.md`, 2025-12-14;
`.rptc/complete/wizard-dependency-navigation/overview.md`) give a pure capability rationale:
NOTHING was changeable post-creation. What the memory reflects: after edit existed, it became
the primary **detector** of persistence cracks — the only flow that round-trips the manifest
into wizard state and rebuilds from it. Five "field silently lost" incidents were discovered
through edit (`patches` c111de06, `repoUrl` a7bcb739, `selectedFeaturePacks` e918d844,
`selectedPackage` 04487686, the mesh dual-flow key dd4e202a).

### The amplifier property (the load-bearing finding)
Edit's Finish rebuilds the manifest from whatever the wizard rehydrated
(`buildInitialProject`). **Any field the read path misses is not merely invisible — it is
DELETED from the manifest.** Three silent-data-destruction incidents in 7 months. This creates
an **O(every-future-feature) tax**: each new persisted field must be threaded through
serializer → edit seeding → rebuild, or edit destroys it.

### Bug tax (itemized by the history agent)
~19 edit-specific fixes/investigations + 2 purpose-built safety subsystems (atomic component
swap; the edit draft) + 1 permanent executor special case (mesh edit-reuse branch), spread
across every quarter of the feature's life. Footprint: ~1,000 src LOC + ~1,000 test LOC across
4 edit-only files and ~20 shared files. Notable dead machinery: `stepFiltering.createModeOnly`
(zero users), TimelineNav review-status styling (never produced).

### Still open (as of 2026-07-16)
- **§E persistence gap**: `appBuilderComponentSources` + `additionalConsoleApis` are read by
  `extractSettingsFromProject` but never written by `writeManifest` nor loaded by
  `projectFileLoader` → after a window reload, an edit Finish silently drops custom-URL
  integration sources and runtime-added API picks. Edit can destroy data TODAY.
- ReviewStep integration invisibility (`wizardHelpers.ts:729` hardcodes `appBuilder: []`).
- Edit rename changes the manifest name only; the folder keeps the old path.
- Edit's rebuild **re-clones integrations from source**, wiping AI-authored shell-integration
  code and deployed keyed state.

### Capability matrix (post-D3 world; full matrix in the agent report)
Equal-or-better alternatives exist for: rename (Configure/inline — both do the folder too),
Commerce connection/env/store view (Configure, with staleness detection + redeploy prompts),
integration add/remove/deploy/APIs (dashboard list — strictly better), mesh redeploy
(dashboard), content/storefront sync (dashboard).

**Edit-only residuals:**
| Residual | Absorption difficulty |
|---|---|
| Stack switch (headless↔EDS) | Large — inherently a full rebuild |
| Package/brand switch | Large — scorched-earth even inside edit (resets all downstream state) |
| Backend switch (PaaS↔ACCS) | Large — rebuild-like |
| Adobe destination re-target | Large — every artifact moves; a rebuild by definition |
| Storefront repo / DA.live site change | Moderate — pipeline exists as discrete phases |
| Mesh add/remove at project level | Moderate — dashboard machinery exists; D3 deliberately deferred mesh lifecycle to the wizard |
| Addons (ACO) add/remove | Moderate — Configure has the env group; selection-write + shared env regen |

**Key observation:** every LARGE residual is "a rebuild in all but name" — and the product
already ships the honest alternative: **Copy from Existing** (same `extractSettingsFromProject`
serializer; non-destructive; old project intact). For a demo tool with disposable projects,
that is arguably the right UX for architecture-scale change.

### Docs/usage positioning
README documents **Configure** as the change path. Edit Project appears in NO README, docs, or
skills — it is reachable only via the kebab/More menus. The docs already treat it as
peripheral.

### Recommendation (parent — NOT yet decided)
Remove, staged: (1) absorb mesh add/remove into the dashboard + addons into Configure; judge
demand for a dashboard "change storefront repo" action; (2) point architecture-scale changes at
Copy from Existing (optionally sugar as "Duplicate & Edit"); (3) delete edit mode outright
(entry points, seeding, executor temp-swap + mesh-reuse branch, dead machinery). ~2,000 LOC and
a permanent bug class gone. If kept instead: fix §E immediately and accept the per-feature
round-trip tax knowingly. Sequence any removal AFTER the D3 merge (same files).

---

## Part 2 — The child: the edit draft (DECIDED: removed 2026-07-16)

**What it was:** 600 ms-debounced autosave of a whitelisted, secrets-excluded wizard-state
slice to globalState per project path, saved only while diverged from the seeded baseline;
silent draft-over-seed restore on reopen + "Unsaved changes restored." banner + Discard;
cleared on successful Finish, kept on failure/cancel. Footprint: 4 dedicated files (~324 src
LOC) + ~520 test LOC + 2 registry handlers (`save-edit-draft`/`clear-edit-draft`).

**Why removed:**
1. **The motivating perception traces to the parent's seeding bugs, now fixed.** Fields
   missing when edit reopened (backend, integrations, the mesh) *looked like* lost data; the
   fixes were seeding fixes. The draft only ever protected the narrower case — in-progress
   wizard input lost on panel close — which is inherent (webview panel dispose is not
   cancellable; warn-on-close is unimplementable).
2. **One week of live history: the hazard fired, the benefit never did.** A stale pre-fix
   draft carrying `selectedOptionalDependencies: []` silently overrode the mesh-seeding fix
   (dd4e202a review, Tier-2 finding) — the draft MASKED a bug fix. No restore-saved-work event
   on record.
3. **The hazard is structural: silent stale snapshot beats fresh truth.** No staleness/hash
   guard (documented accepted risk); dashboard-side changes under an open draft silently
   revert; every future seeding improvement is invisible to any project holding an old draft.
4. Cheapest-possible removal moment (session-fresh code), and if the parent is later removed,
   the draft dies anyway.

**Reintroduction bar:** if mid-edit loss proves genuinely painful (long re-walks with auth
round-trips are the at-risk sessions), reintroduce WITH the staleness guard designed in: store
the seeded baseline in the draft; on restore, if the project's current seeded baseline no
longer matches, drop the draft silently — fresh always wins. Design record:
`.rptc/complete/edit-incremental-save/` + git history (`bb489a0e` in, removal commit out).

---

## Sources
- Agent reports (2026-07-16, three parallel): implementation footprint; capability matrix
  across Edit/Configure/dashboard/MCP; origin + bug-tax history. Key anchors:
  `executor.ts:376-380,466-502,1004-1017,1558-1658`, `useWizardState.ts:220-298,311-314`,
  `settingsSerializer.ts:102-158`, `projectConfigWriter.ts:81-137` (§E gap),
  `wizardHelpers.ts:729` (ReviewStep bug), `stepFiltering.ts:92-94` (unused createModeOnly).
- Founding docs: `.rptc/research/project-editing-post-wizard/research.md`,
  `.rptc/complete/wizard-dependency-navigation/overview.md`,
  `.rptc/plans/edit-incremental-save/overview.md`.
