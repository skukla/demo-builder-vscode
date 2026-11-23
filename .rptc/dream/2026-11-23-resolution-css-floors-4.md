# Resolution of review css-floors-4

Date: 2026-11-23
Reviewer: rptc:code-review-agent
Model: opus
Scope: .claude/skills/webview-visual-baseline/capture.js, .claude/skills/webview-visual-baseline/capture-interactions.js, tests/sop/stylesheet-bundles.test.ts, tests/sop/webview-architecture-rules.exemptions.json

4 findings.

| Finding | Severity | Claim | Verdict | Note |
|---|---|---|---|---|
| F1 | medium | Correctness: the new per-state check cannot detect forcing that stopped working; a no-op forcePseudoState still yields every state's cells. | PROPOSE FIX | Fixed: on a full run each forced state must change at least one element from its resting value (changedFromRest), else the run is refused; removing that refusal fails the test. |
| F2 | low | Correctness: the missing-floor refusals are not pinned by the test. | PROPOSE FIX | Fixed: both capture.js refusals and the capture-interactions unfloored refusal are pinned with refusesOn; removing the per-cell one fails the test. |
| F3 | low | Fit: the floor error messages still say the surface did not mount when a 75% floor mostly catches a partial mount. | PROPOSE FIX | Fixed: both messages say 'did not mount, or mounted only part of itself'. |
| F4 | low | Fit: a test comment said the floor of 20 let a half-mounted wizard (105 elements) pass, which the record does not support. | PROPOSE FIX | Fixed: the comment matches capture.js (would let a wizard that rendered half its 108 elements through). |
