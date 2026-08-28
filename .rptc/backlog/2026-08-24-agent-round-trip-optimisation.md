---
id: AI-1e
kind: feature
area: ai
parent: AI-1
needs: AI-1c
value: med
status: active
layer: C
---
# Agent round-trip optimisation — four measured candidates

## Index hook

*The item in one paragraph. Moved off the index 2026-08-26, which carried a second copy that drifted from this file.*

**The round trip is the unit of cost, not the payload** — measured 2026-08-24 across six driven agent runs: 2 calls and 4 calls cost the SAME (~47k billable), 9 cost 82k, while our entire surface (103 tool schemas + all generated guidance) is ~3,900 tokens against a ~20k floor that belongs to Claude Code, not us. So shrinking responses barely moves anything at this scale (`list_projects` returns 127 bytes and still costs a whole turn) and shrinking the catalog moves less. Four candidates, each to be run measure → fix → re-measure against the fixed six-prompt battery, k=3, cold and warm separated (cache state alone swung one prompt 55,236 → 8,959): (1) **the self-inflicted orientation call** — the generated home AGENTS.md ORDERS `get_current_project` in bold before any action and 5 of 6 runs obeyed; that file is rewritten every activation so it can simply state the project; (2) the orientation trio, pending re-measure after (1); (3) **catalog preload vs `ToolSearch`** — 6/6 runs opened with a discovery call, which is Anthropic's documented progressive-disclosure pattern for 150k-token catalogs but may be a straight loss at our 2,616, so settle it with an A/B rather than an assumption; (4) **unknown arguments are silently dropped on 102 of 103 tools** — only `configure_project` uses zod `.strict()`, so on a write tool a misspelled argument is discarded rather than refused. Explicitly NOT to do: shrink the catalog, treat response size as the main lever, or grade agents on their path (Anthropic: "too rigid … overly brittle"). Independent of the Evaluation Mode plan, which makes this loop repeatable but is not a prerequisite. Filed 2026-08-24.

**Filed:** 2026-08-24, from the first real measurements of what an agent task
costs against this extension.

**Evidence:** `docs/research/2026-08-24-llm-path-measurement.md` (six driven
runs plus a cold-start decomposition) and
`.rptc/research/agent-efficiency-measurement/research.md` (what Anthropic
documents). Reproduce any figure with `node scripts/trace-session.mjs`.
## Shipped so far

- 2026-08-24  Candidate 1 — the self-inflicted orientation call. The home AGENTS.md states the active project instead of ordering `get_current_project`

Three candidates remain (the orientation trio, catalog preload vs `ToolSearch`, and `.strict()` on write tools). Each is measure → fix → re-measure.
- 2026-08-26  Candidate 1 (the self-inflicted orientation call) MEASURED as still live on the headless path: 9 of 10 battery paths opened ToolSearch -> get_current_project. Cause is not this candidate being wrong but AI-1g — the home AGENTS.md carries whichever of two contents was written last, and activation writes the ordering branch.

## The finding that reorders everything

**The round trip is the unit of cost, not the payload.**

| Task | Calls | Billable tokens |
|---|---|---|
| components | 2 | 47,550 |
| auth | 3 | 47,460 |
| urls | 4 | 46,807 |
| health | 9 | 82,447 |

Two calls and four calls cost the **same**. Nine cost 82k. Meanwhile our entire
surface — 103 tool schemas plus every word of generated guidance — measures
**~3,900 tokens** (cold A/B isolation), against a ~20,006-token floor that is
Claude Code's own system prompt and not ours to cut.

So: shrinking responses barely matters at this scale (`list_projects` returns 127
bytes and still costs a whole turn), and shrinking the catalog matters even less.
**Removing a round trip is the only lever with real leverage.**

Anthropic's guidance agrees and names the mechanism — consolidation is their lead
recommendation, and their worked example (replace `list_users` + `list_events` +
`create_event` with one `schedule_event`) is the exact shape of candidate 2.

## Method for every item here

