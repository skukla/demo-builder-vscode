# Resolution of review loop-pl116

Date: 2026-11-23
Reviewer: rptc:code-review-agent
Model: opus
Scope: scripts/moduleSuites.mjs, scripts/focusModule.mjs, scripts/mutationScope.mjs, scripts/checkAttributionEquality.mjs, scripts/mutationRedundancyCombine.mjs, scripts/mutationStaleRows.mjs, tests/scripts/moduleSuites.test.ts

3 findings.

| Finding | Severity | Claim | Verdict | Note |
|---|---|---|---|---|
| F1 | low | Correctness: the move dropped the old strayedSuites guard that only counted stray suites under a tests/ subdirectory, so a suite directly in tests/ can now count for any same-stem module that lacks src/<stem>.ts(x); no effect today, and the change does not mention it. | PROPOSE FIX | Fixed: the tests/-subfolder guard is back in the strayed-suite filter, with a line saying why. The profile's suite counts and verdicts are identical before and after the fix (only mention counts moved, from the new test file naming three modules), and checkAttributionEquality still reports 0 moved rows. |
| F2 | low | Fit: mutationScope.suitesFor is now an exported one-line wrapper with no outside importer, and it shares its name with focusModule.suitesFor, which applies a different rule. | PROPOSE FIX | Fixed: the wrapper is deleted and profile() calls mirroringSuites directly; its comment moved above the import's use. |
| F3 | low | Fit: the doc describing suitesFor was wrong before this change and stays wrong: it states only the mirror-directory rule, leaving out the strayed-suite rule and the import-graph fallback, and does not name moduleSuites.mjs. | PROPOSE FIX | Fixed: BURNDOWN.md names mirroringSuites in moduleSuites.mjs, includes the strayed-suite rule, and says focusModule.suitesFor adds jest's import graph only for a module with no suite of its own name. |
