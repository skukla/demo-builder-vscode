---
id: AB-8
kind: question
area: app-builder
needs: []
value: med
status: open
---

# Where does event-provider management belong, and what does an SC do with it?

Filed 2026-09-09, the day the first answer was pulled off develop. [[AB-6]] keeps
the CAPABILITY question — can eventing round-trip to zero. This holds the one
that sank the implementation: **who goes looking for event providers, from
where, and what do they expect to see.**

Two items rather than one because they close on different evidence. AB-6 closes
when an agent can tear an event provider down. This closes when someone can say
where that belongs in the product — and no amount of shipping settles it.

## What was built, and precisely how it failed

A lazy, workspace-scoped `EventingSection` below the integrations grid, plus five
MCP tools and a lifecycle service. Exercised in the Extension Development Host on
2026-09-09. The owner's verdict: **poorly designed and incomplete.**

The incompleteness is not a matter of taste. Expanding the section flips the
caret and reveals a refresh button, and then nothing loads — no rows, no spinner,
no empty-state message. A person clicks a disclosure and gets a blank area with
no indication whether it is loading, empty, or broken.

The design fault is separable from that and is the more interesting one. The
section was placed where the DATA was cheap to fetch — the project's Console
workspace — not where a person would look for it. Someone arrives at a screen
called Integrations to see their integrations; the section's own docblock argues
it is workspace-scoped rather than per-integration because "pinning them to one
card's drawer would lie whenever two integrations share the workspace". That
reasoning is correct about the data model and says nothing about where a person
would go looking.

## What this has to answer before anything is rebuilt

- **Who is the reader?** An SC resetting a demo, or an agent tearing down a
  project? The pulled version served both from one surface and neither well.
- **Does a person need to see providers at all**, or only to know that teardown
  will remove them? `ioEventsClient` still cleans them up on project delete
  (kept deliberately when the rest was pulled), so the capability exists without
  any surface.
- **If a surface is needed, where?** The integrations screen, the project
  dashboard, a Console deep-link, or nowhere — a command that reports rather
  than a panel that renders.
- **What does empty mean?** Most projects will have no providers. A section whose
  common case is emptiness needs to earn its space or not appear.

## Why it is `open` and not `backlog`

There is no deliverable here to size. It closes when the questions above have
answers, and the answer may well be "no UI surface at all, the agent tools were
the point" — which would resolve it without building anything.

## Related

- [[AB-6]] — the capability, and the removal record. `feature/event-providers`
  holds the pulled implementation at `086bdc41c`; nothing was deleted.
- The removal commit is `4a3889049`, revertable on its own.

## Shipped so far

- 2026-09-09  docs(app-builder): ioEventsClient no longer cites a deleted service (`8d1045e0d`)
- 2026-09-09  docs(backlog): AB-8 — where event-provider management belongs, as a question (`b8bfaaefe`)
