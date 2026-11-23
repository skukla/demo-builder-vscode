# Resolution of review css-floors-1

Date: 2026-11-23
Reviewer: rptc:code-review-agent
Model: opus
Scope: .claude/skills/webview-visual-baseline/capture.js, .claude/skills/webview-visual-baseline/capture-interactions.js, tests/sop/stylesheet-bundles.test.ts, tests/sop/webview-architecture-rules.exemptions.json

3 findings.

| Finding | Severity | Claim | Verdict | Note |
|---|---|---|---|---|
| F1 | low | Correctness: the interaction floor is one total over all nine surfaces, so a single surface can lose up to 60 cells and still pass. | PROPOSE FIX | Fixed: per-surface SURFACE_INTERACTIVE_FLOOR (ledger surfaceInteractiveFloor), refused per surface. |
| F2 | low | Correctness: the new tests only check that the script constant and the ledger agree, so lowering both together passes. | PROPOSE FIX | Fixed: the test pins the measured counts and derives each floor; planted both-sides lowerings fail. |
| F3 | low | Fit: the check for a surface with no floor runs only after the iframe has loaded, settled and been walked. | PROPOSE FIX | Fixed: the missing-floor check is the first thing captureSurface does; capture-interactions refuses unfloored surfaces before its loop. |
