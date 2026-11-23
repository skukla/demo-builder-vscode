# Resolution of review loop-pl113-1

Date: 2026-11-23
Reviewer: rptc:code-review-agent
Model: opus
Scope: eslint.casts.mjs, scripts/check-type-aware-lint.mjs, tests/helpers/toText.ts, tests/setup/consoleGate.ts, tests/sop/toolingRegistry.ts, package.json, .pipeline.yaml

6 findings.

| Finding | Severity | Claim | Verdict | Note |
|---|---|---|---|---|
| F1 | medium | Correctness: removing requireMock/requireActual casts left mock handles typed any. | PROPOSE FIX | Fixed: every removed require cast is now jest.requireMock<T>/requireActual<T>(...) (22 sites, including the variable-argument and multi-line ones); a diff scan finds none left untyped. |
| F2 | medium | Request: no-unnecessary-type-assertion was switched off for 15 whole files instead of rewriting the casts it misreads. | PROPOSE FIX | Fixed: the 15-file exemption is deleted; the 28 casts are rewritten to generics (getByX<T>, getAllByX<T>, querySelectorAll<HTMLElement>, Object.values<T>, requireActual<T>); lint:types clean and tsc clean. |
| F3 | medium | Request: eslint --fix edited a verbatim upstream fixture because eslint.casts.mjs lacks the tests/fixtures/** ignore. | PROPOSE FIX | Fixed: fixture restored; eslint.casts.mjs ignores tests/fixtures/** and tests/**/*.js. |
| F4 | low | Correctness: the same --fix pass removed no-console disable comments from three JS files. | PROPOSE FIX | Fixed: the three JS files restored, covered by the same ignore. |
| F5 | low | Correctness: the check discards messages with ruleId null, so an unreadable file passes as clean. | PROPOSE FIX | Fixed: the verdict returns 2 (proves nothing) on any fatal message, naming the file. |
| F6 | low | Fit: the new gate script has no automated test. | PROPOSE FIX | Fixed: counting moved to scripts/lib/typeAwareLintVerdict.mjs, tested by tests/scripts/typeAwareLintVerdict.test.ts (clean, findings, unreadable file, short run). |
