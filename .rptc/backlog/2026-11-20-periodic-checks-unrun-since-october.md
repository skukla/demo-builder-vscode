---
id: PL-107
kind: fix
area: platform
needs: []
value: high
status: built
---

# Four periodic checks have no recorded run since at least October

Filed 2026-11-20, from the dev-pipeline thread's review after beta.153 (owner's main concern: the
periodic passes went unrun from August to mid November).

The two dated steps in `.pipeline.yaml` (reflect, codebase-sweep) ran on 2026-11-16 and are within
budget. The other periodic checks have no date anywhere, so "has it run?" could only be answered by
reading session transcripts. Read 2026-11-20 across every Demo Builder transcript folder; the oldest
transcript kept is from 2026-10-10, so "none" means none since then, not never:

| Check | Last run found |
|---|---|
| `npm run sweep` (scripted periodic checks) | 2026-11-16 |
| `codebase-sweep` triage | 2026-11-16, findings filed as PL-98, AI-79, PL-99 (all still open) |
| `rptc-hygiene-scan` | 2026-11-20 (at the beta.153 cut) |
| `test-strategy-scan` | 2026-11-16 |
| mutation stale-row re-measure | 2026-11-16 |
| `test-divergence-scan` | none since 2026-10-10 |
| `npm run eds:drift` | none since 2026-10-10 (needs credentials) |
| `npm run data-installer:drift` | none since 2026-10-10 (needs credentials) |
| full-coverage battery (`evaluation-mode/battery/sweep.sh`) | none since 2026-10-10 (needs a live dev host) |

## What to do

1. Run the four with no run, triage what they find (fix in reach, file the rest).
2. The two drift checks need the owner's credentials (`EDS_DRIFT_*` and the data-installer ones);
   run them with him.
3. Make the answer readable without transcripts: give each periodic check a `last:` date the
   freshness tool reads, as reflect and codebase-sweep have, so the release check refuses a cut
   when one is overdue. The date must be written by running the check, never by hand.

## Shipped so far

- 2026-11-20  test-divergence-scan run 2026-11-20 (2,922 files; baseline 2026-08-28, 1,288). Inline hand-rolled fakes: Logger 341 to 6, CommandExecutor 81 to 52, StateManager 48 to 56 (34 shapes), Project fixture 38 to 61 (56 shapes), HandlerContext 4 to 21 (3 to 13 shapes). As a share of uses all fell except HandlerContext (2% to 7%), the one canonical-fakes should already hold: triage those 21 first. Three checks still have no run: eds:drift, data-installer:drift (owner's credentials), the battery (live dev host).
- 2026-11-21  test-divergence-scan fixed: it counted objects handed INTO a shared builder as hand-rolled fakes. The 21 HandlerContexts were 0: 12 builder overrides, 18 message-channel fakes in 9 files (now set aside and counted on their own line), and 1 finalization-service input. The same fix lowers StateManager 56 to 11 and Project fixture 61 to 30 inline suites. Baseline updated in the skill and CLAUDE.md. Left open: step 3 (last: dates for the periodic checks).
- 2026-11-21  Step 3 built: sweep, test-divergence-scan, eds-drift, data-installer-drift and battery are periodic steps in .pipeline.yaml (budget 3 releases or 30 days), and each writes its own last: date through scripts/lib/pipelineLast.js when it ran (a drift check that could not read a contract writes none). test-divergence-scan has a real date from today's run; the other four show as never run until they next run. Not dated: test-strategy-scan and the overnight mutation re-measure.
- 2026-11-21  feat(pipeline): five periodic checks record their own last run (`53e08027a`)
- 2026-11-21  fix(test-divergence-scan): an object handed into a shared builder is not a hand-rolled fake (`9a107a938`)
- 2026-11-20  docs(backlog): file the pipeline review's Demo Builder items (`2d3fa91a7`)
