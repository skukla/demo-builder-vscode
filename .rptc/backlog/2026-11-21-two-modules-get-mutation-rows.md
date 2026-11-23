---
id: PL-117
kind: chore
area: platform
parent: PL-48
needs: []
value: low
status: backlog
---

# agentsMdSections and useProjectSelectHandlers get mutation-baseline rows

Filed 2026-11-21 from the backlog reconciliation. PL-48 wrote "FOLLOW-UP FOUND, do not lose": these
two modules were never measured.

The PL-50 fallback (bb9def80d) made them measurable, and PL-50 probed agentsMdSections once at
54.55%, but `reports/mutation/baseline.json` has no row for either module.

Done when both have baseline rows measured through the suites that exercise them.

## Shipped so far

- 2026-11-23  Loop 2026-11-23: not started. The baseline rows come from Stryker runs, the overnight cadence the loop does not start (CLAUDE.md: never inside the sweep, a person starts them). Ready to run: npm run test:mutation:sweep for the two modules.
