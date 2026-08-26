---
name: rptc-hygiene-scan
description: Find rot in the RPTC record itself — backlog index links that do not resolve, items on disk with no index entry, plans that shipped but still sit in .rptc/plans/, file:line citations pointing at deleted files or past a file's end, shipped work still filed under an active backlog section, and items whose cited code has moved since they were written. Use at release cuts alongside codebase-sweep, after moving or archiving any plan, or when the backlog stops being trustworthy enough to pick work from.
---

# RPTC Hygiene Scan

`codebase-sweep` and its four scans look at the CODE. Nothing looks at the record — the
backlog index, where plans live, and the citations in both. That record is what you read to
decide what to do next, so when it rots you pick the wrong work, or miss work entirely.

```bash
bash .claude/skills/rptc-hygiene-scan/scan.sh          # defaults to .rptc
```

Six sections, each ending in a CONTROL line. Read the control first: a `(none)` from a
check that never executed reads exactly like a clean result — the `|| echo "none"` failure
this repo's CLAUDE.md names.

## §5 — shipped work still filed as active

`§3` catches a PLAN that claims completion while sitting in `plans/`. `§5` is the same
question aimed at the backlog: an item that shipped but still reads as work to do.

Two signals, deliberately narrow — this check is worth having only if it never cries wolf:

| Signal | What it means | Confidence |
|---|---|---|
| **TOMBSTONE** | The entry announces its own completion (`✅`, `SHIPPED`, `RESOLVED`, `~~struck~~`) while sitting in an active section | Certain — it says so itself |
| **ARCHIVED TWIN** | The entry links to `backlog/<slug>`, and `complete/<slug>` also exists | Strong — it was archived and the index was not updated |

An earlier draft added a third signal: grep the item's slug across commit messages since
the last tag. It was **removed before shipping**. `git describe` picked up a backup-branch
tag rather than a release, and more importantly a slug appears in a commit most often
because that commit FILED the item — the opposite of shipped. It produced five false
positives out of five. A check that cries wolf trains people to skip the whole scan.

The fix for both signals is the same and a human should make it: move the entry into the
index's archive section, or move the file to `complete/` and update the link.

## §6 — the item's code moved after the item did

`§5` catches an item that ANNOUNCES it is done. This catches the harder case: an
item that quietly became untrue because the code it describes was fixed by other
work, and nobody went back to the entry.

It is real. On 2026-08-18 the two items picked off the top of the "active front"
had both already shipped — one in `beta.130`, one in `beta.132` — and the section
that is supposed to be nearest-to-actionable was the least trustworthy part of the
backlog.

**How it decides.** For each item: git says when the ITEM was last updated, and
git says how many commits touched the CODE it cites since then. Nonzero means the
ground moved.

**Only `file.ts:NN` citations count.** A bare filename is background reference; a
line number is a specific claim about specific code, and specific claims are what
go stale. Bare filenames with line numbers resolve too, and unambiguously or not
at all — two files sharing a basename means guessing, and guessing manufactures
findings. Without the line-number restriction the check flagged 17 of 35 items,
mostly old entries naming hot files, which is drift rather than staleness.

**Ordered fewest-commits-first**, because one targeted commit against cited code is
far likelier to BE the fix than twenty commits of ambient churn.

**Advisory, always.** It says the ground moved, never that the item is wrong. Read
the code before acting — the point is to tell you WHICH items deserve that read,
not to make the judgement for you.

**A clean result is evidence too.** `create_project demands a mesh workspace` was
absent from the findings, with its citation resolved and 0 commits since filing —
which is how that item was confirmed still live without re-deriving it by hand.

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

## The sections, and how to judge each

### 0. Frontmatter and references (run this FIRST — it is the cheap one)

```bash
node .claude/skills/backlog-item/build-index.mjs --check
```

Exit 1 names every problem: missing or unknown `kind` / `area` / `value`, a
`parent` that does not exist, a `needs` id that does not resolve.

**Sections 1 and 2 below become largely unnecessary once this passes**, because
the index is GENERATED from the files rather than hand-maintained (2026-08-26).
Keep running them anyway — they catch a hand-edit that bypassed the generator,
which is exactly the mistake the generator exists to prevent someone making.

Two failures this would have caught, both real:

- **Three items invisible for months** — sub-bullets inside another item's prose
  rather than entries of their own.
- **An epic with no file** (`AB-1`), pointing at archived work, so its three
  children had a parent that did not exist.

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
