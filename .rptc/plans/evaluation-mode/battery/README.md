# The prompt battery — saved because the last one was lost

The six prompts behind `docs/research/2026-08-24-llm-path-measurement.md` were
**never recorded**. Only their task labels survived ("status", "components",
"urls", "health", "datapacks", "auth"), so the A/B run later the same day had to
reconstruct them — which made its absolute token figures incomparable to the
original per-task numbers, and said so in every writeup.

That is the whole reason this directory exists. **Anything Evaluation Mode runs
must persist its prompts verbatim alongside its results**, or the next
measurement can only compare against itself.

## What is here

| File | What it is |
|---|---|
| `prompts.json` | The battery. Each prompt declares the tool that SHOULD answer it. |
| `run.mjs` | Runs every prompt once and scores what the agent actually reached for. |
| `readonly-tools.txt` | The 43 read-only tool names, extracted live from `mcp-live-probe`'s `info`. |
| `results/<utc>.jsonl` | One immutable file per run: a row per prompt, with the full route. |
| `results/<utc>.meta.json` | Which build was serving, prompt count, cache state. |
| `score.test.mjs` | Drives all six diagnoses with fabricated transcripts. No agent runs. |

## The agent gets the surface a real project has

Four MCP servers, not one: `demo-builder`, `commerce-extensibility`, `playwright`,
`dropins`. The allowlist covers all of them — 74 read-only tools — because a
battery offering only our tools cannot tell "the agent chose us" from "the agent
had no alternative", and that distinction is the whole finding.

Read-only per tool, enumerated live from each server rather than guessed:
`commerce-extensibility` ships `aio-app-deploy`, `playwright` ships
`browser_run_code_unsafe`, `dropins` ships three `scaffold_*` writers. Widening
the surface must not widen what an unattended run can do. See
`other-servers-readonly.txt` for what is excluded and why.

Measured 2026-08-26 after the change: **10 of 10 hits, and zero prompts reached
for another server** — with 29 alternatives available including direct
competitors (`dropins` `list_slots`, `search_docs`; Playwright `browser_navigate`).

The caveat that keeps that honest: these ten prompts target OUR jobs. "Why is
this block rendering wrong?" is `dropins` territory and is not asked. The result
says our tools win on our ground, not everywhere.

## Results are never overwritten

Each run writes `results/<utc-timestamp>.jsonl` and refuses to clobber an
existing one. The first version truncated a single `results.jsonl` on startup, so
running the "after" deleted the "before" — and before-versus-after is the only
thing this battery is for.

Two things are recorded beside every run, because without them a number cannot be
compared to anything:

- **Which build was serving.** Read live from `mcp-live-probe`. The running host
  is routinely many commits behind the checkout — it was 22 behind during the
  first run.
- **Cache state**, from `BATTERY_CACHE`. Declared, never inferred: cache alone
  swung one prompt 55,236 → 8,959 in a prior measurement.

## A tool can answer an error and still look fine

`is_error` is not enough. `list_installed_datapacks` answers a signed-out session
with the prose *"Error: Adobe sign-in required…"* and `is_error: false`, so the
protocol reports success. **Four runs scored `ok` on 2026-08-26 while the tool had
answered nothing at all** — and the conclusion drawn from them, that `datapacks`
got faster after a fix, was wrong twice over: it had not got faster, it had
stopped working, and the agent was giving up sooner.

The scorer now reads the text as well as the flag, and a call whose result failed
is not a hit. Both are pinned in `score.test.mjs` against a fixture lifted
verbatim from a real run.

## Auth state is recorded, not assumed

Adobe auth is read before and after every run and written into the `.meta.json`,
and a run that crosses a sign-out is flagged. A signed-out run prints a warning
before the first prompt.

That token expired mid-afternoon on 2026-08-26 and nothing said so; a signed-out
run was compared against a signed-in baseline as though the difference were the
fix. Same discipline as cache state: declared, never inferred.

## One sample is not a result

```bash
node run.mjs --only datapacks --repeat 3
```

Agents are stochastic and every figure here is n=1 by default. On 2026-08-26 the
`datapacks` prompt changed diagnosis between two runs and read exactly like a
regression from the fix that ran in between. Three repeats settled it: **one bad
run in five**, all four others taking an identical clean route. Nothing had
broken.

Before believing any single-run change, repeat it. Before reporting one as a
regression, repeat it and say how many samples you have.

## The idea

**We know the right answer before we ask.** Every prompt names the tool that
should handle it, so "what did the agent use?" is a score rather than an
interpretation. Three outcomes:

| | meaning |
|---|---|
| **hit** | it used a tool we said should answer this |
| **around** | it used Bash or WebFetch instead — **the finding** |
| **miss** | neither; it answered from something else, or not at all |

