---
id: PL-13
kind: chore
area: platform
needs: []
value: high
status: active
---

# ADR-015 convergence — empty the exemption ledger

The architecture ruling is live and enforced (`tests/sop/architecture-rules.test.ts`);
this item is the cleanup queue it froze. The ledger
(`tests/sop/architecture-rules.exemptions.json`) may only SHRINK — each fix deletes
its row, and the test fails if a fixed row lingers.

**Counts re-measured 2026-08-31 at loop pickup.** The prose below had said 75 rows
with 23 fetch-boundary files; the disk said 30 rows and ZERO fetch-boundary files.
Four days of stale numbers, which is exactly what the item is for.

**Now at 19.** The buckets, current:

1. **`constructionBoundary` — 10.** The biggest remaining bucket, and probably ONE
   batch rather than ten decisions: six rows are the same shape, a service
   constructing its own `GitHubTokenService` instead of asking `edsServiceCache`,
   whose instance carries a token-validation cache.
2. **`layerDirection` — 4.** `serviceLocator` (an owner decision, see below) plus
   three real runtime crossings where `core/state` reaches into a feature's config.
3. **`typesPurity` — 3.** Measured, not guessed: converting every import in all six
   original files to type-only and reading tsc split them cleanly. Three converted
   and cleared. The three left are RUNTIME CODE living in `src/types/` — `errors.ts`
   (error classes, 17 value uses), `shell.ts` (`os`), `typeGuards.ts` (six values).
   Move or ratify; both are the owner's call.
4. **`featureBarrels` — 1.** Four retired 2026-08-31. Only `authentication` remains:
   7 source importers, 15 export lines, and 16 test files carrying a bare automock
   of the barrel. Those automocks want the dead-mock probe, not mechanical
   repointing — several are likely dead.
5. **`commandBase` — 1, and RATIFIED.** `CommandManager` builds all 25 commands so
   it cannot be one of them. Not debt; the row says so.
6. **`patternBSendMessageCeiling` at 142** — a numeric ceiling, not a list. Lower it
   as handlers converge to returns; progress pushes stay legitimate.

**Owner decisions parked** (full detail in `.rptc/handoff/2026-08-31-loop-report.md`):
`serviceLocator` — ratify (recommended) or move to typed tokens; `typeGuards.ts` —
ratify (recommended); `errors.ts` — move to `@/core/errors` (recommended);
`shell.ts` — decide on sight.

Not a sweep-in-one-day item: converge on touch, plus deliberate batches when an
area is already open. Done when the ledger is empty or every remaining row is a
RATIFIED permanent exception recorded in ADR-015.

## Shipped so far

- 2026-08-28  TRUE-SHAPE reconciliation (owner-led, 2026-08-28): this item and PL-11's execution are ONE interleaved batch loop — per file: strengthen the test witness (census: 7 weak files first), convert to handed-in deps, simplify the tests, delete the ledger rows; three ratchets (exemptions, tests clones, sendMessage) drop together. Sequence: PL-14's gates land first so every batch is measured; batches then run PL-13+PL-11 jointly; PL-14 group B instruments run at release cuts. God-file overlaps (EDS-8) serviced opportunistically when a batch touches one.
- 2026-08-29  fix(architecture): name the session-accessor pattern, and let the scan see new files (`c3cb9d8ed`)
- 2026-08-29  fix(components): one ComponentRegistryManager per session, not per message (`e0a15eab2`)
- 2026-08-29  fix(prerequisites): the memoising accessor fetched from the locator — moved to the boundary (`31c8e5dfb`)
- 2026-08-29  test(prerequisites): pin the safety net the cache fix now depends on (`841836805`)
- 2026-08-29  fix(prerequisites): the cache now hits — one manager per session, not per message (`0a5cc6b55`)
- 2026-08-29  feat(architecture): a repeated composition point may not build anything stateful (`79db69e19`)
- 2026-08-29  test(prerequisites): the prerequisite cache is rebuilt on every message, so it never hits (`ec489540c`)
- 2026-08-29  docs(architecture): write down the two rules ADR-015 enforced but never stated (`23d7da9d3`)
- 2026-08-29  fix(architecture): three of the fifteen were not debt — ruled, not ledgered (`85a7a6aa1`)
- 2026-08-29  feat(architecture): ADR-015's construction rule asks about STATE, not location (`15367aac6`)
- 2026-08-29  docs(research): the construction-boundary rule measures the wrong property (`df9de7c8c`)
- 2026-08-29  docs(decisions): close D-3 — the hazard was fixed on the day of the incident (`c33e42e97`)
- 2026-08-29  docs(decisions): D-3 — my trace was wrong, and the incident's witness test caught it (`ec7529cb7`)
- 2026-08-29  docs(decisions): D-3 answered by tracing — 7 of 10 need both, 3 are over-passing (`1bf608d12`)
- 2026-08-29  docs(decisions): D-3 measured — 14 sites, and the proposed factory set does not fit (`6d6f87cea`)
- 2026-08-29  refactor(eds): six files stop rebuilding the GitHub token service (`8a367813d`)
- 2026-08-29  refactor(components): the registry arrives on the context instead of being rebuilt (`dab31319a`)
- 2026-08-29  feat(architecture): enforce the construction boundary ADR-015 actually states (`03f77a7ec`)
- 2026-08-31  refactor(features): retire four feature barrels (`355c18c63`)
- 2026-08-31  refactor(commands): two commands stop living in core/ (`1078859a1`)
- 2026-08-31  refactor(types): core's progress engine stops naming a feature (`e0360093e`)
- 2026-08-31  2026-08-31  Loop: ledger 30 -> 19. Cleared: ProgressUnifier (InstallStep + ProgressMilestone moved to @/types), the two misplaced Reset commands moved to src/commands/, four feature barrels retired (data-installer, sidebar, eds, ai), three types files converted to type-only imports, and DiagnosticsCommand converged to BaseCommand (removing 4 ServiceLocator fetches). commandBase's survivor RATIFIED. Item prose had claimed 75 rows / 23 fetch-boundary files against a disk of 30 / 0.
- 2026-08-31  refactor(sidebar): delete a handler module production never called (`e4f6a0cf8`)
- 2026-08-31  refactor(commands): diagnostics joins the other 24, and stops fetching state four times (`7ee3f71ba`)
- 2026-08-31  refactor(types): three of the six types files were only importing wrong; three are not types files at all (`29d3da47c`)
- 2026-08-31  refactor(project-creation): catalog prewarm asks the service cache for its token service (`32b8f3e43`)
- 2026-08-31  refactor(eds): the authoring flip receives its GitHub token service instead of building one (`035a1683a`)
- 2026-08-31  refactor(components): two files stop building their own registry, including the one that was reverted (`7816fd8a3`)
- 2026-08-31  docs(handbook): the over-wide parameter is why the duplication existed, not just why the mock did (`6c1ee94d9`)
- 2026-08-31  refactor(eds): the GitHub services accessor asks for the secret store it actually reads (`53e66091e`)
- 2026-08-31  refactor(core): env var keys move to core, where their 18 importers already live (`93b558ea0`)
- 2026-08-31  fix(data-installer): the shape-drift warning fires once again, as its contract says (`9405366f4`)
- 2026-08-31  refactor(prerequisites): the manager stops building its own cache, and the command stops building its own manager (`155183f98`)
- 2026-08-31  refactor(core): the backend-owned-scope helper follows its only caller into core (`1bb896c9d`)
