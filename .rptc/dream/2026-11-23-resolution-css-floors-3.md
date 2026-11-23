# Resolution of review css-floors-3

Date: 2026-11-23
Reviewer: rptc:code-review-agent
Model: opus
Scope: .claude/skills/webview-visual-baseline/capture.js, .claude/skills/webview-visual-baseline/capture-interactions.js, tests/sop/stylesheet-bundles.test.ts, tests/sop/webview-architecture-rules.exemptions.json

5 findings.

| Finding | Severity | Claim | Verdict | Note |
|---|---|---|---|---|
| R1 | low | Request: the missing-floor check in capture.js runs per cell inside captureSurface, not before any load. | PROPOSE FIX | Fixed: capture() refuses unfloored surfaces before assertHarnessFaithful or any load. |
| C1 | medium | Correctness: the cell floor of 180 passes a run where one of the three forced states captured nothing, though its comment and error message say it catches 'a state stopped being read'. | PROPOSE FIX | Fixed: every state (rest, hover, focus, active) must produce cells or the run is refused; the cell floor's comment and message no longer claim it. |
| C2 | low | Correctness: the test pins the cell-floor comparison but not its fullRun guard. | PROPOSE FIX | Fixed: the test pins the fullRun line and the whole if (fullRun && cells < ...) refusal; setting fullRun = false fails it. |
| C3 | low | Correctness: there before this change, the capture() doc comment says 8 x 2 x 3 = 48 loads; SURFACES has nine (54). | PROPOSE FIX | Fixed: 9 x 2 x 3 = 54 loads. |
| F1 | low | Fit: _surfaceElementFloor_note is separated from surfaceElementFloor. | PROPOSE FIX | Fixed: the element-floor note sits directly after its key. |
