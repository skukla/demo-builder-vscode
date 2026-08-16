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

## Baseline — 2026-08-16, `develop` @ beta.131, **after the extractor was fixed**

| | |
|---|---|
| Handler types | 122 |
| Reachable by an MCP tool | 35 |
| Uncovered | 87 (25 UI-only, **62 agent-relevant**) |
| **Agent-relevant gap** | **62 — 51% of the surface** |

**The previous readings were wrong, and by more than drift.** This scan reported 143 / 35 / 83
until its handler extractor was replaced on 2026-08-16. It brace-matched the MAP correctly and
then matched `^\s+key:` across the whole block, so it counted object properties inside handler
BODIES — `auth: context.authManager`, and `success`/`data`/`context`/`error` in returned objects.

The error was not uniform, which is what made it survive. It **inflated** files with fat handler
bodies (23 reported in `importHandlers`, which has 7) and **deflated** the total by deduping
names across maps. Two errors partly cancelling produce a plausible number, and 83 was quoted
into a program plan before anyone checked it.

Extraction now runs through `handler-keys.mjs`, a character-level parser that tracks brace depth
and skips strings, template literals and comments. It carries a `--self-test`. **A line-based
depth counter was tried as the fix first and failed its own control** — handler bodies span
lines, so depth at the newline says nothing about depth where the key sits.

Verified against a hand-read of the three data-installer maps: scan and reading now agree on all
9 unexposed handlers, name for name.

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

**A tool that bypasses the handler maps is invisible to it.** Measured 2026-08-16: adding seven
content-authoring and block-knowledge tools (`read_page`, `write_page`, `publish_page`,
`list_content`, `delete_page`, `read_published_page`, `get_block_authoring_shape`) moved this
number **by zero** — they adapt EDS services and the filesystem directly rather than dispatching
into a map, so there is no handler type for them to cover. Before that work an agent could not
write a page at all; the scan reported the same 82 either way.

So the number answers "how much of the WEBVIEW's surface can an agent reach", which is not the
same question as "what can an agent do". Do not read a flat number as no progress, and do not
expect direct-registered tools (`src/features/ai/server/*Tools.ts`, `mcp-server.ts`) to move it.

It measures **reachability, not usability**. A feature reachable through a tool may still be
expensive to use — the tool may return too little, forcing the agent to derive what the
extension already knows. A subagent was measured spending **~121,000 tokens** deriving block
authoring shapes that sit in `component-definition.json`. That gap was invisible to this scan:
`list_blocks` existed, so blocks read as "covered". **Closed 2026-08-16** by
`get_block_authoring_shape`, which answers for one block in ~92 bytes — and, per the section
above, moved this scan's number by zero.

So pair it with the judgement question the count cannot answer: *for each covered feature, does
using it cost what it should?* See
`.rptc/plans/ai-surface/overview.md` for the tool-class framing
(transport / knowledge / composite / verification) that came out of asking it.

It also says nothing about **skills or agents** — the other two layers of the AI surface. A
generated project ships no `.claude/agents/` at all, and its skills cover App Builder with seven
role-shaped personas while the EDS storefront gets task-shaped skills only.

## Verify

The scan aborts if it finds zero handler types, because an empty result from a broken extractor
is indistinguishable from a codebase with no handlers. Beyond that: run `--list` and confirm a
handful of entries by opening the named file. The count is only as good as the two regexes.
