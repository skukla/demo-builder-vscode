# Step 09 — Migration Cutover, Archival Sequencing & Cleanup

**Repo:** `skukla/demo-builder-vscode` + GitHub (archival). **Terminal step.**
**Depends on:** Step 5 (config flips landed) + Step 6 (teaser carries exist as day-one patches).
**Status:** proposed (no code yet)

## Objective

Complete the migration: ensure nothing references the fork, archive `skukla/citisignal-eds-boilerplate`, drop the
superseded sync project, handle pre-existing CitiSignal projects, and do the small in-area cleanups. This is where
the hard sequencing constraint is enforced.

## Pre-archival gate (Risk R1 — must pass before archiving)

Archiving makes the fork read-only; anything still pointing at it for create/reset/merge-upstream then breaks.
Before archival, verify **nothing** references `skukla/citisignal-eds-boilerplate`:

- Grep the extension config + source for the fork name → zero hits (`demo-packages.json` and
  `block-libraries.json` already flipped in Step 5).
- Confirm `forkSyncService` no-ops for CitiSignal (canonical template ⇒ `isFork: false` ⇒ no merge-upstream
  offer). It would fail anyway against an archived (read-only) fork — another reason nothing may point at it.
- Decide handling for **pre-existing CitiSignal projects** whose metadata still carries the fork
  `templateOwner`/`templateRepo` + a fork `lastSyncedCommit`: recommended path is "next reset rebuilds them at
  canonical@LKG" — confirm the reset path (Step 4) migrates their metadata to canonical (mirrors the existing
  Step-0 one-time migration in `edsResetService` ~`:346–358`).

## Actions

1. **Archive** `skukla/citisignal-eds-boilerplate` (GitHub setting; one-time, after the gate passes). Leave
   `demo-system-stores/accs-citisignal` **live** — it is the demo team's block-source upstream, not ours to
   archive.
2. **Drop the sync project** `.rptc/complete/2026-06-09-storefront-template-sync.md` (the gated sync project ADR-006
   supersedes) — mark dropped, do not execute. (It already lives under `complete/`; annotate as superseded.)
3. **`forkSyncService` retirement (note, no action now):** it serves remaining forked-template packages
   (isle5/buildright) and no-ops for canonical. Schedule retirement for when the last forked-template package is
   gone (tracked with BuildRight disposition).
4. **Cleanup (optional, in-area):** fix the stale note at
   `src/features/project-creation/services/aiContextWriter.ts:309` ("Library promotion is a planned future Demo
   Builder feature" — `promote_block_to_library` has since shipped). Predates ADR-006; cheap while here.
5. **Move this plan** from `.rptc/plans/` to `.rptc/complete/thin-layer-storefront-adr-006/` when the initiative
   ships (per RPTC `.rptc/CLAUDE.md` conventions).

## AI tooling — confirmed no changes (impact-analysis §2)

All 9 MCP tools and 12 skills are fork-agnostic (operate on the user's storefront repo + config, never the
template identity). No action beyond the optional §4 note. The persistence boundary is unchanged: storefront repo
= disposable (wiped by reset); patches/block-library repos = durable.

## Risks (this step)

- **R1 (sequencing):** the pre-archival gate is the backstop. Do not archive until it is clean.
- **Pre-existing projects:** if their reset-migration isn't handled, a reset could fail against the archived fork.
  Covered by the metadata migration on reset (verify in test).

## Test / verification

- Grep gate: zero references to the fork across config + source.
- A pre-existing CitiSignal project (fixture with fork metadata) resets successfully against canonical@LKG, with
  metadata migrated.
- `forkSyncService` returns no offer for a CitiSignal project.

## Exit criteria

- Fork archived with nothing pointing at it; sync project marked dropped; pre-existing projects migrate on reset;
  optional cleanups done; plan moved to `complete/`. Initiative Definition of Done (overview) met.
