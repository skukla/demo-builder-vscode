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
bash .claude/skills/ai-coverage-scan/scan.sh --list   # + every uncovered feature
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

| | |
|---|---|
| Handler-map keys (the human surface) | 123 |
| Reachable by an MCP tool, by name | 59 |
| Uncovered | 64 (23 UI-only, **41 agent-relevant**) |
| **Agent-relevant name gap** | **41 — 33% of the surface** |

By area: `ProjectCreationHandlerRegistry` (14), `edsHandlers` (9), `dashboardHandlers` (7),
`addIntegrationFlowHandlers` (5), the rest 1–2 each.

## The number is an UPPER BOUND, not a work list — read this before sizing anything

The scan matches handler names against tool names. It cannot see that a feature is
already reachable under a DIFFERENT name, and it cannot see that a handler must never be
exposed. Triaged by hand 2026-08-24, the 41 break down roughly as:

- **Already reachable, different name** — `getProjects` → `list_projects`, `switchOrg` →
  `select_org`, `requestStatus` → `get_project_status`, `exportProject` →
  `export_project_settings`, `republishContent` → `republish`, `get-github-repos` →
  `list_github_repos`, `validateSelection` → `validate_component_selection`, the whole
  auth cluster → `get_auth_status` / `sign_in` / `connect_dalive`. The majority.
- **Disqualified by design** — wizard/webview plumbing that carries dispatch rather than
  outcome (`ready`, `log`, `loadPreset`, `update-components-data`, `re-detect-context`,
  `storefront-setup-cancel`). The standing rule: *does the return value carry the
  OUTCOME, or only the dispatch?*
- **Disqualified by headless-safety** — `importFromFile` opens a
  `vscode.window.showOpenDialog`. A path-taking variant would qualify; the handler as
  written does not.
- **Genuinely open, and it is a handful** — settings import (a path-taking variant),
  sign-out / GitHub account switching, `check-credential-service`,
  `provision-accs-credentials`, non-EDS project reset.

So: **the reachability axis is essentially closed.** Treat a rising number as a prompt to
look, never as a backlog. And note what the count structurally cannot see — cost. A
feature reachable through a tool can still be unusable: the ~121k-token block-shape
derivation is invisible here because `list_blocks` exists, so blocks read as "covered".



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
   (`createProjectTool.ts`, `edsResetTool.ts`). Counting only descriptor `type:` values reports
   **81%** uncovered against a true **50%** — a 30-point overstatement, because
   `create-project` looks uncovered while the `create_project` tool exists. The scan normalizes
   (strip `-`/`_`, lowercase) and matches against every tool name it can find.
3. **A raw count overstates the gap.** Roughly a quarter of uncovered types are UI-only —
   `navigateBack`, `openBrowser`, `showDashboard` — which an agent has no business calling. The
   scan separates them with a verb-prefix heuristic. **The heuristic is crude:** it will
   misfile anything whose name starts with a UI verb but does real work. Read `--list` before
   quoting the number.

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
