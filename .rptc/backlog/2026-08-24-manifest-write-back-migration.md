---
id: PL-1
kind: chore
area: platform
needs: []
value: med
status: shipped
layer: G
---
# Manifest write-back migration — retire the legacy-format read layer

## Index hook

*The item in one paragraph. Moved off the index 2026-08-26, which carried a second copy that drifted from this file.*

Old project manifests are converted in memory on every load but never rewritten, so the legacy-read code (~half the repo's remaining `legacy` mentions, incl. the whole `meshState`/`appState` synthesis family) is load-bearing forever. Two phases: (1) an idempotent activation sweep step — joining the SEQUENCED upkeep chain in `extension.ts`, never beside it — loads and saves each unstamped manifest, plus a real format stamp (`version: '1.0.0'` today is static) and a pinned rollback floor; (2) two releases later, delete the converters — done = the `singularStateAccessGuard` allowlist (7 files) is empty. Settings export files and external-system shapes are explicitly out of scope. ~1 day per phase. Filed 2026-08-24 from the trim-cycle 4 sweep.

> **Phase 1 SHIPPED 2026-08-24** (`feature/manifest-write-back-migration` →
> develop): `MANIFEST_FORMAT_VERSION = 2` stamped by every save
> (`projectConfigWriter`), `sweepManifestFormat` (core/state, DI + UI-free,
> 6 tests incl. a real loader+writer round trip proving the rewrite is
> lossless) joined LAST in the sequenced activation chain, glue uses
> `persistAfterLoad: false` + `saveProjectConfigOnly` so migration does not
> move `currentProject`. **Rollback floor: v1.0.0-beta.127** — the keyed
> writer shipped in `9059eee29` (2026-07-15), first release tag beta.127, so
> any plausible rollback target reads a rewritten manifest.
> **Phase 2 remains** — see below. **Gate COMPRESSED 2026-08-24** (user
> decision): the two-release wait was a proxy for "every machine has run a
> phase-1 build once." The beta user group is small and enumerable, so the
> gate is now CONFIRMATION, not calendar: (1) beta.141 ships the sweep,
> (2) users are asked to update + reload once (NOT reset — the sweep
> migrates every project at startup automatically), (3) the maintainer
> confirms each user is on ≥ beta.141, (4) phase 2 ships in the following
> cut. **Safeguard, agreed:** phase 2 deletes the legacy branches from the
> ACCESSORS (the guard-allowlist cleanup) but the converter function
> survives quarantined INSIDE the sweep only — so a dormant machine that
> jumps straight past phase 1 still migrates safely at startup, and no
> update-ordering accident can lose a deploy record. Done for phase 2 =
> allowlist empty except the sweep's own load path.

**Filed:** 2026-08-24 (from the trim-cycle 4 legacy sweep — the sweep kept these
layers because they are compatibility with DATA on disk, not with code; this
item is the plan to remove that dependency at its source.)
## Shipped so far

- 2026-07-15  Keyed writer (`9059eee29`), first release tag beta.127
- 2026-08-24  Phase 1 — `feature/manifest-write-back-migration`
- 2026-08-27  Phase 2 PREPARED on branch loop/2026-08-27-manifest-phase2 (off develop, unmerged — the ship gate stays the owner's beta.141 confirmation). meshState/appState removed from Project entirely; they survive only on ProjectManifest, read by the quarantined migration (also the sweep's load path, so dormant machines still migrate — the agreed safeguard). Deleted: the accessor synthesis family (getKeyedMeshAppBuilderComponent merged into getMeshAppBuilderComponent), stalenessDetector's per-field fallback + clearing write, meshUpdateDecline fallback, meshVerifier clearing write, typeGuards endpoint fallback. Guard allowlist: 7 files/15 sites -> appBuilderComponentMigration alone (5). Also caught an access the guard's dot-regex could never see: meshVerifyCheck passed 'meshState' as a markDirty STRING key — now 'appBuilderComponents'. Golden proof: the config.json snapshot recorded from the legacy shape reproduces byte-identically from the keyed shape. DECISION recorded: componentApiPicks' additionalConsoleApis conversion and the daLiveSite strip STAY in the load path — they are load-path tolerance exactly like the quarantined migration, and deleting them would break the dormant-machine safeguard the item itself added. Full gate green (1150 suites / 14972 tests, both tsc, whole-repo lint, blindspots).
- 2026-08-27  chore(state): PL-1 phase 2 — the legacy singular mesh/app state leaves Project (`797194416`)
- 2026-08-28  2026-08-28 correction during branch cleanup: phase 2 is MERGED and RELEASED — the owner instructed the merge on 2026-08-27 morning ('merge the two branches'), and it shipped in v1.0.0-beta.145. The recorded ship-gate (fleet on ≥.141) was belt-and-suspenders: phase 2's own design retained the quarantined load-path migration precisely so dormant/non-updated installs still migrate legacy manifests on load. Item complete: phases 1+2 shipped; the guard allowlist is the quarantined migration alone, by design.

## Problem

Old project manifests (`~/.demo-builder/projects/<name>/.demo-builder.json`)
written by earlier versions still carry retired shapes. The extension converts
them **in memory on every load** but never writes the converted result back, so
an old-format project stays old-format forever and the conversion code is
load-bearing forever. The 2026-08-24 structural baseline counted ~170 remaining
`legacy` mentions; the largest families all trace to this.

The write side already emits ONLY the new format (`projectConfigWriter` — its
own comments say the legacy singletons are "not written or persisted anymore").
The gap is purely that loading never triggers a save.

## Design (agreed in-session 2026-08-24)

**Phase 1 — write back (one release):**

1. Add a **real format stamp** to the manifest. `projectConfigWriter` currently
   writes a static `version: '1.0.0'` that has never been bumped — either bump
   it meaningfully or add a distinct `formatVersion` (decide during
   implementation; the loader must tolerate its absence).
2. New activation sweep step: for every known project whose manifest lacks the
   current stamp, load it (the existing converters run) and save it back.
   **It must join the SEQUENCED upkeep chain in `extension.ts`** — the
   `refreshAiBundlesOnActivation` → `sweepPublishKeyRenewals` →
   `sweepCommerceSecretStorage` chain — never run beside it. Each of those
   sweeps loads its own copy of every project and saves the WHOLE manifest;
   a concurrent writer silently drops the others' fields (the documented
   reason the chain is sequential). A format rewrite is the most
   whole-manifest write of all.
