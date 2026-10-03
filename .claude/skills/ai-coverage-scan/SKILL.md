---
name: ai-coverage-scan
description: Measure which of the extension's features an AI AGENT can actually reach. Computes the gap between the human surface (handler types behind every webview button) and the agent surface (MCP tools), since both dispatch into the same handler maps. Use when auditing AI coverage, before adding MCP tools, or when asked "can an agent do X through the extension?" — the sibling of dead-code-scan for the AI surface.
---

# AI-Surface Coverage Scan

**The coverage gap is computable, not estimable.** Every webview button dispatches into a
handler map, and MCP descriptors dispatch into the *same* maps via
`dispatchHandler(map, ctx, type, args)`. So the handler types ARE the extension's feature
spine, and a type no agent can reach is a feature the AI surface does not have.

```bash
bash .claude/skills/ai-coverage-scan/scan.sh          # summary
bash .claude/skills/ai-coverage-scan/scan.sh --list   # + every alias and exclusion, with its reason
```

## The scan was measuring itself wrong until 2026-08-24 — every earlier figure is inflated

`scan.sh` ran its own inline regex over each brace-matched map body, matching any
indented `key:`. That counts nested option objects and returned literals as handlers:
`importHandlers` reported ~30 keys (`context`, `success`, `data`, `begin`, `code`) where
the map has **7**. `handler-keys.mjs` was written to fix exactly this, ships beside it,
passes its own self-test — and was never wired in. It is now.

**Do not cite any coverage figure taken before 2026-08-24.** The 106/53/50% baseline
below it is superseded.

## Baseline — 2026-08-24, `develop` @ beta.141 (fixed extractor)

| | 2026-08-24 @ beta.141 | 2026-08-30 @ beta.145 |
|---|---|---|
| Handler-map keys (the human surface) | 123 | **127** |
| Reachable by an MCP tool, by name | 59 | **61** |
| Uncovered | 64 (23 UI-only, 41 agent-relevant) | 66 (23 UI-only, **43 agent-relevant**) |
| **Agent-relevant name gap** | 41 — 33% | **43 — 34%** |

These two columns are the UNTRIAGED name gap. They are kept as history; the current,
triaged figure is in the next section.

By area (2026-08-30): `ProjectCreationHandlerRegistry` (14), `edsHandlers` (9),
`dashboardHandlers` (9), `addIntegrationFlowHandlers` (5), the rest 1–2 each.

**Both columns are kept on purpose.** The gap grew by two in six days, and a single
replaced number would have hidden that the surface moved on BOTH sides — four new
handlers, two newly covered. A one-column table cannot tell "we added features" from
"we lost coverage", and those call for opposite responses.

## The count is triaged — read "real gap" and "untriaged", not the old percentage

Matching handler names against tool names cannot tell "no tool exists" from "the tool
is called something else", and cannot tell a feature from the message channel talking to
itself. Until 2026-10-03 the scan reported both as a gap (the "34%" of AI-1r). Every
uncovered handler was then read, one at a time, and the reading lives in
`triage.json` beside the script, each row with its reason:

| List | Means | 2026-10-03 |
|---|---|---|
| `aliases` | reachable through a tool with a different name | 23 |
| `exclusions` | an agent has no business calling it (channel plumbing, wizard state, a pasted credential) | 17 |
| `gaps` | read and judged a REAL gap | 6 |

The scan also reads `dispatchHandler(map, ctx, 'key', …)` inside directly-registered
tools, so a handler a tool calls by hand counts as covered without a row (2 today:
`github-oauth` via `sign_in`, `storefront-setup-start` via `create_project`).

**Measured 2026-10-03, branch `loop/2026-10-03-overnight`:** 172 handler types; 123
reachable (98 by name, 2 dispatched, 23 aliased); 43 not for an agent (26 UI verbs, 17
listed); **6 real gaps (3%)**; 0 untriaged. The same tree under the old rule read 48
(28%). The six: settings import from a path (`importFromFile`), headless project reset
(`resetProject`), the credential-service probe (`check-credential-service`), DA.live
sign-out (`clear-dalive-auth`), GitHub account switch (`github-change-account`), and the
"Add another ERP" options read (`getErpOwnershipOptions`).

