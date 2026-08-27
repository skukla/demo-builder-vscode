---
id: AI-6
kind: fix
area: ai
needs: []
value: med
status: backlog
---

# One agent deploy, three progress notifications

<!-- Do NOT template this body. Items vary because the work varies; the
     provenance, the measurements and the caveats are what make an item useful
     months later. The frontmatter carries the structure so the prose need not. -->

Filed 2026-08-27, from the owner's screenshot during the kit-deploy live test.

One agent-triggered deploy showed THREE progress notifications at once: the
agent-operation notifier's wrapper ("Demo Builder — agent: Deploying the
integration…"), the handler's own `withComponentProgress`
("Deploying Commerce Integration Starter Kit"), and a duplicate of the
latter (a probe reconnect started a second operation). The owner also
flagged the notification text as too long — the wrapper's title + phase
concatenation wraps over two lines.

Wanted: ONE notification per operation on the agent path (the notifier
should adopt the handler's progress rather than stacking its own), and
shorter titles. The notifier lives in `agentOperationNotifier.ts`; the
handler progress in `withComponentProgress`.