3. **Pin the rollback floor.** ✅ DONE — measured, not assumed:
   `git log -S appBuilderComponents -- projectConfigWriter.ts` names
   `9059eee29` (D3 steps 1–6, 2026-07-15) as the first keyed-writer commit;
   `git tag --contains` puts it first in **v1.0.0-beta.127**. A manifest
   rewritten by the sweep loads on beta.127 and later.

**Phase 2 — delete (two releases later, after auto-update has swept the beta
channel):**

Remove the synthesis/read-compat paths and their type fields:

- The keyed-vs-legacy `meshState`/`appState` synthesis family — the
  `singularStateAccessGuard` allowlist IS the scope list (currently 7 files /
  15 pinned sites: `projectFileLoader`, `appBuilderComponentMigration`,
  `appBuilderComponentState`, `stalenessDetector`, `meshUpdateDecline`,
  `meshVerifier`, `typeGuards`). Done = the allowlist is empty and the guard
  asserts NO production access to `.meshState`/`.appState`.
- `componentApiPicks`' `additionalConsoleApis` → unattributed-picks conversion.
- `projectFileLoader`'s legacy `daLiveSite` metadata drop.
- The legacy singleton fields in `@/types/base` kept "only so legacy manifests
  load".

## Explicitly out of scope (cannot be reduced this way)

- **Settings export/import files** — user-exported interchange files we cannot
  rewrite; the import path keeps its tolerance (`settingsSerializer`,
  `ProjectConfig`).
- **External-system shapes** — e.g. Helix publish keys registered by old
  versions; the publish-key renewal sweep is already re-registering those on
  its own schedule and retires that compat on its own.
- **UI/webview payload back-compat comments** — not manifest-driven.

## Verification

- A fixture manifest in each legacy shape → sweep → file on disk is new-format,
  stamped, and loads identically (assert the loaded `Project` deep-equals the
  pre-sweep in-memory conversion).
- The sweep is idempotent (second run writes nothing — hash or stamp check).
- Sequencing test: the sweep step runs inside the chain (assert order, same as
  the existing pair's test if one exists).
- Phase 2's proof: `singularStateAccessGuard` allowlist empty; full suite green.

## Effort

Phase 1 ~1 day with tests; phase 2 ~1 day. The wait between them is calendar
time, not work.
