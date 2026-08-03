# Integrations — surface the project destination as a page-level control

## Context

The dashboard Integrations page has no way to change where integrations deploy. Today the
Adobe project/workspace is only reachable by starting **Add Integration** and using the
`Change` link on the destination context line — you cannot get to it from an existing
integration at all (reported 2026-07-31, screenshot: Order Sync flyout).

The integration detail flyout shows `Destination  Kukla Mesh · Stage` as a read-only row,
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
   `2 integrations    Kukla Mesh · Stage  Change    [Project Dashboard]  [Add integration]`
2. It REUSES the treatment already built for the Add Integration modal
   (`.intflow-dest-context`, `DestinationContext` in `AddIntegrationFlowModal.tsx`) — same
   fact, same rendering, both places. Extract it rather than copy it (this is the third
   surface that would show it; Rule of Three is satisfied).
3. `Change` opens the existing flow modal in `mode="destination"` — that `FlowMode` already
   exists and renders only the sign-in → project → workspace stages.
4. The flyout's `Destination` row STAYS read-only. It is information about where this
   integration went, not a control.
5. Changing the destination does NOT migrate anything: already-deployed integrations remain
   on the old workspace, and the change only affects future deploys. Say so in the modal;
   treat migration as separate work.

## Steps

- `step-01.md` — the page-level destination control (this plan's whole scope)

## Open question for the implementer

After a destination change, deployed integrations point at the OLD workspace. Options: (a)
honest copy only, (b) mark affected integrations stale so Redeploy is the obvious next move.
(a) is the smaller first move; (b) is probably where it lands. Not decided.
