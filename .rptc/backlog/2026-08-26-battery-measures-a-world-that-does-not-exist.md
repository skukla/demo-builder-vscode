---
id: AI-1n
kind: fix
area: ai
parent: AI-1
needs: []
value: high
status: shipped
layer: B
---
# The battery measures a world that does not exist, and feeds itself

## Index hook

*The item in one paragraph.*

**Two flaws that make today's headline answer unsafe rather than merely
incomplete.** First, the battery gives the agent ONLY our 45 read-only tools plus
Bash — but a real project carries four MCP servers (`demo-builder`,
`commerce-extensibility`, `playwright`, `dropins`). So every "the agent went
around us" result was measured in a world where our tools were the only option,
and the conclusion drawn from it — *discoverability is not the constraint*
(`AI-1b`) — has never been tested against the surface an agent actually has.
Second, the battery runs `claude -p` inside `~/.demo-builder/projects`, which
writes transcripts into the same directory `agent-gap-scan` reads as REAL WORK.
`run_commerce_query` already shows "17 calls in real work" and all seventeen are
battery runs of a tool that shipped the same day. The measurement is feeding its
own evidence. Filed 2026-08-26.

## Why this is not housekeeping

`AI-1b` was answered today: the agent finds tools unaided, so the 85 unused ones
are unneeded rather than unfindable, and an announcement push would be wasted.
That answer rests on battery runs where **our tools were the only tools**. With
Playwright available, "went to the shell" might instead have been "used
Playwright" — which is a different finding with a different fix.

The verdict table (`tool-verdicts`) reads both sources, so both flaws flow
straight into per-tool KEEP/DELETE judgements.

## What was measured

    project .mcp.json          demo-builder, commerce-extensibility, playwright, dropins
    battery allowlist          45 demo-builder tools + Bash + WebFetch
    run_commerce_query "usage" 17 calls, all 2026-08-26, all battery, tool shipped that day

## The two fixes

1. **Give the battery the real surface.** Allow the other three servers' tools,
   or run without an allowlist and rely on the read-only gate. Then "went around
   us" means what it says. Note the allowlist also exists to keep destructive
   tools out of an unattended run — widening it needs that property preserved.
2. **Exclude battery sessions from the corpus.** They are identifiable: one user
   turn, `claude -p`, no follow-up. Either mark them at write time (a distinct
   projects root for battery runs is cleanest) or filter them in
   `agent-gap-scan`. Filtering is retroactive and fixes the numbers already on
   disk; a separate root is cleaner going forward and does neither.

## Done when

The battery runs against the surface a real project has, `agent-gap-scan` reports
no battery sessions as real work, and `AI-1b`'s answer has been re-checked
against both. If the answer changes, so does the roadmap.

Filed 2026-08-26.

## Shipped so far

- 2026-08-26  BOTH halves done and re-measured. (1) 54 of 90 sessions were the battery measuring itself — excluded; tools-ever-called back to 20, matching the pre-battery hand analysis. (2) Battery now offers all four servers, 74 read-only tools. Re-run: 10/10 hits and ZERO prompts reached for another server despite 29 alternatives including direct dropins competitors. AI-1b's answer HOLDS, now on stronger evidence.
- 2026-08-26  Re-measured on the clean rig: cross-server calls 69/68/48 -> 22/24, shell 19/26/17 -> 2/2, billable ~4M -> ~1.2M. Most of the 'agent tunnels and falls back to the shell' finding was OUR broken rig — blocked Glob/Grep, a stale allowlist, and the user's global MCP servers competing with the project's.
