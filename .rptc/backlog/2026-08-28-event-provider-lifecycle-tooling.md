---
id: AB-6
kind: feature
area: app-builder
needs: []
value: high
status: backlog
---

# Event-provider lifecycle tooling — so eventing round-trips to zero

Filed 2026-08-28 from the ERP round-trip journey and the owner's challenge:
*"why should we be afraid of the event providers in our teardown given that we
should have provided for deleting those providers as part of the teardown?"*

## The measured gap

In the ERP journey the agent DECLINED to wire real I/O Events delivery,
reasoning that event subscriptions are "lasting state that fights
back-to-zero" — and it was right **given the surface**: probed 2026-08-28,
**zero tools match event/provider/subscription** on the demo-builder server.
No create tool, no delete tool. The agent simulated Commerce's delivery
payload instead, which proves the app but not the eventing.

## What the owner's principle demands

Under the idempotency goal, the fix is not "let journeys create providers" —
it is **ship the pair**: create an event provider/registration AND delete it,
so a journey (or a producer) can wire real Commerce eventing and tear it all
the way down. Fear of lasting state is only rational while the delete half
does not exist.

## Scope sketch (not designed here)

- Create/list/delete event providers and event registrations against the
  project's Console workspace, through the existing guard chain.
- The starter kit's own onboarding creates providers (its `onboard` script) —
  the starter-kit journey (see `erp-roundtrip` variants) is the natural
  measure for this item once tooling exists.
- Relation to `AB-2` (per-SC Console project): provider ownership follows
  whatever project model that epic lands on.

Done when: an ERP-class journey can request real event delivery and still end
at zero, with the journey scan confirming the providers are gone.

## Shipped so far

- 2026-08-28  Owner directive 2026-08-28: this is now a committed gap to fix, not a sketch — the extension SHOULD manage event providers, for BOTH headful (wizard/dashboard UI) and headless (agent/MCP) users. Research commissioned: what it takes (APIs/SDK/CLI mechanics, starter-kit onboarding as ground truth, org-context requirements, both delivery surfaces). Research output: .rptc/research/event-provider-lifecycle/research.md
