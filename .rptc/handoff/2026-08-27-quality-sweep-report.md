# Quality-sweep report — 2026-08-27 (evening, owner away)

The owner asked for the full code-quality scan inventory run over the two days
of work since commit `a9d99b76b` (2026-08-26 → today: 163 commits, 516 files,
214 of them in `src/`). Branch: `loop/2026-08-27-quality-sweep`, pushed.
Develop untouched. No cloud writes anywhere in the run.

## The short version

The two days of code came out clean. Every scan ran; the whole sweep produced
two small code fixes (a dead type, a four-times-copied guard block collapsed
into one helper), two new regression pins, one record repair, and one filed
bug — in the scan tooling itself, not the product. The full gate is green
after everything: 1,165 suites / 15,143 tests, zero lint errors, both
typechecks clean.

## What was done, in order

**Baseline.** Full lint + both typechecks + blindspot validator + full jest,
exit codes captured: all zero before any change (15,141 tests at that point).

**Dead code.** ts-prune surfaced ~40 raw hits; filtering out the known
false-positive classes (entry points, module-internal uses) and reading each
survivor left exactly one true positive in the two-day work:
`CustomAppBuilderComponent` in `src/types/appBuilderComponents.ts` — zero
users anywhere, orphaned by the optional-name rework (`b11bcf388`), which
mints instances instead of constructing that shape. Deleted. Three near-misses
were kept with reasons: two documented test seams (`clearSessionGrants`,
`resetComponentRegistryCache`) and one type with a real test consumer.

**Import cycles.** madge over all 914 source files: zero cycles. The file
count matching the repo's size is what makes that a real clean, not an
empty-scope one.

**Copy-paste logic.** jscpd found 74 clones repo-wide (0.62% duplication —
low). 30 touch files in the window, but blame checks showed most predate it
(Jul 7, Aug 3, Aug 23…). The one genuinely in-window, past-Rule-of-Three
finding: the guard-refusal block (report "Checking requirements…" → run the
guard chain → warn → return `blocked`) existed as four byte-similar copies
across the add / deploy / remove / install handlers — the fourth copy was
added by yesterday's install work. Extracted to one `guardOrBlock` helper in
`appBuilderComponentHandlers.ts`; all 371 consumer tests pass unchanged,
which is the proof the refactor moved nothing. Two deliberate two-instance
mirrors were recorded, not extracted (Rule of Three): the
installer/uninstaller derivation preamble, and the install-handlers' target
prologue.

**UI markup duplication.** Three class-name clusters. The EDS service-card
pair is already a filed backlog item (2026-08-25). The `page-container-padded`
cluster: the one in-scope user (`AiOverviewScreen`) is a variant, not a
rebuilt shell — it sits on the wizard's `PageLayout` and uses the class as
padding, which is a different job than `FullScreenSurface`'s sticky-band
shell. Stated and left. No extraction warranted.

**Architecture duplication.** The window added one new service family (the
App Management client/installer/uninstaller) and one new derivation
(`mintInstance`). Verified: the slug logic delegates to the shared
`normalizeProjectName` (no second implementation); the uninstaller's
event-fabric cleanup deliberately complements — not duplicates —
project-level teardown (integration-scope via the app's own API vs
project-scope via I/O Events; the AB-4 item records the relationship).

**Call paths.** Each new user action reaches its ground-truth primitive
through exactly one path: the install reconcile POST has one caller (the
installer), the uninstall POST one caller (the uninstaller), and both doors
route through the single wiring in `appBuilderComponentRunnerDeps`. Both
verdicts are now PINNED in `tests/templates/spine-chokepoints.test.ts`
(13 → 15 tests), so a second path fails a test instead of shipping.

**The record (rptc-hygiene-scan).** Two findings:
1. A "dead" citation in the own-the-chat-surface item was actually a
   reference to ANOTHER repo's file (the tech-case-studio sidecar); the item
   now names the repo so the scan stops resolving it locally.
2. The scan's own check 5 ("shipped work in an active section") parses zero
   active entries — its control caught it and printed CHECK BROKEN. Filed as
   **PL-7** (fix, low): repoint the parser at `backlog.mjs list --json`.
Also ran `backlog.mjs unlogged --write`: 30 commit trailers backfilled onto
their items; backlog re-synced at 56 items, all valid.

## Shipped (on the branch, awaiting merge)

- `9af1424f3` — dead type deleted; `guardOrBlock` extraction (4 copies → 1)
- `7e7030e80` — two chokepoint pins; citation repair; PL-7 filed; backlog
  sync + log backfill

## Filed, not chased

- PL-7 — the hygiene scan's broken check 5.
- Pre-existing clones outside the window's mandate, largest first: the
  35-line DA.live listing walk (`daLiveBlockLibraryOperations` ↔
  `daLiveContentOperations`), the projects-dashboard handler trio of internal
  clones, the prerequisites check/continue pair, the auth
  project/workspace-handler pair. None created in this window; all candidates
  for a future dedicated pass.

## Retracted / corrected

Nothing retracted. One scan finding reversed on inspection: the "dead"
sidecar citation was cross-repo, not dead.

## Environment facts

None — no sessions expired, no prompts encountered. `caffeinate` held the
machine awake; the dev host was not reloaded (no `dist/`-affecting change
needs it before merge).

## Your decisions

1. **Merge `loop/2026-08-27-quality-sweep` into develop?** Two commits, full
   gate green, no behavior changes intended (the 371 unchanged handler tests
   are the evidence).
2. Nothing else is parked. PL-7 is filed and can wait.
