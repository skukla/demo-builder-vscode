---
id: AI-1d
kind: feature
area: ai
parent: AI-1
needs: [AI-1c]
value: high
status: active
layer: B
---
# Journeys, not prompts, are what the battery should measure

## Index hook

*The item in one paragraph.*

**The measurement battery defines a prompt as "an ordinary thing a producer would
type into the chat" — one turn, one short task — and that is not where the cost
is.** Raised by the owner 2026-08-26: *"suppose I want to build a new App Builder
app that mimics an ERP system. I'd start by giving it a very vague prompt and
then I would waste a ton of tokens while the LLM guides me through the process.
These are the things that I want to actually dog food."* The expensive thing is
not a prompt with a route; it is a **journey** — vague at the start, dozens of
turns long, where the agent and the producer feel their way to a shape. **That
exact journey is already on disk**: a 264-turn, 4.4MB session that built the
`crm-integration` App Builder app, found while researching `AI-1c`. So this also
answers the battery sub-plan's own open question — *"Who writes the held-out
prompts, and from what?"* — with: **nobody writes them. We harvest the journeys
that already happened.** Filed 2026-08-26.

## Why the current unit is wrong

`.rptc/plans/evaluation-mode/measurement/overview.md` is explicit about what it
measures, and it is right for what it covers:

> it is **an ordinary thing a producer would type into the chat**. Nothing
> specialised about its form.
>
>     Set up a Bodea demo with B2B turned on.
>     Why aren't my product pages loading?

Those are answerable in a handful of turns. A battery of them measures whether
the surface answers a **known question efficiently**.

It cannot measure the case the owner actually cares about: a producer who does
not yet know what they want, arriving with *"build me something like an ERP"*,
and spending an afternoon converging. The waste there is not in any single
round trip. It is in the **shape of the path** — re-orientation, dead ends,
rediscovering the same facts, and reaching for Bash where a tool should have
existed.

## The corpus already exists

Measured 2026-08-26 while researching `AI-1c`:

| session | user turns | tool calls | size |
|---|---|---|---|
| `de59e150…` | 264 | 171 | 4.4 MB |
| `f74743c6…` | 56 | 53 | 0.5 MB |

Both are the ERP/App Builder journey. Nobody has to invent a hard prompt: the
hard journeys have been run, and they are sitting in `~/.claude/projects/`.

**This is why it needs `AI-1c`.** That item builds the transcript-reading
machinery — scoping to demo-project sessions, walking `tool_use` blocks,
classifying what the agent reached for. Harvesting journeys is the same
machinery pointed at a different question, and building it twice would be the
duplication this repo keeps having to delete.

## What a journey measurement would record

Not yet decided, and deliberately not designed here. Candidates the two hand
passes suggest:

- **Turns to first useful action** — how long before anything happened.
- **Re-orientation count** — how often the agent re-asked what project it is in.
  `AI-1b` measured 77% of all calls as six orientation reads; in a long journey
  that is likely worse, not better.
- **Bash-instead-of-a-tool moments**, with where in the arc they fell. Early is a
  discovery gap; late is a capability gap.
- **Where the producer had to intervene** — a correction is the clearest possible
  marker of the agent being off the path.

## What this is NOT

Not a replacement for the battery. The short-prompt battery answers "is a known
question answered efficiently?" and stays. This adds "does a vague, long job
converge, and where does it bleed?" — a second unit, not a substitute.

Not a live surface. Same reasoning as `AI-1c`: the audience is whoever is
improving the extension, and they work in this repo.

## Open

- Which journeys count as the held-out set, given they are the owner's own
  sessions and therefore already "seen"?
- Is a journey replayable at all, or only measurable after the fact? A 264-turn
  session cannot be re-run cheaply, which may make this observational rather
  than a battery you execute.

Filed 2026-08-26.

## Shipped so far

