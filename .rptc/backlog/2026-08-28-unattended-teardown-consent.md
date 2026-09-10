---
id: AI-7
kind: question
area: ai
needs: []
value: med
status: shipped
---

# Unattended teardown consent — how does a commissioned journey get to zero?

Filed 2026-08-28 from the ERP round-trip journey: the agent called
`remove_integration` with `confirm:true` and was refused — correctly. The
consent gate is two-layered (`inExtensionMcpServer.ts` + `agentOperationNotifier.ts`):
ask the CHAT via MCP elicitation first, fall back to a modal in the VS Code
window with a timeout-refusal. A headless `claude -p` run has neither a chat
user nor a window-watcher, so unattended teardown is structurally impossible
today. The journey ended one human click from zero.

## The question

The owner commissions a journey INCLUDING its teardown, then leaves. Should
there be a way for that standing authorization to reach the consent gate —
and what shape keeps it safe?

Candidate shapes (decision needed before any build):

1. **Named, single-use pre-approval** (recommended candidate): before the
   run, the owner grants exactly `remove_integration` on exactly the
   component the journey will create (the shape `delete_adobe_project`'s
   `confirmName` already uses for "prove you mean THIS one"). Consumed on
   first use, expires with the session. A blanket "auto-approve destructive
   ops" mode is explicitly NOT a candidate.
2. **Interactive-only, by policy**: unattended journeys stop at the consent
   edge and that is the design — the human click IS the feature. Costs:
   every write journey needs the owner present for its final minutes.
3. **Elicitation-aware harness**: run journeys through an interactive session
   the owner primes ("approve the teardown when asked") — no code change,
   but the owner must stay reachable in-chat.

## Evidence to carry

- The gate worked exactly as designed under an unattended attempt — this item
  is about AUTHORIZED reversal, not about weakening the gate.
- The journey doc (`.rptc/plans/evaluation-mode/journeys/erp-roundtrip.md`)
  records the full trace.

## Shipped so far

- 2026-08-28  ANSWERED same day: the capability already exists — demoBuilder.ai.requireAgentConsent (default on, read live per call; agentOperationNotifier.ts:113). Owner granted consent verbally; the setting was turned off in the dev-host profile and the ERP journey's teardown then ran unattended: remove_integration succeeded, zero-state diff verdict AT ZERO. The refinement that remains OPEN if field use wants it: a granular per-tool pre-approval list instead of the blanket boolean (candidate 1 in the body) — file separately if the blanket off proves too broad.
