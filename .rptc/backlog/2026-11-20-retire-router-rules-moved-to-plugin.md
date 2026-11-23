---
id: PL-110
kind: fix
area: platform
needs: []
value: low
status: backlog
---

# Remove the router's pre-filter entries for the rules that moved to the plugin

Filed 2026-11-20. The dev-pipeline thread reported that this repo still keeps its own copy of shell
rules 12, 13, 14 and 16, so both copies block the same call. Checked: they do not. The rule files
were deleted at the pipeline rollout (`319ab010a`, 2026-11-16) and only the plugin blocks now.

What is left is dead: `.claude/hooks/router.sh` still admits payloads for those four rules in its
pre-filter (the `git commit`, `--include=`/`-name`, `=$(` / `; do`, `| head`/`| tail`/`| wc` and
`grep -c` tokens), so those calls pay for a parse that no rule uses. Remove those entries and their
comments, after checking no remaining rule needs one of the tokens (rule 10, jest piped into tail,
is admitted by `*jest*` already). `tests/hooks/router.test.ts` and `rule-proofs.test.ts` mention the
old rules in comments and may probe them; update them in the same change.

## Shipped so far

- 2026-11-20  docs(backlog): file the pipeline review's Demo Builder items (`2d3fa91a7`)
- 2026-11-23  Loop 2026-11-23: checked true (rules 12, 13, 14, 16 are gone; no remaining rule needs their tokens: rule 10 is admitted by *jest*, rule 11 excludes git commit). Not changed: the permission check refused editing the hook router while the owner is away, so the change waits for the owner. Ready to apply: drop the `git commit`, glob-flag, `=$(`/`; do`, `| head|tail|wc` and `grep -c` entries from router.sh's pre-filter, then update the two comments in tests/hooks/router.test.ts and rule-proofs.test.ts.