**Measure → fix → re-measure**, one candidate at a time (owner's decision). Use
the six prompts in the research doc as the fixed battery, k=3, **cold and warm
reported separately** — cache state alone swung the same prompt 55,236 → 8,959,
so a comparison that ignores it is noise.

## 1. The self-inflicted orientation call — SHIPPED 2026-08-24

The generated home `AGENTS.md` said, in bold:

> "**Before starting any project task, call the `get_current_project` MCP tool**
> and state which project you are working on … before taking any action"

5 of 6 driven runs called it. **The agent was doing exactly what we told it to.**

### The premise this item was filed on was wrong

It said: *"That file is regenerated on every VS Code activation, so it can simply
state the current project."* Both halves are true; the conclusion does not follow.
Verified before implementing:

- `ensureHomeAiContext` has exactly ONE production caller — `extension.ts:292`,
  at activation, fire-and-forget. That was the only time the home `AGENTS.md` was
  written.
- The current-project pointer lives in `state.json` and any window can change it
  at any moment. `StateManager.getCurrentProject()` re-reads it from disk on every
  call, and the comment at `stateManager.ts:210` says why: a cached pointer meant
  "right data, wrong project".
- `openInClaude.ts:55` already documented the session half — "a resumed
  conversation doesn't re-read the home `AGENTS.md`, so it can keep stale 'current
  project' context". That is why `REHOME_PROMPT_PREFIX` exists.

A name written at activation is stale the moment the user selects a different
project, and the agent would then state it confidently and act on it.

### What shipped instead — two changes, not one

1. **`refreshHomeAgentsMd`** writes ONLY `AGENTS.md`, stating the active project,
   called from `OpenInClaudeCommand.execute()`. Launch is the one moment the
   pointer can be read and handed to an agent while it is still true.
2. **Activation still writes no name**, keeping the original "call the tool first"
   directive verbatim. When we cannot know, we must not claim.

Reuse is unchanged: a resumed conversation never re-reads the file, so
`REHOME_PROMPT_PREFIX` still forces a fresh call, which is correct there.
`AI_CONTEXT_VERSION` 21 → 22.

### Measured — A/B, 2026-08-24

Five reconstructed prompts, both arms, live server `develop@043fa0db6`, the same
43-tool read-only allowlist. `get_current_project` was called in **3 of 5** control
runs and **0 of 5** treatment runs. Zero errors in either arm.

| Task | Calls before → after | Called the tool? | Billable |
|---|---|---|---|
| urls | 3 → 2 | yes → no | −25% |
| health | 8 → 4 | yes → no | −57% |
| components | 4 → 2 | yes → no | −40% |
| auth | 2 → 2 | no → no | +0.1% |
| datapacks | 4 → 4 | no → no | −0.7% |

The two unchanged rows are the within-experiment control: tasks that never made the
call barely moved, so the drops are not cache noise.

**Limits, stated so they are not over-read.** One run per cell. `urls` is the only
clean single-variable case (exactly the targeted call removed); `health` and
`components` shed extra steps whose cause is not pinned at n=1. The six original
prompt strings were never recorded, so these five are RECONSTRUCTED from the task
labels — fine for an A/B where both arms share a prompt, NOT a basis for comparison
against the original per-task token figures.

## 2. The orientation trio

`get_current_project` + `list_projects` + `get_project` before the real question,
on a machine with one project. Responses are 123, 127 and 2,773 bytes — the cost
is three turns, not the bytes.

Candidate 1 may remove the first of these on its own; re-measure before designing
a consolidated tool, or we will build something for a problem already solved.

**Update 2026-08-24, after candidate 1 shipped:** in the five treatment runs the
trio did not appear at all — no `get_current_project`, and `list_projects` in
none of them. On this evidence there may be nothing left here to consolidate.
Re-measure on a machine with SEVERAL projects before writing this off: the runs
above were on a one-project machine, which is exactly the case where naming the
project up front removes the most searching.

## 3. Catalog preload vs `ToolSearch` — MEASURED AND REJECTED 2026-08-24

All 6 runs opened with `ToolSearch`; two ran it again mid-task. The item asked
whether paying a round trip to avoid loading a ~2,616-token catalog was a straight
loss, and proposed an A/B to settle it.

**It was run. Preloading costs ~2.8× more. Do not do this.**

`ENABLE_TOOL_SEARCH` is the lever — an env var, opt-in, set in the developer's
`~/.claude/settings.json`. Override it per-run with
`--settings '{"env":{"ENABLE_TOOL_SEARCH":"false"}}'`; unsetting it in the spawn
environment does NOT work, because Claude Code re-applies the `env` block from
settings.json over the inherited environment.

Same prompt ("What are the URLs for my demo project?"), same 43-tool read-only
allowlist, repeated, warm on both arms:

| Arm | Calls | Billable (warm) |
|---|---|---|
| `ToolSearch` on — discover as needed | 3 | **~165,000** |
| `ToolSearch` off — schemas preloaded | 2 | **~463,000** |

Three runs of the preload arm landed at 448k–463k; the discovery arm holds near
165k. The gap is far outside cache noise, and both arms were warm.

### Why the premise was wrong

The item reasoned from OUR catalog size. Wrong denominator: `ToolSearch` defers
**every MCP server the developer has connected** — serena, the Docker set, helix,
fluffyjaws, Adobe EXL, Chrome, Drive — not just demo-builder's 103 tools.
Preloading pays for all of them on every task whether or not they are touched.
Demo Builder is a rounding error inside that number.

So Anthropic's guidance holds here, for a reason we had misidentified: not that
our surface is large, but that a real developer's total MCP surface is.

### What this retires

The framing that "the round trip is the unit of cost, therefore removing round
trips is always the lever" — true for candidate 1, false here. A round trip that
defers 300k tokens of schema is buying more than it costs. **Removing a round trip
is only a win when what it defers is cheaper than the turn.** Measure the deferred
payload before treating any remaining `ToolSearch` call as waste.

## 4. Unknown arguments silently dropped on write tools — SHIPPED 2026-08-24

Only `configure_project` used zod `.strict()` (`configureProjectTool.ts`). Every
other tool passed a raw shape, which the MCP SDK wraps in `.strip()`.

**Confirmed against the real SDK before fixing anything** (probe over
`InMemoryTransport`, since the stub server most suites use throws the schema
away and cannot see this):

| Schema style | What the handler received |
|---|---|
| raw shape | `{name:'x'}` — the unknown key silently gone, tool answers "ok" |
| `z.object(...).strict()` | handler NEVER RAN; `isError:true`, message names the field |
| `inputSchema: {}` | `{}` — unknown key stripped |

### What shipped

`strictifyWriteSchema` in `inExtensionMcpServer.ts`, applied inside
`withToolLogging.registerTool` — the ONE seam every registration passes through
(`registerProjectTools` and `registerExtraTools` both receive it), so a new tool
is covered the day it is written rather than whenever someone remembers.

Reads stay permissive by design: a dropped argument on a query gives a visibly
wrong answer, while a strict read tool mostly costs friction.

### The trap that would have shipped a regression

Several write tools declare NO arguments (`republish`, `sync_content`), while the
generated guidance tells agents destructive tools take `confirm:true`. Naive
strictification rejects exactly the call the guidance asks for — turning a safety
affordance into a hard failure. `CONSENT_FIELDS` allows `confirm`/`confirmName`
through on every write tool; declared shapes still win. Two of the five tests
exist for this case specifically.

### Checked and clear — no bug

Because the consent gate reads args INSIDE the SDK handler (after stripping), a
tool reading `confirm` without declaring it would have a dead guard. Audited every
hand-written destructive tool: declarations and reads match 1:1, and descriptor
rows add `confirm` via `toolDescriptors.ts:182`. Same check for `confirmName`:
clean. The consent mechanism is intact.

### Side finding, left in place deliberately

`configure_project`'s hand-written unknown-field check is now unreachable —
`.strict()` rejects first. Kept as the fallback for any registration path that
bypasses the wrapper, and because its message names the ACCEPTED fields where the
SDK's names only the offending one. Its unit test calls the handler directly, so
it exercises the contract rather than the live path; comment added at the code
so the absence of that message from logs is not a mystery.

Separately proposed and NOT done: checking whether the SDK exposes Anthropic's
API-level `strict: true`, which constrains what the model emits and is
complementary rather than the same thing.

## What NOT to do, and why

- **Do not shrink the tool catalog.** Measured at ~2,616 tokens; it is not the
  problem, and cutting tools costs coverage.
- **Do not chase response size as the primary lever.** Phase 2's reshaping was
  worth doing; the framing that bytes are the main cost is what the measurement
  contradicts.
- **Do not disable `ToolSearch`.** Measured 2026-08-24: preloading every
  connected MCP server's schemas costs ~2.8× (see item 3). The round trip it
  spends is buying far more than it costs.
- **Do not assume removing a round trip is always a win.** It was for item 1;
  it is the opposite for item 3. The test is whether the deferred payload is
  cheaper than the turn — measure the payload, not the call count.
- **Do not grade agents on the path they take.** Anthropic: "too rigid … overly
  brittle, as agents regularly find valid approaches that eval designers didn't
  anticipate." Grade outcomes; the path is a diagnostic.

## Relationship to Evaluation Mode

The approved Evaluation Mode plan does **not** execute these — it makes the
measure → fix → re-measure loop repeatable and puts it in a user's hands. These
four can and should proceed with the existing manual loop
(`scripts/trace-session.mjs` plus headless `claude -p` runs) without waiting.
