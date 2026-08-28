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
