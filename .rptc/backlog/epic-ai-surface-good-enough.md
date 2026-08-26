---
id: AI-1
kind: epic
area: ai
needs: []
value: high
status: open
---
# Is the surface good enough for an agent to do the work?

The capability question, and the one that unblocks the rest of the AI area.

**Reachability is essentially closed.** The 2026-08-24 coverage scan reports 41
name-level gaps of 123 handler keys; hand-triage puts genuinely open at about
five. Adding tools is no longer the lever.

**Two things are.** Evidence — we cannot say where the surface is weak without
measuring what agents actually do (`AI-1c`). And one uncovered axis: an agent
gets **no visual feedback on a storefront**, which is what the Bodea redesign
needs (`AI-1a`).

## Children

| | |
|---|---|
| `AI-1a` | Agents have no visual feedback on a storefront |
| `AI-1b` | 105 tools, and agents reach 20 of them |
| `AI-1c` | Find the gaps in our own surface — **the evidence engine** |
| `AI-1d` | Measurement battery (plan: `evaluation-mode/measurement/`) |
| `AI-1e` | Agent round-trip optimisation |
| `AI-1f` | An open-ended design skill |

## Done when

`AI-1a` and `AI-1b` can be answered with evidence rather than opinion.
