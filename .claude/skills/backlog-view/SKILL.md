---
name: backlog-view
description: Render the RPTC backlog index as a readable list — grouped by section, filterable by section letter or search term, with optional one-line hooks. Use when asked to show the backlog, to find whether something is already filed before filing it again, or to pick the next piece of work.
---

# Backlog View

The backlog index (`.rptc/backlog/README.md`) is 500+ lines of prose with the item titles
buried in `####` headings. Reading it to answer "what's on the list?" means scrolling past
conventions, lifecycle rules and two archive sections — so in practice nobody reads it, and
items get filed twice.

```bash
bash .claude/skills/backlog-view/view.sh            # active backlog, grouped
bash .claude/skills/backlog-view/view.sh A          # one section by letter
bash .claude/skills/backlog-view/view.sh mesh       # items matching a term
bash .claude/skills/backlog-view/view.sh --full     # add the one-line hook under each
```

Read-only and offline. It parses the index; it never writes to it.

## What it shows

Only the **Active backlog** span — from `## Active backlog` to the first `## ` after it.
The archive sections below that are deliberately excluded: they are the record of what
shipped, not a list of things to do.

Items already marked shipped inside an active section (`✅`, `SHIPPED`, `~~struck~~`) are
listed with a `✓` and counted separately. They are not noise — an item still sitting in an
active section after it shipped is a signal that the archive move was never made, which is
exactly what `rptc-hygiene-scan` §3 checks for.

## Read the CONTROL line

Every run ends with:

```
  control: 539 index lines read, 49 headings parsed, range 125..487
```

A backlog with nothing in it and a parser that never found the section print the same
`0 shown`. The control distinguishes them: `0 headings parsed` means the parse failed, and
the line says `⚠️ RANGE EMPTY` outright. This is the `|| echo "none"` failure the root
`CLAUDE.md` names — a check whose exit code passes through a filter is not a check.

The filtered-out count is part of that too. `0 shown, 44 filtered out` means the filter
matched nothing; `0 shown, 0 filtered out` means there was nothing to filter.

## Relationship to the other RPTC tools

| Tool | Question it answers |
|---|---|
| **`backlog-view`** (this) | What is on the list right now? |
| `rptc-hygiene-scan` | Is the list still TRUE — links resolve, nothing shipped-but-unmoved? |
| `codebase-sweep` | What is wrong with the CODE, regardless of what is on the list? |

Use this one before filing anything new. The index is the source of truth for what exists
(see the `project_backlog_directory` memory); a count kept anywhere else rots.

## Limits

Parses `####` headings, so an item written at a different level is invisible to it. If the
index is ever restructured, the control line's `headings parsed` count is what will show it
— a sudden drop means the parser lost track, not that the backlog shrank.
