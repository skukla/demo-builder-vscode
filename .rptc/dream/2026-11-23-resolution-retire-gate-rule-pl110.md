# Resolution of review retire-gate-rule-pl110

Date: 2026-11-23
Reviewer: rptc:code-review-agent
Model: opus
Scope: .claude/hooks/router.sh, tests/hooks/router.test.ts

2 findings.

| Finding | Severity | Claim | Verdict | Note |
|---|---|---|---|---|
| F1 | low | Request: PL-110 asked for the test comments naming the retired rules to be updated in the same change, but rule-proofs.test.ts (lines 9, 17-19, 123) and router.test.ts (lines 384-388) still name 12-unquoted-glob, 13-piped-exit-code and 16-unsplit-var as if they were files in this repo. | PROPOSE FIX | Fixed: both comments now say the rules moved to the dev-pipeline plugin's shell guard at 319ab010a and their files are gone; the history itself stays. |
| F2 | low | Fit: the router comment names a rule '41-god-file' (and '38/39/41/...') that does not exist; the rule is 49-god-file.rule; this was there before the change but sits in the comment block the change edits. | PROPOSE FIX | Fixed: comment now names 49-god-file and 38/39/42/43/44/49. |
