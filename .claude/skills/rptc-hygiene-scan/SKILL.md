---
name: rptc-hygiene-scan
description: Find rot in the RPTC record itself — backlog index links that do not resolve, items on disk with no index entry, plans that shipped but still sit in .rptc/plans/, and file:line citations pointing at deleted files or past a file's end. Use at release cuts alongside codebase-sweep, after moving or archiving any plan, or when the backlog stops being trustworthy enough to pick work from.
---

# RPTC Hygiene Scan

`codebase-sweep` and its four scans look at the CODE. Nothing looks at the record — the
backlog index, where plans live, and the citations in both. That record is what you read to
decide what to do next, so when it rots you pick the wrong work, or miss work entirely.

```bash
bash .claude/skills/rptc-hygiene-scan/scan.sh          # defaults to .rptc
```

Four sections, each ending in a CONTROL line. Read the control first: a `(none)` from a
check that never executed reads exactly like a clean result — the `|| echo "none"` failure
this repo's CLAUDE.md names.

## When to use
- **At a release cut**, alongside `codebase-sweep` and `dream`. Advisory, never blocking.
- **Right after moving or archiving a plan** — that is when the two directions diverge.
- When the backlog no longer feels trustworthy enough to pick from.

## When NOT to use
- To find dead CODE — that is `dead-code-scan`.
- To judge whether two implementations should be one — `architecture-duplication-scan`.
- To decide what to build. This tells you the record is wrong, not what to do.

## The four sections, and how to judge each

### 1. Index → disk (dead links)

Mechanical. A link that does not resolve is always wrong; fix it. The only judgement is
whether to repoint or delete the entry.

### 2. Disk → index (unindexed items)

**This is the half a dead-link check structurally cannot see, and it is where the real rot
hides.** On 2026-08-13 a first pass verified every link resolved, reported clean, and missed
three plan directories that had just been moved into the backlog with no entry at all. They
were present, and invisible.

`sub-slice` lines are usually FINE — an item linked inside another entry's prose rather than
from its own `####` heading, e.g. the numbered slices under the App Builder family. Only
`UNINDEXED` needs action.

### 3. Plans claiming shipped, still in `plans/`

**Needs a human. "Claims shipped" and "is shipped" are different questions.**

A plan mid-way through — Stage 1 shipped, Stage 2 in flight — will legitimately match and must
stay. Judge by artifact, not by the status line: does the thing it describes exist in `src/`?
On 2026-08-13 five shipped plans were found sitting in `plans/`, and the status lines were the
least reliable evidence available:

- one still read "APPROVED — no code written yet" two weeks after its screen shipped;
- one read as open until you opened its `HANDOFF.md`, which said shipped and pushed;
- one was named as shipped *inside another plan's overview*, with instructions to archive it,
  and nobody had.

So this section is a prompt to check, never a verdict. Confirm against `src/` and `git log`,
then move to `.rptc/complete/` with an outcome — what landed, and what was NOT verified.

### 4. Citations that cannot resolve

`GONE` — the file no longer exists. `PAST END` — the line number is beyond the file's length.
Neither proves a citation is right; a line that MOVED still resolves and still misleads. This
catches the confidently-wrong cases only.

**The fix is a symbol, not a corrected number.** Line numbers in this repo have a half-life of
about a day: a citation written as `DatapackActivityView.tsx:132` pointed at `:145` the same
afternoon, and two sessions independently reached this conclusion within minutes of each other
on 2026-08-12. Cite `MODE_OPTIONS`, or the behaviour, not the line.

## Scope, and what is deliberately NOT scanned

Citations are checked in `.rptc/backlog/`, `.rptc/plans/`, `docs/` and `.claude/skills/`.

`.rptc/research/`, `.rptc/dream/` and `.rptc/complete/` are **excluded on purpose.** They are
dated statements of what was true when written. A stale path in a 2026-05 research document is
not a defect — rewriting it would falsify the record rather than fix a link. The same rule
applies when you repoint references by hand after a move.

Placeholder paths in skill docs (`src/a/foo.ts`, `src/features/x/old.ts`) are filtered. A scan
that reports its own examples teaches people to ignore it.

## Fix the record, then ask what it was hiding

Rot in the index is rarely only a formatting problem. Filing the three unindexed directories
on 2026-08-13 surfaced that `integrations-host-contract` had real remaining work —
`showIntegrations.ts` still hand-lists 19 handler references, the exact drift the plan was
written to stop. That was invisible while the directory was.

So when this scan finds something, repair it and then read what you repaired.