**UNTRIAGED is the number to act on.** A handler added after the last reading lands
there. Read the handler (not its name), then add one row to `triage.json`. A rising
real-gap count is still a prompt to look, never a backlog: `tool-verdicts` found that a
tool nobody's prompt asks for is not obviously worth adding.

**The file is checked on every run**, because a list nothing checks rots. A row whose
handler is gone, whose tool is gone, that is now covered by name, that sits in two lists,
or that has no reason is printed under STALE TRIAGE ROWS and the scan exits 1.
`python3 coverage.py --self-test` proves each of those refusals fires.

Two readings the earlier hand triage got wrong, kept as the reason to read the code:
`republishContent` is `sync_content` (both call `republishStorefrontContent`), not
`republish`, which publishes `config.json` only; and `importFromFile` is half covered —
a zip bundle through `add_shared_demo`, a settings file through nothing.

What the count structurally cannot see is cost. A feature reachable through a tool can
still be unusable: the ~121k-token block-shape derivation is invisible here because
`list_blocks` exists, so blocks read as "covered".

**Re-measure before trusting this table.** Backlog entries in this repo rot precisely because
nobody re-runs the number; that is what the scan is for.

**And say which tree you measured.** The numbers above are develop-only. Running this in a
worktree with a feature branch merged in gives different totals — the first draft of the sibling
backlog item reported a tool count from an integration worktree next to coverage numbers from
develop, and the mismatch was invisible until a release forced a re-measure. Feature branches add
handlers AND tools, so both halves move.

**Held stable across a decomposition refactor**, which is the useful proof that it measures the
map rather than the files: `2568dd78` split `dashboardHandlers` 1,213 -> 220 lines into five
sibling modules with verbatim re-exports, and the scan correctly reported no change.

## Three traps, each of which produced a wrong number before the scan was trusted

1. **Handler keys use TWO conventions.** Unquoted camelCase (`requestStatus:`) and quoted
   kebab-case (`'provision-accs-credentials':`). Matching one gives ~50 types instead of 106 —
   and the resulting figure looks plausible, which is what makes it dangerous.
2. **Not every MCP tool is a descriptor row.** Many are registered directly
   (`createProjectTool.ts`, `resetProjectTool.ts`). Counting only descriptor `type:` values reports
   **81%** uncovered against a true **50%** — a 30-point overstatement, because
   `create-project` looks uncovered while the `create_project` tool exists. The scan normalizes
   (strip `-`/`_`, lowercase) and matches against every tool name it can find.
3. **A raw count overstates the gap.** Roughly a quarter of uncovered types are UI-only —
   `navigateBack`, `openBrowser`, `showDashboard` — which an agent has no business calling. The
   scan separates them with a verb-prefix heuristic. **The heuristic is crude:** it will
   misfile anything whose name starts with a UI verb but does real work. Read `--list` before
   quoting the number.
   A `triage.json` row wins over the heuristic, so a verb-named handler that does real work
   can be listed as an alias or a gap.

## What the scan CANNOT tell you

It measures **reachability, not usability**. A feature reachable through a tool may still be
expensive to use — the tool may return too little, forcing the agent to derive what the
extension already knows. This session measured a subagent spending **~121,000 tokens** deriving
block authoring shapes that sit in `component-definition.json`, a file no tool exposes. That
gap is invisible to this scan: `list_blocks` exists, so blocks read as "covered".

So pair it with the judgement question the count cannot answer: *for each covered feature, does
using it cost what it should?* See
`.rptc/backlog/2026-08-16-mcp-surface-for-sc-design-work.md` for the tool-class framing
(transport / knowledge / composite / verification) that came out of asking it.

It also says nothing about **skills or agents** — the other two layers of the AI surface. A
generated project ships no `.claude/agents/` at all, and its skills cover App Builder with seven
role-shaped personas while the EDS storefront gets task-shaped skills only.

## Verify

The scan aborts if it finds zero handler types, because an empty result from a broken extractor
is indistinguishable from a codebase with no handlers. Beyond that: run `--list` and confirm a
handful of entries by opening the named file. The count is only as good as the two regexes.
