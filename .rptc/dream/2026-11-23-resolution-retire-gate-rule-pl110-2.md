# Resolution of review retire-gate-rule-pl110-2

Date: 2026-11-23
Reviewer: rptc:code-review-agent
Model: opus
Scope: .claude/hooks/router.sh, tests/hooks/router.test.ts, tests/hooks/rule-proofs.test.ts, docs/development/handbook.md, CLAUDE.md, .rptc/CLAUDE.md, docs/development/conventions.md, .rptc/backlog/2026-11-20-retire-router-rules-moved-to-plugin.md

2 findings.

| Finding | Severity | Claim | Verdict | Note |
|---|---|---|---|---|
| F1 | low | Request: PL-110's frontmatter was moved to status built but the backlog index row still says backlog, so the index and the item disagree. | PROPOSE FIX | Fixed: backlog sync updated the index row to built. |
| F2 | low | Correctness: the pre-filter does not admit a Bash shell-write of a new non-.mjs script by relative path, so rule 33 can never fire on it; this gap was there before the change. | DECLINE | Pre-existing and outside the owner's request (retire rule 22 and PL-110's dead tokens). Fixed in its own follow-up commit with a probe, so this commit stays the one the owner approved. |
