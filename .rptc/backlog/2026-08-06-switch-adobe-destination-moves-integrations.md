# Switching a live project's Adobe destination moves its integrations

**Status:** ready
**Provenance:** Found 2026-08-06 while investigating "the new integration wasn't
deployed." The user created a new Console project ("Team Meeting") from inside the
Add Integration modal. Adobe really created it; the modal showed
`Team Meeting · Stage`; the Integrations header still read `Kukla Mesh · Stage`; and
the integration deployed to the OLD project's namespace
(`285361-kuklameshf4e4-stage`). Nothing was wrong with the deploy — the destination
choice never left the webview.

## The gap

`AddIntegrationFlowAdapter`'s `updateState` writes to `setOverrides` — React local
state. A changed destination lands in `overrides`, renders in the modal, and is
discarded when the modal closes. It is never posted to the extension, and the add
payload (`{ source, name, instanceId, apis }`) carries no destination. The deploy
targets `buildOrgTargetFromProjectAdobe(project.adobe)`, the persisted binding.

There is no handler anywhere that writes `project.adobe` from the dashboard.

## Why this is a feature, not a wiring fix

Persisting the new destination alone would leave the project's EXISTING deployments
stranded in the old Console project — `demo-builder-test` has a deployed mesh bound
to Kukla Mesh, and its card would start describing a resource the project no longer
points at. That is the same "two surfaces disagreeing about one fact" shape the
`architecture-duplication-scan` skill exists to catch.

**Decision (user, 2026-08-06):** switching or creating a destination means ALL
integrations move to it. Likely delete-and-recreate rather than migrate — Adobe I/O
has no move primitive; the namespace is a property of project+workspace.

## Scope

- Persist the committed destination to `project.adobe` (org / project / workspace,
  ids AND titles — see the open question below).
- On a destination change with existing `appBuilderComponents`: confirm explicitly,
  then for each component undeploy from the old target and redeploy to the new one,
  reusing the keyed runner (`removeAppBuilderComponent` → `addAppBuilderComponent`)
  rather than a bespoke path.
- The mesh is a component of this set too (`kind: 'mesh'`) and needs the same
  treatment via its own tail (`aio api-mesh:delete` → redeploy).
- Refresh the Integrations header and the project dashboard from the new binding.
- Partial failure is the hard part: a half-moved project must not silently look
  finished. Record per-component outcomes through `recordDeployOutcome`, the one
  keyed writer.

## Interim exposure (until this ships)

The Change / create-project affordance in the Add Integration modal still displays a
destination the add will not use. Anyone who uses it deploys to the previous project
with no error. Consider hiding or disabling Change on a live project that already has
deployments as a stopgap — small, and it removes a silent wrong-target deploy.

## Constraints

- Reuse the guard chain (`runGuards`) and `withOrgContext`; never re-derive org
  checks (see the `adobe-org-context` skill).
- The subscription contract is a full-union PUT — a moved integration must re-subscribe
  its APIs against the NEW workspace, or the union silently strips them
  (`appbuilder-component-authoring` skill).
- Deleting a Console project's Runtime entities is destructive and irreversible; the
  confirmation must name what will be torn down and where it will land.

## Open questions

- `project.adobe` currently persists `workspaceName` but no `workspaceId` (verified
  on both local projects). Deep links and any targeting by id need the id — decide
  whether to start persisting it as part of this work.
- Does the old Console project get cleaned up, or left standing with its now-unused
  namespace? Leaving it is safer and matches how hotfix branches are treated.

## Kickoff prompt

> Implement destination switching for a live project's App Builder integrations.
> Read `.rptc/backlog/2026-08-06-switch-adobe-destination-moves-integrations.md`
> first, then the `appbuilder-component-authoring` and `adobe-org-context` skills.
> Start by confirming the gap still exists: `AddIntegrationFlowAdapter.updateState`
> writing only to local `overrides`, and no handler writing `project.adobe`.
