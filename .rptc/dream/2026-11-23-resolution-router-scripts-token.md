# Resolution of review router-scripts-token

Date: 2026-11-23
Reviewer: rptc:code-review-agent
Model: opus
Scope: .claude/hooks/router.sh, .claude/hooks/rules/33-new-instrument.proof.sh

1 findings.

| Finding | Severity | Claim | Verdict | Note |
|---|---|---|---|---|
| F1 | low | Correctness: a shell write to a new script after a leading `cd scripts &&` (or `cd /abs/repo/scripts &&`) still never reaches rule 33, because the payload has no `scripts/` substring and the pre-filter exits 0; this was there before the change and the change narrows but does not close that gap. | DECLINE | Outside the approved fix (the relative-path write). Raised with the owner as a separate one-line follow-up. |
