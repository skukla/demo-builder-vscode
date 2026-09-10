---
name: backlog-item
description: File, shape, or re-file an RPTC backlog item — the frontmatter contract, the five kinds and how to choose between them, when parent/child is legitimate, and what "value" actually means. Use when adding anything to `.rptc/backlog/`, when an item does not fit a kind, when deciding whether something is its own item or a child of an epic, or when the index and the files disagree.
---

# Filing a backlog item

**The index is GENERATED. Never hand-edit between the `BEGIN/END GENERATED`
markers in `README.md`.** One tool does everything, reads and writes:

```bash
B=".claude/skills/backlog-item/backlog.mjs"

node $B list [--area ai] [--status active] [--layer B] [--grep mesh] [--json]
node $B next                  # what you could start TODAY — nothing unfinished blocks it
node $B show AI-1c            # one item: fields, children, what is blocking it
node $B check                 # validate everything; exit 1 on any problem
node $B new <slug> --id AI-5  # scaffold a file with valid frontmatter
node $B set AI-1c status=active value=high
node $B log AI-1c "Phase 1 landed (abc1234)"
node $B sync                  # rewrite the README's generated spans
node $B stale                 # advisory: WIP items with nothing recorded
node $B unlogged              # commits that NAME an item but never reached it
node $B unlogged --write      # ...and record them, no typing
```

## Name the item in the commit

A commit that belongs to an item carries a trailer:

```
Backlog: AI-1b
```

`unlogged` then finds any such commit whose sha is missing from that item's
`## Shipped so far`, and exits non-zero. Run it after committing; it is also part
of `rptc-hygiene-scan`.

**The trailer is REQUIRED, and git enforces it.** `.githooks/commit-msg` refuses
a commit whose trailer is missing or names an id that does not exist;
`.githooks/prepare-commit-msg` pre-fills the line and lists what is in flight, so
you answer a prompt instead of recalling a convention. Switch them on once per
clone or worktree:

```bash
npm run hooks:git          # git config core.hooksPath .githooks
git config --unset core.hooksPath    # turn them off
```

`Backlog: none` is a first-class answer, not a loophole. Most commits belong to
no item — a lint sweep, the tooling itself — and forcing a fake id would be worse
than no rule. What the rule buys is that you ANSWERED.

Test any change to them with `bash .githooks/dogfood.sh` (15 assertions, a
throwaway repo). **The MUST-NOT-BLOCK cases matter more than the blocking ones**:
a hook that refuses a merge, or dies mid-rebase over history that predates it,
breaks work with nothing to do with the backlog. All three are pinned.

**What the trailer still cannot do.** Most commits belong to no item — a lint
sweep, the tooling itself — and demanding a trailer everywhere just trains people
to write a meaningless one. So a commit with NO trailer is invisible to this: it
catches "named it and forgot to log", not "forgot entirely". The output says so
itself when nothing carried a trailer, because "0 unlogged" and "nothing was
scanned for it" print the same line and mean opposite things.

## The record keeps itself

**After committing, run `unlogged --write`.** The sha and subject are already in
the commit, so there is nothing to type — and a step nobody has to remember is a
step nobody forgets. Eight commits landed unlogged on 2026-08-26 before anyone
noticed, which is the entire argument for this.

It also flips `backlog`/`planned` to `active`, because a commit naming an item is
evidence work started. **It does NOT set `built` or `shipped`** — those stay a
human call. `built` means code landed; `shipped` means someone used it, and only
a person knows the second one. That line is the whole design: bookkeeping is
automatic, judgement is not.

Two things it refuses rather than guess:

- **A trailer naming an id that does not exist.** A typo, and writing it
  somewhere is worse than reporting it.
- **An item already `shipped`/`dropped`/`superseded`.** Logging into finished
  work is a decision.

Both print `REFUSED` and exit non-zero.

## Log at commit time, not at cleanup time

**When you commit work that belongs to an item, run `log` in the same turn.**
That is the whole discipline, and it is not automatic: RPTC does not know the
backlog exists (measured 2026-08-26 — zero mentions across 51 plugin files,
against 211 for "plan"). Nothing flips an item to `active` when a plan starts,
and nothing logs to it when you commit.

`stale` is the backstop, not the mechanism. It names non-epic items sitting in
`active`/`built` with no `## Shipped so far` at all, and it runs as part of
`rptc-hygiene-scan` at release cuts. **Know what it cannot see:** it found
nothing on the day eight commits landed unlogged, because the item they belonged
to was `open`, not `active`. A gap of days it will catch; a gap of one afternoon
it will not.

Epics are excluded deliberately. An epic is `active` because a CHILD is active
and ships nothing itself — on the first run, all three unlogged items were epics,
so without the exclusion the check would have been pure false positives.

**Every read command takes `--json`.** That is the agent-facing form — an agent
picking up work should call `next --json`, not parse a markdown table.

**Writes validate BEFORE they touch disk.** `set` builds the would-be result,
runs the full check on it, and refuses if anything breaks. It used to write first
and validate second, so a rejected `status=nonsense` still landed on disk while
the command exited 1 — dogfooding found it in about a minute (see `dogfood.sh`).

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
layer: B             # A-G, the through-line grouping. OMIT if outside the agent chain
---
```

**A `gated` or `blocked` item MUST name what it waits on** — either `needs:` (when
it is another item) or `waiting-on:` (free text, when it is not). Found by using
the tool on 2026-08-26: `EDS-5` was gated with an empty `needs`, so "gated by
what?" had no answer any command could reach. The real reason — field feedback —
was one sentence buried mid-file. A status that claims a blocker must produce
one.

`--check` fails if a kind, area or value is unknown, or if a `parent`, `needs`,
`superseded-by` or body `[[PL-12]]` link does not resolve. **A dangling reference is
the failure mode that hid three items**; the check exists for exactly that.

Body links were added 2026-08-30, after `check` was caught printing *"all references
resolve"* while a planted `[[PL-999]]` passed — the message was true of two
frontmatter fields and of nothing a reader writes in prose. The corpus was clean when
the check landed (27 links, 0 dead), which is the moment to add one rather than the
moment to skip it. Only id-SHAPED targets are validated: `[[some-note]]` stays a free
link, because a link to something not yet written marks work rather than an error.

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

## Testing: dogfood it, on a copy

```bash
bash .claude/skills/backlog-item/dogfood.sh     # 28 assertions, ~2s
```

Run it after ANY change to `backlog.mjs`. It exercises the real backlog's content
through the real CLI — including every failure case — inside a temp copy, so the
destructive assertions need no revert step.

**It copies because reverting does not work.** The first dogfooding pass ran the
write commands against the real `.rptc/backlog/` and undid them with `git
checkout`. That destroyed uncommitted work twice in twenty minutes: a 69KB prose
migration and a frontmatter field, both rebuilt from a scratch backup. `git
checkout` cannot tell which of your uncommitted changes belonged to the test.

The harness ends with a **negative control** that deliberately fails, proving
`unchanged()` can actually see a write. Without it, a broken assertion helper
would report 28 silent passes.

Two bugs came out of the first pass and both are pinned there now: `set` writing
before validating, and `next` listing a `gated` item as startable.

## Related

- `rptc-hygiene-scan` — runs `check` as part of the record sweep.

*(`backlog-view` was deleted on 2026-08-26. It parsed the README's hand-written
prose while the generator read the files, so it reported 25 items against a
registry of 32 — nineteen invisible to the very thing people used to ask "is this
already filed?". `list --grep` replaces it.)*