- 2026-08-26  Battery reshaped: 10 targeted prompts, each declaring the tool that SHOULD answer it, scored hit/around/miss. Fixed run.mjs — it read a filename that no longer existed AND overwrote the live AGENTS.md with no backup, so it could not have been run since the rename.
- 2026-08-26  Battery RAN, 10 prompts, 10 hits, 1 TOOL-INSUFFICIENT. Route detail rendered per prompt. Confirms the design: a plain hit/miss score would have called commerce-query a success. Limits found: results.jsonl is truncated per run (AI-1i), and this run captured tool names without arguments — runner now records args + per-step results.
- 2026-08-26  feat(battery): say WHY the agent went around us, not just that it did (`742783b3c`)
- 2026-08-26  fix(battery): the allowlist blocked two of its own prompts (`a5ea25e71`)
- 2026-08-26  feat(battery): targeted prompts that declare the tool that should answer them (`ad2253ec3`)
- 2026-08-26  docs(backlog): AI-1d — journeys, not prompts, are what the battery measures (`f13f9d080`)
- 2026-08-26  Added --only/--repeat after a false alarm: datapacks changed diagnosis between two runs and read as a regression. 3 repeats settled it — 1 bad run in 5, the other 4 an identical clean route. It also got FASTER after AI-1g: 8 calls before, 4 in every repeat. Every battery figure is n=1 by default and that was nearly enough to send us chasing a bug that did not exist.
- 2026-08-26  Two scoring defects found by reading the datapacks routes: (1) a tool can answer an error as PROSE with is_error:false — four runs scored ok while list_installed_datapacks had returned 'Adobe sign-in required'; (2) auth state was neither recorded nor checked, so a signed-out run was compared to a signed-in baseline. Both fixed. RETRACTED: 'datapacks got faster after AI-1g' — it stopped working and the agent gave up sooner.
- 2026-08-26  Battery caught a false negative it created: run_commerce_query shipped without being added to readonly-tools.txt, so the agent found it, called it, was DENIED, and the run scored NOT-FINDABLE — the exact opposite of what happened. The allowlist guard cannot catch this (it checks EXPECTED tools; no list predicts what an agent reaches for), so a permission denial anywhere now marks the run INVALID rather than scoring it.
- 2026-08-26  fix(mcp): route a catalogService request to ACCS's single endpoint (`bc0f59e03`)
- 2026-08-26  fix(battery): an error answered as prose is a failure, and auth is recorded (`6740d2e76`)
- 2026-08-26  feat(battery): --only and --repeat, after one sample nearly cost a day (`d4a1caeee`)
- 2026-08-27  Slice 1 shipped: --session journey mode on agent-gap-scan, plus a corpus-wide 'reads that are a preamble to another read' section. First finding: get_current_project returns ~100 bytes (name + path) and 83% of its calls are followed immediately by another of our reads — it orients without answering anything actionable. Also fixed the scan's userTurns, which counted tool_result carriers as human turns (534 -> 139 corpus-wide). Journeys-as-EXECUTION stays parked; this answers the tool-quality question observationally and for free.
- 2026-08-27  First fix driven by the journey read: get_current_project answered a name and a path (22 tokens) and 83% of its calls chained straight into another read. get_project_status was already a strict superset for 24 more tokens — two tools, one contained in the other, the thinner reached for 2.4x more. They now share resolveProjectStatus. Both names kept (different framings, one answer); the null envelope kept (a fact to branch on, not an error to retry); the resolver degrades rather than throws, since sharing it made auth a dependency of the most-called read. Verified live: 86 -> 201 bytes.
- 2026-08-27  Second fix from the preamble read: list_projects carried a status field that answered 'unknown' on every real project ever listed (writeManifest's explicit field list has never included status — it is a runtime fact), and no marker of which project is current, which is why half its chained follow-ups were get_current_project. Field deleted outright; current:true marker added, read from state.json beside the projects dir (atomic write exists exactly for file-based readers). Fixture trap found on the way: the tests' manifests carried status:'ready', a shape the writer cannot produce, and a call-ORDER readFile mock that the new state.json read displaced — rewritten to route by path. Verified live: current:true on bodea.
- 2026-08-27  Both orientation fixes MEASURED, not just predicted: active-project 3/3 HIT (one list_projects call, marker read directly), orientation 3/3 HIT after widening expect to both doors (the payload merge made them share one answer by design; every run answered project + run-state in a single call). Also fixed on the way: the scorer's NO-ROUTE label lied when a SIBLING demo-builder tool answered — new SIBLING-TOOL diagnosis names the tool and asks the human question (expect too narrow, or routing wrong?).
- 2026-08-27  Overnight loop closed. The loop the owner asked for ran end to end: measure (battery) -> analyze -> fix -> gate -> commit -> reload -> live-verify -> pin, driven by background-task wakeups, 9 cycles, zero human input. Its own discipline caught itself once: the gate-conditional commit refused a push the earlier chained command would have shipped red.
