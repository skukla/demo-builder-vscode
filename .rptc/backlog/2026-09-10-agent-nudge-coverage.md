---
id: PL-54
kind: fix
area: platform
needs: []
value: high
status: shipped
parent: PL-30
---

# The nudge rules cover two file shapes; reinvention happens in more than two

Owner, 2026-09-10, after a session rebuilt three things that already existed:
*"The fact that you were allowed to re-engineer existing material tells me that we
are not implementing our tooling as true checks for you."*

## The mechanism is right. Its coverage is two shapes wide.

`.claude/hooks/rules/` holds 12 PreToolUse rules and they split cleanly:

- **8 block a shell mistake** (jest piping, redirect order, unquoted globs, piped
  exit codes, concurrent jest, secrets). These work. Two of them fired on me
  during the session that produced this item.
- **4 route to guidance before an action** — `reuse-first`, `registry-dir`,
  `webview-test`, `adobe-docs`. This is the tier that prevents reinvention.

Probed with the real router (`bash .claude/hooks/router.sh` on real Write
payloads, absolute paths, control first):

```
FIRED   new UI component  src/**/ui/*.tsx        -> reuse-first     (CONTROL)
FIRED   new webview test  **/*.test.tsx          -> webview-test
SILENT  new test file     **/*.test.ts
SILENT  a script that re-measures source file sizes
SILENT  a script that splits test files
```

The three silent rows are exactly what went wrong. A test-splitting playbook
exists (`docs/testing/test-file-splitting-playbook.md`) and says every correct
thing; nothing routed to it, so a splitter was invented, 11 files were cut at
their arithmetic midpoint, and 167 tests broke. `validate:test-file-sizes` exists
and reports the real number; nothing routed to it, so the count was
re-implemented in Python — twice, wrongly both times.

**The gap is not "we have no checks". It is that the guidance tier is wired for
`.tsx` and nothing else.**

## What would have caught the session

| trigger | route to |
|---|---|
| Write to `**/*.test.ts` that does not exist yet | the splitting playbook + `tests/README.md` |
| Write to a NEW `scripts/*.mjs` or `.js` | `tests/sop/toolingRegistry.ts` — 39 instruments; is yours one of them already? |
| Write a file whose content counts lines/sizes across the tree | `npm run validate:test-file-sizes` and `/sop-scan` |

`31-registry-dir.rule` is the pattern to copy: it does not say "check the
registry", it DELIVERS the directory's contents before the new file is written.
That is the anti-reinvention primitive, and it is currently applied to one
directory.

## The second half: nudge rules are exempt from proofs

`tests/hooks/rule-proofs.test.ts` requires a proof only for the three
"mechanical" rules, reasoning that nudge rules are covered by `router.test.ts`
reachability. But reachability is not shape coverage, and this repo has already
paid for that distinction twice — rule 13's `grep -c` arm and rule 20's
`sk-ant-` arm were both unreachable at the pre-filter while their rules looked
fine.

A nudge rule whose path pattern drifts goes silent, and a silent nudge rule is
indistinguishable from a session where no reinvention happened. Give them proofs.

## Not to be confused with

Adding more rules for their own sake. Every existing nudge rule was written after
a specific, observed reinvention. These three are the same: each names something
that actually happened on 2026-09-10.

## Shipped so far

- 2026-09-10  Filed after the test-file-size audit
  (`.rptc/research/test-file-size-audit/research.md`)
- 2026-09-10  2026-09-10  Proofs for all 4 nudge rules + 6 new rules (32-37), each with a stated convention
- 2026-09-10  2026-09-10  All 13 gaps closed — 25 rules, every one proved; 109 conventions
- 2026-09-10  2026-09-10  All 13 gaps routed: 25 rules, 25 proofs, 109 conventions (46a737d6e)
- 2026-09-10  2026-09-10  SHIPPED: its user is the agent, and the rules fired in real use the day they landed — 31 and 32 on the new enforcer, 42 on the daLive edit, 49 on the god file.
