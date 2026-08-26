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
| `results.jsonl` | Written by a run: one row per prompt, with the full route. |

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
