# Resolution of review css-floors-5

Date: 2026-11-23
Reviewer: rptc:code-review-agent
Model: opus
Scope: .claude/skills/webview-visual-baseline/capture.js, .claude/skills/webview-visual-baseline/capture-interactions.js, tests/sop/stylesheet-bundles.test.ts, tests/sop/webview-architecture-rules.exemptions.json

3 findings.

| Finding | Severity | Claim | Verdict | Note |
|---|---|---|---|---|
| F1 | low | Correctness: INTERACTION_CELL_FLOOR (180) can fail only when every surface sits exactly at its interactive floor, so it adds almost no protection beyond the per-surface floors, which its comment does not say. | DECLINE | Out of scope for this change: the floor values are due to be re-set from the first live capture (none has run; counts came from --dump-dom). Recorded as a follow-up in .rptc/plans/css-architecture-migration/step-01.md 'Left for the first live capture'. |
| F2 | low | Fit: the stated reason for full-count interactive floors also applies to dataInstaller's 4 controls, yet it gets floor 3. | DECLINE | The cutoff is an owner decision tied to the open question of whether full-count floors fit 'may only rise'; recorded for the owner in step-01.md 'Left for the first live capture'. |
| F3 | low | Fit: the Ledger type does not describe the new number-valued map entries. | DECLINE | The Ledger type predates this change and has the same gap for every map key; the test compiles and nothing reads these keys typed. Recorded in step-01.md 'Left for the first live capture'. |
