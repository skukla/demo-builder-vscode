# AI-surface coverage — make the extension usable BY an agent

**Promoted from** `.rptc/backlog/2026-08-16-mcp-surface-for-sc-design-work.md` on 2026-08-16.
That file holds the research; this holds the execution. Do not duplicate findings here — cite it.

## Goal

An agent working inside the extension should be able to do what a human can, at a cost
proportional to the task. Today it cannot do the central thing (author storefront content) and
pays to rediscover what the extension already knows.

## Why, in one measurement each

| Finding | Evidence |
|---|---|
| Capability gap | 53 agent-relevant handler types unreachable; **zero** tools author content |
| Cost gap | a subagent spent **~121,000 tokens** deriving block shapes that sit in `component-definition.json` |
| Shaping gap | `get_store_structure` returns 701 chars where 186 carries the same information — **73%** — and **no tool overrides `defaultShape`** |
| Enforcement gap | a generated project ships **one** hook, a sync hook; **zero** guards |
| Agent layer | does not exist — no `.claude/agents/` at all |

## Phases

Strictly sequential; each is the next one's denominator. **Phase 1 only in this plan** — later
phases get their own plans once their denominator exists.

1. **Tools** — response analysis, all 52, then reshape by impact ← *this plan*
2. Skills — coverage against the post-Phase-1 tool surface
3. Agents — only where a flow spans 3+ skills with a required order
4. Hooks — enforcement for traps the first three surfaced

## Steps in this plan

| Step | What | Kind |
|---|---|---|
| 01 | Inventory + safety classification, all 52 | analysis |
| 02 | Capture harness (`tools/call` on the probe pattern, allowlist-gated) | TDD |
| 03 | Live capture + scoring — read-only tools | analysis |
| 04 | Static derivation + scoring — mutating and destructive | analysis |
| 05 | Frequency instrumentation, then rank by size × frequency | TDD |
| 06 | Reshape by rank, each with a pinned-shape test | TDD |

## Constraints

- **Never call a destructive tool to measure it.** Step 02's harness is allowlist-gated so a
  newly added `delete_*` is excluded by default rather than by anyone remembering.
- **Rank by size × frequency, never size alone.** A large response called once matters less than
  a small one called forty times.
- **Ground truth is `probeInExtensionMcpTools`**, not a grep. A grep already produced a wrong
  count in this research by reading the wrong worktree.
- **Say which tree every number came from.** The same error mixed a 58-tool count from an
  integration worktree with coverage numbers from develop.
- Reshaping must not change what a tool CAN do — only what it returns. Each gets a test pinning
  the projected shape so it cannot regress to the raw payload.

## Done when

All 52 tools have a scored row and a ranked work list exists; the highest-impact reshapes are
applied with pinned tests. Phase 2 can then start against a stable tool surface.
