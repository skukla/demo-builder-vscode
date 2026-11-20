---
id: PL-107
kind: fix
area: platform
needs: []
value: high
status: backlog
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
