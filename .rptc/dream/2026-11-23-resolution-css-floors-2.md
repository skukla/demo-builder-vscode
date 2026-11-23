# Resolution of review css-floors-2

Date: 2026-11-23
Reviewer: rptc:code-review-agent
Model: opus
Scope: .claude/skills/webview-visual-baseline/capture.js, .claude/skills/webview-visual-baseline/capture-interactions.js, tests/sop/stylesheet-bundles.test.ts, tests/sop/webview-architecture-rules.exemptions.json

3 findings.

| Finding | Severity | Claim | Verdict | Note |
|---|---|---|---|---|
| F1 | low | Request: docs still describe the old state: step-02 cites 168 cells, the step-01 floors table has no surfaceInteractiveFloor row, and SKILL.md never names SURFACE_INTERACTIVE_FLOOR. | PROPOSE FIX | Fixed: step-02 says 240 measured, floor 180; step-01 has the third row; SKILL.md names all three floors. |
| F2 | low | Correctness: rounding 75% down gives configure and aiOverview an interactive floor of 1, so losing one of their two controls still passes. | PROPOSE FIX | Fixed: under four controls the floor is the full count (configure 2, aiOverview 2, siteAccess 3); the test applies the same rule. |
| F3 | low | Correctness: the tests check that the floor comparison appears in the source text, not that it leads to a refusal. | PROPOSE FIX | Fixed: refusesOn() requires the comparison to open a block whose first statement is throw new Error (after cdp.detach for the interactive check); removing either throw fails the test. |
