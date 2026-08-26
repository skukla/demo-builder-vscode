---
id: PL-2
kind: chore
area: platform
needs: []
value: low
status: backlog
---
# Regroup crowded service directories into subfolders — where measurement says so

> **✅ ROUND 3 EXECUTED same day — the configService deferral OVERRIDDEN by
> user decision** ("just do it; the datapack branch pays the rebase"). The
> `configService/` family (10: configurationService, configServiceAccess,
> configServiceProbe, configAccessRecovery, siteConfigRegistrar,
> siteAccessManagerHeadless, siteGrantPreservation, repairSiteConfig ×2,
> lostGrantsMessage) is in; the publishKey pair went to `pdp/` after a
> domain read — their WHY is the smart-404 runtime's key, not the Config
> Service (the registrar header says so). `configGenerator` +
> `configSyncService` stay top-level deliberately: they are the storefront
> config.json GENERATION pair, name-similar but a different domain — the
> membership-by-name trap the item warns about, caught by reading headers.
> eds/services final shape: **27 top-level + 8 families** (from 95 flat).
> Full gate green again (1137/1137, no cycles, hygiene clean). The live
> `claude/datapack-authoring-loop` branch now rebases across renames of the
> three files it touches — git rename detection should carry it; its owner
> was the accepted cost.

> **✅ ROUND 2 EXECUTED same day (systematic pass, cost no object — user
> directive):** `eds/services` again (`patches/` 9 — incl. the lkg pair,
> `pdp/` 3, `storefront/` 8 → **39 top-level**, from the original 95);
> `project-creation/services` (`aiBundle/` 13 — the whole generated-AI-bundle
> subsystem → 15 top-level, from 28); `eds/handlers` (`storefrontSetup/` 8,
> `daLive/` 5 → 13 top-level, from 26). 46 more src files + 58 test mirrors;
> `@module` headers and living docs repointed both rounds; two dated research
> citations that went GONE converted to symbol form. Full suite 1137/1137,
> lint + typechecks + blindspots clean, madge no cycles, hygiene scan clean.
> Still deferred: the configService family (live-branch conflict, unchanged).
> Remaining directories keep their recorded leave-verdicts (`ai/server`
> suffix convention, `core/ui` kind-grouping, `core/utils` grab-bag);
> `authentication/services` re-measures AFTER the facade-split dust settles.

> **✅ EXECUTED for `eds/services` 2026-08-24** (`refactor/eds-services-regroup`):
> 36 files moved into `daLive/` (15), `helix/` (8), `github/` (7), `reset/` (6);
> 95 → 59 top-level files + 4 family dirs. Full suite 1137/1137 green, lint +
> both typechecks + blindspots clean, madge no cycles; test edits were
> path-only (three HTML fixtures briefly damaged by a too-broad rewrite were
> caught by their own suites and restored — the lesson: rewrite IMPORT
> POSITIONS, never all quoted relative strings). Living docs (2 skills, 5
> architecture docs) repointed; hygiene scan clean.
>
> **Deliberately NOT moved: the configService family**
> (`configServiceAccess`, `configAccessRecovery`, `configServiceProbe`,
> `configurationService`, `configSyncService`, `siteConfigRegistrar`, …) —
> the live `claude/datapack-authoring-loop` branch touches exactly those
> files; moving them would have made that branch a conflict farm. Fold them
> into a `configService/` dir after that branch lands.
> `claude/commerce-connect-slice-1-plan` also overlaps but is 1,352 commits
> behind develop — flagged for deletion rather than treated as a constraint.
> `project-creation/services` (28) and `eds/handlers` (26) were NOT assessed
> this pass (the move was not "cheap" — ~200 files churned).

**Filed:** 2026-08-23, from a research pass answering "are directories like
`lifecycle/services/` crowded enough to subgroup?" The named example was not
(3 files), but the phenomenon is real in one place above all others. The
measurement below IS the research; do not re-run a discovery pass at pickup,
just re-measure the counts (files move).

**Severity:** low — discoverability only. No import coupling changes either
way; eslint and CI are indifferent to directory depth.

## The measurement (2026-08-23)

