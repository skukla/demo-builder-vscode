---
name: backlog-item
description: File, shape, or re-file an RPTC backlog item — the frontmatter contract, the five kinds and how to choose between them, when parent/child is legitimate, and what "value" actually means. Use when adding anything to `.rptc/backlog/`, when an item does not fit a kind, when deciding whether something is its own item or a child of an epic, or when the index and the files disagree.
---

# Filing a backlog item

**The index is GENERATED. Never hand-edit the table in `README.md`.**

```bash
node .claude/skills/backlog-item/build-index.mjs           # print the table
node .claude/skills/backlog-item/build-index.mjs --check   # validate; exit 1 on any problem
```

It was hand-maintained until 2026-08-26 and rotted in three separate ways, each
of which the generator now makes impossible:

- **Three items were invisible for months** — they were sub-bullets inside another
  item's prose rather than entries of their own. A file on disk could simply not
  appear in the list.
- **A `git checkout` silently reverted a corrected headline** back to one the
  evidence had disproven, and nothing noticed.
- **`AB-1` was an epic with no file**, pointing at archived work — so its three
  children had no parent to belong to.

## The frontmatter contract

Every file in `.rptc/backlog/` starts with exactly this, before the `# Title`:

```yaml
---
id: AI-2b            # area prefix + number; a child appends a letter
kind: epic           # question | epic | feature | fix | chore
area: ai             # ai | eds | app-builder | data-installer | prerequisites | platform
parent: AI-2         # OMIT unless this is a child
needs: []            # ids this is blocked by, or []
value: low           # high | med | low
status: spiked       # open | backlog | planned | active | blocked | gated | spiked
---
```

`--check` fails if a kind, area or value is unknown, or if a `parent` or `needs`
id does not resolve. **A dangling reference is the failure mode that hid three
items**; the check exists for exactly that.

## The five kinds, and the one that is easy to miss

| Kind | It is |
|---|---|
| `question` | **Has no "done".** It closes when evidence answers it, not when something ships |
| `epic` | Has children. Needs its own file — a heading in a table cannot hold reasoning |
| `feature` | New capability. The default |
| `fix` | Something is wrong |
| `chore` | Maintenance; no user-visible change |

**`question` is the one people force into `epic`.** *"Is the surface good enough
for an agent to do the work?"* is not a deliverable — you cannot ship it, and
sizing it is meaningless. Filed as an epic it silently becomes work nobody can
finish; filed as a question it stays the reason the work exists. `AI-1a` and
`AI-1b` are the reference examples.

There is deliberately no `task`. Everything that would be one is a `feature` or a
`chore`, and a third label earned nothing.

## Value means what WAITS on it, not how much you want it

| | |
|---|---|
| `high` | Something else is blocked until this exists |
| `med` | Stands alone and is wanted |
| `low` | Real, but nothing waits on it |

A `low` item can still be the next thing you do — it is a statement about
coupling, not about desire. Keeping it that way is what stops every item drifting
to `high`.

## The phases — status is the truth, the folder is storage

The folder used to BE the state machine, and it had three states: `backlog/` →
`plans/` → `complete/`. Everything real happens between them, so people wrote
banners instead — **six of 27 items were carrying "partly shipped / superseded /
historical" prose** when this was introduced on 2026-08-26.

| status | means |
|---|---|
| `open` | a question — no work state; closes on evidence |
| `backlog` | not started |
| `planned` | has a plan, not started |
| `spiked` | feasibility ANSWERED, build NOT decided |
| `active` | being built |
| `built` | **code landed, not verified by use** |
| `blocked` / `gated` | waiting on a named thing |
| `shipped` | done and used |
| `dropped` | decided against; reason in the body |
| `superseded` | replaced — requires `superseded-by: <id>` |

**`built` is the one people reach for a banner instead of.** Evaluation Mode's
step 10 sat there on 2026-08-26 — green tests, full build, nobody had opened the
panel — and was nearly archived as done. Tests passing is not use.

**`spiked` is not `planned`.** Feasibility answered with no decision to build is
its own state; calling it `planned` implies an intent nobody has formed.

## Two rules the checker ENFORCES

1. **An epic cannot be `shipped` while a child is unfinished.** This is the AB-1
   failure made impossible: its deploy spine shipped, the file moved to
   `complete/`, and three unstarted children lost their parent and were invisible
   for months. `--check` now names them.
2. **`superseded` requires `superseded-by`, and it must resolve.** "Replaced by
   something" always names the something.

Everything else is convention, deliberately. The failure was never people
breaking rules — it was there being no slot for the truth.

## Recording what has been done: `## Shipped so far`

On any item that outlives one sitting, dated lines with the commit or plan:

```markdown
## Shipped so far

- 2026-07-15  Keyed writer (`9059eee29`), first release tag beta.127
- 2026-08-24  Phase 1 — `feature/manifest-write-back-migration`
```

This is what git cannot give you at a glance: **what landed against THIS item.**
It also replaces the banners — one place to look instead of prose scattered
through the body.

## Reopening is not a new file

A status change plus a dated line. The item keeps its id, its history, and every
citation pointing at it. Filing a fresh item for revived work orphans all three.

## Parent/child is for containment, not for theme

Use `parent` when the child is genuinely PART OF the parent's job and would make
no sense shipped alone (`AB-1a` inside the App Builder family).

Do NOT use it to group things that merely rhyme. Two items solving the same
problem in different ways are **siblings under one epic**, and the epic says they
are alternatives — see `AI-2`, which holds a cheap panel and an expensive
chat-surface rewrite and states plainly that only one gets built.

## When you file

1. Write the item file with frontmatter.
2. Run `--check`. Fix anything it names.
3. Regenerate the index rather than typing into it.
4. **Do not template the body.** Items vary because the work varies; the
   provenance, the measurements and the caveats are what make an item useful
   months later. The frontmatter carries the structure so the prose does not
   have to.

## Related

- `backlog-view` — renders the index for reading and filtering.
- `rptc-hygiene-scan` — runs `--check` as part of the record sweep.
