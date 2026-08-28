# ERP round-trip, starter-kit flow — journey B

Owner ruling, 2026-08-28: *"a user can decide to implement this either in the
app shell or via the starter kit. We should have two distinct journeys and
test both flows."* Journey A (`erp-roundtrip.md`) measured the shell flow.
This is the starter-kit flow: same producer goal, the other door.

## The ground fact that shapes this journey (UPDATED 2026-08-28)

The owner ordered bodea fully cleaned: ALL integrations removed (the starter
kit included). Both journeys now start from the identical clean baseline —
`eds-storefront` only (`erp-roundtrip-zero-state.json`) — and differ ONLY in
which door they take: journey A the blank shell, journey B the pre-built
starter kit from the catalog. Each is a full add -> build -> deploy -> prove
-> remove round trip against the same zero.

The extend-flow variant (build on an already-attached kit) is retired as a
bodea journey; it returns if a project with a standing kit becomes a fixture.

## Journey B — fresh add via the starter kit (runnable now)

**The prompt**:

> I want to build ERP-style order handling for this project using Adobe's
> Commerce integration starter kit — order events from my Commerce backend
> should be received and queryable through an endpoint an external system
> could call. Add the starter kit, build on it, deploy it, and show me it
> working. Once we've confirmed it works, tear the whole thing down — the
> app, its deployment, and anything created in Adobe along the way — so this
> project ends exactly as it started.

**What B measures that A could not**: the catalog's pre-built door
(add_integration with the kit), the commerce-extensibility server's
starter-kit rules and the appbuilder-* skills (all unused in A), the kit's
own onboarding surface — and, once AB-6 ships, real event-provider
create-and-delete inside one journey.

## Both journeys' shared contract

Idempotency rules apply verbatim (journey measurement rule 6): the ask
contains its own undo, the result is reported in plain English, and anything
that cannot return to zero is a reversibility finding.

## RESULTS — run 2026-08-28, session 1c249bb9 (unattended)

**98 turns, 95 tool calls, 977 seconds, $10.12.** Added the kit, built the ERP
layer on it, wired real Commerce order events, PLACED A REAL ORDER and watched
it arrive in durable storage, exposed the lookup endpoint, all 215 kit tests
passing (plus new ones). First organic use of `list_event_providers`.
Teardown refused by the consent-ordering bug (fixed same day: standing
consent now beats the auto-declining chat ask); the follow-up teardown run
removed everything and re-verified Runtime empty — finding AB-7 on the way
(remove_integration leaves Runtime code behind; the run hand-cleaned 15
packages including an August leftover).

Metrics: first action call 7, 3 re-orientations, calls-by-server built-in 43 ·
bash 34 · demo-builder 18 · siblings 0 — the commerce-extensibility rules
server went unused in BOTH journeys while the agent re-derived kit knowledge
by reading its source: the standing routing lead.