Direct `.ts`/`.tsx` files per directory, whole `src/` tree, threshold 12+:

| Files | Directory | Verdict |
|---|---|---|
| 95 | `features/eds/services` | **THE candidate — see below** |
| 38 | `features/ai/server` | leave: suffix convention (`*Tool.ts` / `*Tools.ts` / `*Descriptors.ts`) already groups it |
| 31 | `features/authentication/services` | leave for now: 12 `adobe*` files, but the biggest was split into a facade+5 on 2026-08-23; re-measure |
| 28 | `features/project-creation/services` | assess at pickup — no strong name families counted |
| 26 | `features/eds/handlers` | assess at pickup |
| 25 | `core/ui/hooks` | leave: hooks are a kind-grouping already |
| 21 | `core/utils` | leave: grab-bag by design, `progressUnifier/` subfolder exists for its one family |
| 12–20 | ten more | leave: prefixes do the grouping an `ls` needs |

`core/` has no extreme case; `core/ui` is already grouped by kind
(`components/layout`, `components/ui`, `components/forms`, `hooks`).

## The one strong case: `eds/services` (95 files)

Filename families, counted 2026-08-23:

- 15 `daLive*` (auth, content ops, org ops, ...)
- 8 `helix*` (grew by 4 the same day: `helixAdminAuth`, `helixAdminErrors`, `helixApiKeys`, `helixSiteContent`)
- 7 `github*`
- 7 `eds*` (mostly the reset family: `edsReset*`)
- 6 `storefront*`
- 6 `config*` / 3 `site*` (the Config Service family)

A `daLive/`, `helix/`, `github/`, `reset/`, `configService/` layout covers
50+ of the 95. **The taxonomy is a counted lead, not a verified design** —
whoever picks this up reads the stragglers and decides where the ~30
unfamilied files go (some stay at the top level; forcing every file into a
folder is not the goal).

## Precedent — subfolders under `services/` are already house practice

`prerequisites/services/installation/`, `prerequisites/services/versioning/`,
`dashboard/services/onOpenChecks/`. The import rules (src/CLAUDE.md) don't
care about depth; within-feature stays relative, cross-boundary stays aliased.

## The cost, measured for `eds/services` alone

- ~700 `@/features/eds/services/...` import lines across `src/` + `tests/`
- 232 relative sibling imports inside the directory
- **308 literal `jest.mock('...')` path strings** — tsc cannot check these;
  a stale one fails its suite at runtime (loudly, but each is a hand edit)
- 117-file test mirror (`tests/features/eds/services/`) moves with it
- 13+ skill/backlog/doc files citing these paths (rot silently), plus two
  memory files citing `helixService.ts`

## Execution constraints (why this is a maintenance-cycle anchor)

1. **Right after a release cut, with no EDS branch in flight.** A mass rename
   under `eds/` conflicts with every parked branch touching those files (the
   Bodea work does).
2. One directory per session; `eds/services` first and possibly only.
3. Full `gate` (whole-repo lint + both typechecks + full jest) — the 308 mock
   strings are the reason a scoped run is not enough.
4. Run `rptc-hygiene-scan` after: it exists to catch exactly the file:line
   citation rot this creates. Update the two memory files by hand.
5. Barrel/`index.ts` and re-export decisions follow the feature's existing
   public-API convention; external deep imports keep working via updated
   paths, not compatibility shims (no soft deprecation).

## Kickoff prompt

> Read `.rptc/backlog/2026-08-23-services-directory-regrouping.md`. Re-measure
> the file counts first (the table is dated). Regroup `features/eds/services/`
> into its name families (daLive / helix / github / reset / configService —
> verify the taxonomy by reading the stragglers, don't force-fit all 95).
> Move each family with its test-mirror directory and every literal
> `jest.mock` path; the bar is the full suite passing with content-unchanged
> tests (path-only edits are expected and fine — behavior edits are not).
> Finish with the full gate and `rptc-hygiene-scan`. Leave `ai/server`,
> `core/ui/hooks`, and `core/utils` alone — the item records why. Assess
> `project-creation/services` and `eds/handlers` only if the eds/services
> move proves cheap.
