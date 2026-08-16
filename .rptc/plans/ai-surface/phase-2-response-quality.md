# Phase 2 — Response quality

**Part of `.rptc/plans/ai-surface/` — read `overview.md` first.** Runs after phase 1 and before
coverage breadth: fixing the envelope before exposing more tools avoids multiplying the work.

**Research:** seven parallel agents, 2026-08-16, all findings cited in-repo. The prior research
lives at `.rptc/research/ai-surface-coverage/research.md` (2026-08-12).

## What the research changed

An earlier draft of this plan proposed six steps to score and reshape all 52 tool responses,
including a live capture harness and frequency instrumentation. **The research retired most of
it.** Recorded because the reasoning matters more than the conclusion:

| Assumption | What was measured |
|---|---|
| Output bloat is systemic | **False. 47 of 52 tools are already lean** — someone did this work for most of the surface |
| No tool shapes its output | **False.** Zero *descriptor rows* use `shape:`; the ~32 bespoke tools already project by hand |
| Need a live capture harness | **Unnecessary.** Static derivation traced all 52 with measured sizes; nothing had to be called |
| Need frequency instrumentation to rank | **Unnecessary.** Concentration is stark enough that ranking is obvious |
| 52 tools to reshape | **Five**, plus six returning `{}` |

**The harness being unnecessary is the most valuable deletion.** It was the riskiest step:
19 tools mutate state ungated and **eight take no required arguments**, so an
enumerate-and-call-with-`{}` harness would have deployed a mesh, published to the CDN,
overwritten the AI bundle and written a secrets-bearing export.

## What is actually wrong

**Five tools carry the bloat** (measured, not estimated):

| Tool | Size | The waste |
|---|---|---|
| `verify_ai_setup` | ~15–25 KB | Re-serializes all 52 tool names+descriptions into a model that already has them |
| `get_project` | 6,523 / 9,530 chars | `aiFileHashes` = 4,402 chars of SHA-256 — 46% of payload, zero model value |
| `get_component_config` | up to 13 KB | Raw bytes; can read the manifest `get_project` summarizes |
| `list_console_apis` | large | Three picker-only fields per row + a join; its one useful field is unreachable |
| `get_store_structure` | 755 → 274 | Smallest, worst ratio — 64% |

**Six tools return the literal string `{}`** — `start_demo`, `stop_demo`,
`deploy_integration`, `redeploy_integration`, `remove_integration`, `delete_mesh`.
`defaultShape` strips `success`, the handler carries no payload, and the model cannot tell
success from a no-op. This is the one *systemic* defect, and it is the opposite of bloat.

**The root cause of variance is the untyped contract.** `AnyMessageHandler` returns
`Promise<any>`; `defineHandlers` is an identity function; `HandlerResponse` has
`[key: string]: unknown`. So `defaultShape` must guess, and three different envelope
conventions reach the agent depending on which field name each author picked.

**And nothing enforces any of it.** Of 24 documented conventions, 6 are enforced, 7 partially,
**11 are prose only**. No test pins the tool count — an entire `register…Tools()` line could be
deleted from `extension.ts` and every test would pass.

## Two shipped-code defects found on the way

Independent of this plan, and worth raising separately:

1. **19 tools change state with no confirmation**, against a documented rule that says they must.
   `refresh_block_library` is called "destructive" in §9 of the same doc and is ungated.
   `promote_block_to_library` commits, pushes and publishes ungated while its literal inverse
   *is* gated.
2. **`check_mesh` can never succeed.** Its descriptor declares no `inputSchema`; its handler
   requires `workspaceId`. Every MCP invocation dies at validation. Confirmed twice, independently.

## Steps

| Step | What | Kind |
|---|---|---|
| 01 | Inventory + safety classification | **done** — see `tool-inventory.md` |
| 02 | The six `{}` returns, and `check_mesh` | TDD |
| 03 | Reshape the five concentrated tools | TDD |
| 04 | Enforcement: pin the catalog, test the envelope convention | TDD |

Blast radius is known: reshaping one tool costs 2–8 assertions in one test file; changing the
envelope for all costs 16 files and ~150 mostly-exact assertions. **Step 03 is per-tool, so it
stays in the cheap regime.** The canaries are `toolDescriptors.test.ts:33-48` and
`inExtensionMcpServer.test.ts:93` — run those two first to know if a change is contained.

## Constraints (from the record, not invented here)

- **Do not expose fire-and-forget handlers.** The disqualifier from the 2026-08-12 research:
  *"Does the return value carry the OUTCOME, or only the dispatch?"* Directly relevant to the
  six `{}` tools — fixing their return is what makes them honest.
- **No new generated skills unless multi-step-with-traps** (2026-07-11, shipped).
- **Do not add agents to save tokens** — measured: a ~121k-token derivation was performed *by* a
  subagent.
- **Tool-surface size is NOT a cost** — 52 descriptions ≈ 1,175 tokens/session. Do not
  re-propose per-task tool scoping on that basis; the claim was measured and withdrawn.
- A PM-approved **4-tier policy** already classifies AI-reachable tools
  (`docs/research/2026-05-30-ai-first-experience.md` §1a). This plan's 3-class read/mutate/destroy
  split is unreconciled with it — reconcile before relying on either.