`around` is the one worth having, and it splits two ways that look identical
until you check: either we have **no tool** for that job, or we have one and the
agent **never found it**. `published` is in the battery precisely to tell those
apart — `read_published_page` exists and does exactly that job, and on 2026-08-25
an agent hand-wrote four `curl`s to aem.live instead.

**Bash is deliberately allowed.** Deny it and every prompt is forced through our
tools, and the battery measures nothing.

## It says WHY, not just what

`around` on its own tells you something is wrong and nothing about the fix. Each
run is diagnosed, and only ONE of these means "build a new tool":

| diagnosis | what it means | the fix |
|---|---|---|
| `NOT-ANNOUNCED` | it never even searched — it did not know to look | name the tool in the generated bundle |
| `NOT-FINDABLE` | it searched, and still went around | the name or description is wrong |
| `TOOL-BROKEN` | our tool was called and errored | fix the tool |
| `TOOL-INSUFFICIENT` | it called ours, then went to the shell anyway | the tool answered, but not usefully |
| `NO-ROUTE` | neither our tool nor the shell | there may be no way to do this at all |

To tell those apart the runner records what the first version threw away: the
agent's own words, tool results, the shell commands it ran instead, and whether
it searched. **The agent usually says the gap out loud** — "there is no tool for
this, so I will use curl" — and that sentence is worth more than any inference
from the route.

The shell command it ran instead is the specification for the tool it needed.
That is exactly where `get_commerce_endpoints` came from.

Test the diagnosis without spending a run: `node score.test.mjs` (6 cases).

## Running it

From the repo, with a live extension host serving the MCP socket:

```bash
node .rptc/plans/evaluation-mode/battery/run.mjs
```

It writes `results.jsonl` beside itself: one row per run with `variant`, `task`,
`calls`, `route`, `billable`, `costUSD`, `numTurns`, `durationMs`, `isError`.

The two arms are two `AGENTS.md` variants it swaps into the projects root. It
**overwrites the developer's real home `AGENTS.md`** and does not restore it —
back it up first. That file is generated (rewritten at activation and at every
Chat launch), so the loss is recoverable, but the run should restore it rather
than leaving the treatment in place. **Fix that when this is productised.**

## The prompts, verbatim

Reconstructed from the original task labels. Kept here so the next comparison has
a fixed battery rather than another reconstruction.

| Task | Prompt |
|---|---|
| `urls` | What are the URLs for my demo project? |
| `auth` | Am I signed in to Adobe? |
| `health` | Is my project healthy? |
| `datapacks` | What sample data packs are available? |
| `components` | What components does my project use? |

`components` earns its place as a **negative control**: in the original six runs
it was the one task that did NOT call `get_current_project`, so it should be
unaffected by anything targeting that call. `auth` and `datapacks` served the same
purpose in the 2026-08-24 A/B and moved <1% while the other three dropped 25–57%
— which is what ruled out cache noise as the explanation.

## Method, and the traps it encodes

- **k=1 per cell is NOT enough for token claims.** The 2026-08-24 run got away
  with it only because two null cells acted as within-experiment controls. For a
  real claim use k=3 and report cold and warm separately — cache state alone swung
  one prompt 55,236 → 8,959.
- **Cost is not effect.** Two runs with near-identical billable tokens (165,550 vs
  165,727) cost $0.34 and $0.11, purely because one wrote cache and the other read
  it. Compare tokens, not dollars, unless dollars are the question.
- **Read the ROUTE, not just the count.** `health` went 8 calls → 4, but it shed a
  second `ToolSearch` and follow-up calls too, so its saving is not attributable to
  the one targeted change. `urls` went 3 → 2, exactly the call removed, and is the
  only clean single-variable case in that run.
- **`ENABLE_TOOL_SEARCH` is set from `settings.json`, not the environment.**
  Unsetting it in the spawned process does nothing — Claude Code re-applies the
  `env` block over the inherited environment. Override per run with
  `--settings '{"env":{"ENABLE_TOOL_SEARCH":"false"}}'`.
- **The allowlist is recoverable, not guessed.** `readonly-tools.txt` came from
  `node .claude/skills/mcp-live-probe/probe.mjs info`, which prints exactly which
  tools are callable without `--force`. Re-extract it rather than hand-editing;
  the count is a moving target as tools are added.

## What Evaluation Mode should take from this

1. **Persist prompts with results.** The failure this directory exists to prevent.
2. **Record the tool surface too** — build string from `serverInfo`, tool count,
   and the allowlist used. A comparison across builds is meaningless without it.
3. **Report cold and warm separately**, and never report cost as the headline.
4. **Keep null cells in the battery.** They are what makes a small-n result
   credible; without them a drop is indistinguishable from cache noise.
5. **Restore any file the run mutates.** See the warning above.
