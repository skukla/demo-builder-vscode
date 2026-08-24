# Manifest write-back migration — retire the legacy-format read layer

**Filed:** 2026-08-24 (from the trim-cycle 4 legacy sweep — the sweep kept these
layers because they are compatibility with DATA on disk, not with code; this
item is the plan to remove that dependency at its source.)

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
3. **Pin the rollback floor.** The updates system supports rollback, so a
   rewritten manifest must load on the version a user rolls back to. The keyed
   deploy-record format has been the written format since the ADR-011 D3 steps
   (2026-08); during implementation, name the oldest version that reads it and
   record it here. Do not assume.

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
