# Integrations — surface the project destination as a page-level control

## Context

The dashboard Integrations page has no way to change where integrations deploy. Today the
Adobe project/workspace is only reachable by starting **Add Integration** and using the
`Change` link on the destination context line — you cannot get to it from an existing
integration at all (reported 2026-07-31, screenshot: Order Sync flyout).

The integration detail flyout shows `Destination  Demo Mesh · Stage` as a read-only row,
with actions Redeploy / Verify / Manage APIs / Remove. No destination control anywhere.

## The decision that shapes this

**The destination is PROJECT-scoped, not per-integration.** `project.adobe` holds ONE
`organization` / `projectId` / `workspace` for every integration in the project.

A first attempt put a `Change destination` bar action on the integration flyout. That was
**rejected and reverted**: it would render four identical buttons across four cards, each
implying it moves only that integration, when any one of them moves all of them. It is the
same error as the old `dest-summary` step — a project-level fact presented at integration
level.

Placement follows scope: the control belongs on the **page**, not the card.

## Locked decisions

1. The Integrations page action band gains a destination context line with an inline `Change`:
   `2 integrations    Demo Mesh · Stage  Change    [Project Dashboard]  [Add integration]`
2. It REUSES the treatment already built for the Add Integration modal
   (`.intflow-dest-context`, `DestinationContext` in `AddIntegrationFlowModal.tsx`) — same
   fact, same rendering, both places. Extract it rather than copy it (this is the third
   surface that would show it; Rule of Three is satisfied).
3. `Change` opens the existing flow modal in `mode="destination"` — that `FlowMode` already
   exists and renders only the sign-in → project → workspace stages.
4. The flyout's `Destination` row STAYS read-only. It is information about where this
   integration went, not a control.
5. ~~Changing the destination does NOT migrate anything: already-deployed integrations remain
   on the old workspace, and the change only affects future deploys.~~
   **OVERTURNED 2026-08-07 (user decision).** Changing or creating a destination MOVES every
   integration to it — likely delete-and-recreate, since Adobe I/O has no move primitive and
   the Runtime namespace is a property of project+workspace. Leaving deployments behind was
   the open product question `NEXT-SESSION.md` recorded ("copy problem, or stale-state
   problem?"); it is a migration problem. Migration is therefore IN scope for the control,
   not separate work, and this plan's step-01 acceptance needs rewriting before it is picked
   up.

## The control does not persist at all (found 2026-08-07, live)

The premise above — "the change only affects future deploys" — is itself wrong today. The
destination choice never leaves the webview:

- `AddIntegrationFlowAdapter.updateState` writes to `setOverrides`, React local state, so the
  new destination renders in the modal and is discarded when it closes.
- The add payload (`{ source, name, instanceId, apis }`) carries no destination.
- The deploy targets `buildOrgTargetFromProjectAdobe(project.adobe)` — the persisted binding.
- No handler anywhere writes `project.adobe`.

Observed live: a user created a Console project ("Team Meeting") from inside the modal. Adobe
really created it; the modal showed it; the Integrations header still read `Demo Mesh`; and
the integration deployed to the OLD namespace (`285361-kuklameshf4e4-stage`) with no error.

So the control needs BOTH halves built — persistence and migration — not just the UI.

**Interim exposure:** until then, `Change` displays a destination the add will not use, and
using it deploys to the previous project silently. Consider disabling `Change` on a live
project that already has deployments as a stopgap.

## Steps

- `step-01.md` — persistence + the page-level control. `Change` ships GATED on a
  project that already has deployments, so no intermediate state can strand them.
- `step-02.md` — moving the integrations when the destination changes, and removing
  step-01's gate. Split out 2026-08-07 when decision 5 was overturned.

## Open question for the implementer

After a destination change, deployed integrations point at the OLD workspace. Options: (a)
honest copy only, (b) mark affected integrations stale so Redeploy is the obvious next move.
(a) is the smaller first move; (b) is probably where it lands. Not decided.
