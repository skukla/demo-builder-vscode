# Pattern-conformance audit — the instrument (built BEFORE any classification)

The owner's condition (2026-08-28): *"my biggest concern is that you're going
to call something finished which really isn't."* This harness makes that
structurally impossible — completeness is arithmetic the owner re-runs, never
a sentence the auditor writes.

## The contract

1. **`denominators.sh`** — the universes, each a re-runnable command with a
   built-in positive control (a zero for a thing known to exist fails the
   SCRIPT, not the codebase). Current baseline: 896 src files, 33 handler-map
   files, 33 service classes, 28 tool registrars; contested-axis site counts:
   103 ServiceLocator reach-ins vs 115 direct constructions.
2. **`ledger.json`** (produced by the audit) — one row per (unit, pattern):
   `conforming | deviating | exempt`,each with evidence; `exempt` WITHOUT
   evidence is rejected (the named-floor rule). `universes` maps each pattern
   to its denominator key.
3. **`check-ledger.mjs`** — the DONE-GATE: per-pattern row counts must equal
   the denominators exactly; any unaccounted unit prints and exits 1.
   `--selftest` plants holes and requires the gate to catch them.
4. **`sample.mjs <seed> [n]`** — the seeded refutation sample: independent
   checkers re-classify these units trying to REFUTE the audit; the seed makes
   the sample reproducible by the owner. Refutation findings go in the report
   verbatim.
5. **No detector's zero counts without its own planted-defect run** (the scan
   skills' --self-test convention), recorded beside the zero.

"Done" = denominators controls ok + done-gate green + selftest catches holes
+ refutation round reported. All four are commands; none is prose.

## The done-gate is RETIRED from the sweep — 2026-09-10

`check-ledger.mjs` proved the ledger accounted for every unit **at the time of the
audit**. PL-12 shipped on 2026-08-29; re-run against a tree 1,600 commits later, the
gate measures DRIFT rather than completeness. On 2026-09-10 it reported 66 rows
naming files that shipped work had since deleted — most of them the barrel `index.ts`
files PL-31 retired, plus the two commands that moved to `src/commands/`.

None of that is a defect. It is the codebase moving, which is the point of the
codebase.

A gate that fails forever on work going well is noise, and noise hides real findings
— this repo has now paid for that twice in one day (`validate:test-guidelines` red
for weeks on its own stale heading list, and the citation scan calling a
`node_modules` file a missing repo file). So the gate is declared a one-shot in
`NON_INSTRUMENT_SCRIPTS` and the sweep no longer runs it.

**It still works and it is still here.** Run it by hand if the audit is ever redone:

```bash
node .rptc/plans/pattern-conformance-audit/harness/check-ledger.mjs
```

The other four instruments in this harness — `program-metrics`, `craft-census`,
`test-census` and `classify` — are unaffected and still registered. That is also why
this plan directory stays in `plans/` rather than moving to `complete/`: four live
instruments live here, so the directory is in service even though the audit is done.

