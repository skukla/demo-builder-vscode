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

## When it runs

Three layers, because an instruction to "remember to run this" is the failure it exists to
catch:

| Trigger | Covers |
|---|---|
| **Stop hook** `rptc-record-drift.sh` | Automatic, the moment damage is done. Fires only when a turn ADDED, DELETED, MOVED something under `.rptc/{plans,backlog,complete}/` or edited the index — never on an item body edit. Reports §1–2 only, silent when clean. |
| **`cut-release`** advisory block | Periodic. Runs all four sections, including the slow-drifting §3 and §4 the hook deliberately skips. |
| **This skill, on demand** | When the backlog stops feeling trustworthy, or after a bulk edit the hook's scoping would miss. |

The hook is scoped narrowly on purpose. Attaching the same pre-existing §3/§4 list to every
plan move is how a hook stops being read. The trade: partial coverage that stays trusted
beats total coverage that gets switched off.

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

**§3b asks the same question of `backlog/`, and nothing did until 2026-08-13.** Five items
there declared themselves SHIPPED / LANDED / IMPLEMENTED / RETIRED — one had said so for over
a month — and they were found by the user opening the folder, not by any check. A backlog
entry that says it is finished is not a backlog entry.

It is deliberately **stricter** than the `plans/` pass: it anchors on a marker in the first 12
lines, i.e. a status banner, not anywhere in the body. Items routinely say "Layer 1 ✅" about
one sub-part while staying live, and reporting those would bury the real hits. The control
covers both directions — a banner is caught, an inline sub-part ✅ is not.

Note this is a different failure from the one §4 and the `backlog-claim-drift` hook address.
Those catch items that went stale *silently*. §3b catches items that announced it and were
left anyway, which no amount of measurement finds — only reading the list.

### 4. Citations that cannot resolve

`GONE` — the file no longer exists. `PAST END` — the line number is beyond the file's length.
Neither proves a citation is right; a line that MOVED still resolves and still misleads. This
catches the confidently-wrong cases only.

**The fix is a symbol, not a corrected number.** Line numbers in this repo have a half-life of
about a day: a citation written against one afternoon's line numbers pointed thirteen lines
wrong by the same evening, and two sessions independently reached this conclusion within
minutes of each other on 2026-08-12. Cite the symbol, or the behaviour, not the line.

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
on 2026-08-13 surfaced `integrations-host-contract`, which had been invisible while the
directory was.

**But note how that finding was itself wrong.** It recorded that `showIntegrations.ts` "still
hand-lists 19 handler references" — read out of the plan's own text, not measured. A
claim-validation pass later the same day measured it: **0 references.** The hand-list had been
replaced by `getRegisteredTypes()` in `0b9f0f6d`, and the item was archived as shipped.

So this scan has a second blind spot beyond the bare-path one in §4: **it verifies that the
record points at real files, never that the record is true.** A shipped item's links resolve
perfectly. When a scan surfaces an item, run one command against `src/` before believing what
the item says about it — especially any number, which is the cheapest kind of claim to check
and the most convincing kind to be wrong about.

So when this scan finds something, repair it and then read what you repaired.
