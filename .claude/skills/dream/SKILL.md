---
name: dream
description: Out-of-band curation pass over memory, skills, and CLAUDE.md — mine recent session transcripts for recurring failures, corrections, and staleness, then propose evidence-backed changes for the user to accept or reject. Use at a release cut, when an agent keeps repeating a mistake across sessions, when memory feels stale or contradictory, or when asked to "dream" / audit the memory corpus.
---

# dream — second-order curation of memory and skills

In-band memory has two structural limits: a session that is doing the work must split its
budget between the task and curation, and it can only see itself, so cross-session patterns
are invisible to it. This skill is the out-of-band pass that fixes both — dedicated
attention, whole-corpus visibility.

Source: Lamis Mukta, "Learning while you sleep: Beyond memory to dreaming" (Anthropic,
AI Native DevCon, June 2026).

## Hard rules

1. **Propose, never apply.** This skill writes exactly one file: the proposal. Memory,
   skills, and CLAUDE.md are edited only after the user accepts specific items.
2. **Every finding carries evidence and prevalence** — a quoted transcript excerpt (or
   file:line) plus how many distinct sessions show it. A pattern seen once is a note, not a
   finding; say which it is.
3. **Never read a transcript file directly.** They run to 130 MB. Mine them with scripts
   that project only the fields you need, then reason over the digest.

## When NOT to use
- Finding code problems (dead code, duplication, cycles, god files) — those are the
  `*-scan` skills. This skill audits **instructions to the agent**, not the codebase.

> Removed 2026-08-30: a row here routed permission-prompt work to a
> `fewer-permission-prompts` skill and said to reference its output. No such skill exists
> — not in `.claude/skills/`, not in `~/.claude/skills/` — so the instruction sent readers
> to nothing. Permission-prompt noise has no owning skill today; if that work comes back,
> it needs one written, not a route restored.

## 0. Version first

The memory directory is a git repo (`~/.claude/projects/<slug>/memory/`). Confirm it is
clean, and commit any drift before proposing changes, so an accepted edit can be rolled
back and attributed. Skills and CLAUDE.md are already tracked in the project repo.

## 1. Gather inputs

- **Memory corpus**: `~/.claude/projects/<slug>/memory/` — `MEMORY.md` plus one file per
  fact. Read all of it; it is small.
- **Skills**: `.claude/skills/*/SKILL.md` (front matter is enough for most checks).
- **Instruction files**: root `CLAUDE.md`, per-directory `CLAUDE.md`, `tests/README.md`.
- **Transcripts**: `~/.claude/projects/<slug>/*.jsonl`, newest first. Prefer sessions since
  the last dream run (see §5).
- **Prior dream runs**: `.rptc/dream/` — so a previously **rejected** item is not
  re-proposed. If it recurs with materially stronger evidence, say so explicitly.

## 2. Mine the transcripts

One JSON object per line. Useful fields: `type` (`user` / `assistant` / `attachment`),
`message.content[]` blocks (`tool_use`, `tool_result`, `text`), `toolUseResult`,
`attributionSkill`, `attributionMcpServer`, `attributionMcpTool`, `attributionPlugin`,
`isSidechain` (subagent turns), `gitBranch`, `cwd`, `permissionMode`, `timestamp`,
`sessionId`.

Project and aggregate with a script — a pattern that works:

```bash
python3 - "$MEMDIR" <<'PY'
import sys, os, json, glob, collections
d = sys.argv[1]
for f in sorted(glob.glob(os.path.join(d, '*.jsonl')), key=os.path.getmtime, reverse=True):
    for line in open(f, errors='replace'):
        line = line.strip()
        if not line: continue
        try: o = json.loads(line)
        except: continue
        # accumulate counters here — never print raw turns
PY
```

Signals worth counting, and what each implies:

| Signal | How to find it | Implies |
|---|---|---|
| Repeated tool failure | `toolUseResult` with an error key; same command shape recurring | A guard//gotcha belongs in a skill |
| Denied tool use | `"doesn't want to proceed"` in the turn | A permission or an approach the user rejects |
| Interruption | `"Request interrupted"` | The agent was going the wrong way — read the next user turn for why |
| Hook block | `hook` in tool results | A rule the agent keeps violating |
| Course-correction | short `user` turn right after a long assistant turn, containing "no", "actually", "don't", "wrong", "instead" | Missing instruction; the correction is the content |
| Skill never fires | `attributionSkill` absent across many sessions while its trigger clearly occurred | Bad `description` (routing failure), or a dead skill |
| Same file read across many sessions | repeated `Read` of the same path | Its lesson should be distilled into a skill or memory |

Read `tool_use` and `toolUseResult`, not just prose. Most real patterns live in tool calls.

## 3. Steering — what matters in this repo

Prioritise, in order:

1. **Wrong** memory or instructions — actively harmful. A memory that once had a rule
   backwards caused a silent bulk-publish failure; correctness outranks everything.
2. **Stale** — plans in `.rptc/plans/` whose work has shipped (belongs in `.rptc/complete/`),
   `Last-verified` markers long past, conditional TODOs buried in memory bodies that nothing
   will ever re-check, references to deleted modules.
3. **Missing** — a trap hit twice or more with no skill/memory covering it.
4. **Misrouted** — knowledge in the wrong tier. This repo's convention: durable procedure →
   **skill**; one-off durable fact → **memory**; anything the code or git history already
   records → **neither** (delete it).
5. **Duplicated** — the same fact in a memory and a skill, or across two memories. Keep one,
   link the rest with `[[name]]`.

Explicitly **not** interesting: style nits, one-off mistakes with no pattern, anything
already captured in a CLAUDE.md, and restating what the code says.

## 4. Write the proposal

To `.rptc/dream/<YYYY-MM-DD>.md`. Group by target artifact, ordered most-severe first, each
item independently acceptable:

```markdown
# Dream run — <date>
Sessions reviewed: <n> (<date range>) · Corpus: <n> memories, <n> skills

## Proposed: <verb> <target>
**Finding.** One sentence.
**Evidence.** <quote or file:line> — seen in <n>/<n> sessions.
**Change.** Exact edit, or the diff.
**Risk if wrong.** One line.

## Notes (single occurrence — not yet actionable)
## Rejected in prior runs (unchanged evidence — not re-proposing)
```

Then present a compact summary in chat: counts by category and the top three items. Do not
paste the whole file into the conversation.

## 5. Close the loop

- Apply only accepted items, then commit the memory repo with a message naming the run.
- Record rejections in the same proposal file — that record is what stops the next run from
  re-litigating them.
- Leave a one-line `Last dream run: <date>` in the proposal directory's `README.md` so the
  next pass knows where to start.

## Scaling note

A single pass handles a handful of sessions. For a large batch, fanning sub-agents out over
transcript shards and synthesising their reports is the right shape — but **ask the user
before spawning agents**; this repo's default is not to. One sub-agent per transcript, each
returning structured findings, then dedupe and count prevalence centrally.
