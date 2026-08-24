# Agent round-trip optimisation — four measured candidates

**Filed:** 2026-08-24, from the first real measurements of what an agent task
costs against this extension.

**Evidence:** `docs/research/2026-08-24-llm-path-measurement.md` (six driven
runs plus a cold-start decomposition) and
`.rptc/research/agent-efficiency-measurement/research.md` (what Anthropic
documents). Reproduce any figure with `node scripts/trace-session.mjs`.

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

## 1. The self-inflicted orientation call — highest confidence, lowest cost

The generated home `AGENTS.md` says, in bold:

> "**Before starting any project task, call the `get_current_project` MCP tool**
> and state which project you are working on … before taking any action"

5 of 6 driven runs called it. **The agent was doing exactly what we told it to.**

That file is regenerated on every VS Code activation, so it can simply *state*
the current project instead of ordering a call to discover it. The instruction's
intent — "naming it up front confirms you and the user are on the same project" —
is preserved by stating the name; only the round trip goes.

Change `agentsMdSections.ts` (home section); bump `AI_CONTEXT_VERSION` per
`ai-context-authoring`, or existing projects never receive it.

## 2. The orientation trio

`get_current_project` + `list_projects` + `get_project` before the real question,
on a machine with one project. Responses are 123, 127 and 2,773 bytes — the cost
is three turns, not the bytes.

Candidate 1 may remove the first of these on its own; re-measure before designing
a consolidated tool, or we will build something for a problem already solved.

## 3. Catalog preload vs `ToolSearch` — settle with an A/B

All 6 runs opened with `ToolSearch`; two ran it again mid-task.

This is **not** a defect: Anthropic documents `search_tools` as deliberate
progressive disclosure, worth 150,000 → 2,000 tokens for agents with very many
tools. But **our catalog is ~2,616 tokens**, so paying a round trip to avoid
loading it may be a straight loss.

Do not "fix" this by assumption — run the A/B (catalog preloaded vs discovery)
and let the number decide. This is the one place our measurement can beat general
guidance, precisely because the guidance targets a different scale.

## 4. Unknown arguments are silently dropped on 102 of 103 tools

Only `configure_project` uses zod `.strict()` (`configureProjectTool.ts:234`).
Every other tool passes a raw shape, which the MCP SDK wraps in `.strip()` —
unknown keys vanish before the handler runs.

`mcp-tool-authoring` already records why that one is strict: a
`{addons, stroeScope}` typo applied the addons and discarded the typo, silently.
On a **write** tool that is the dangerous shape — the agent believes it asked for
something it did not, and finds out through a wrong result rather than an error.

Scope to write tools first; a strict read tool mostly costs friction. Separately,
check whether the SDK exposes Anthropic's API-level `strict: true`, which
constrains what the model emits and is complementary, not the same thing.

## What NOT to do, and why

- **Do not shrink the tool catalog.** Measured at ~2,616 tokens; it is not the
  problem, and cutting tools costs coverage.
- **Do not chase response size as the primary lever.** Phase 2's reshaping was
  worth doing; the framing that bytes are the main cost is what the measurement
  contradicts.
- **Do not grade agents on the path they take.** Anthropic: "too rigid … overly
  brittle, as agents regularly find valid approaches that eval designers didn't
  anticipate." Grade outcomes; the path is a diagnostic.

## Relationship to Evaluation Mode

The approved Evaluation Mode plan does **not** execute these — it makes the
measure → fix → re-measure loop repeatable and puts it in a user's hands. These
four can and should proceed with the existing manual loop
(`scripts/trace-session.mjs` plus headless `claude -p` runs) without waiting.
