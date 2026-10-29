# App Builder

Attaches, deploys and removes custom App Builder integrations on a demo project.

## The mesh is one of these, not a special case

Since [ADR-011](../../../docs/architecture/adr/011-app-builder-deployables.md) D3
there is **one state model**: the keyed `project.appBuilderComponents` map, where each
entry has `kind: 'mesh' | 'integration'`. The mesh is an entry in it.

This feature and `features/mesh` therefore share a deploy spine rather than forking
one. The singular `meshState` / `appState` fields on older manifests are legacy
read-only and migrate on load.

## N integrations coexist

Add is additive and remove is per-id: adding one leaves its siblings untouched, and
removing one undeploys only that integration's remote resources before cleaning up
its files and its keyed entry.

Rename changes the **display name only**. The id, the folder and the OpenWhisk
package are immutable — they are baked into deployed resources.

## One Adobe project holds one ERP of a given name

Two local projects (a project and its copy) deploying the same pair into one Adobe
project showed the integration's Commerce columns twice (2026-10-08). So before any add
deploys, `replaceDeployedElsewhere` (in `dashboard/handlers/`) removes the pair another
local project put into the same Adobe project under the same ERP name
(`pairWithSameErpElsewhere.ts`), and stops the add if that removal does not finish. A
removal also reads Adobe's extension-point registry after the undeploy and unpublishes
what the app declared, believing only a re-read: a registration still published stops
the removal, and a workspace of the component's own may not take it.

## Every deploy goes through the keyed runner

`appBuilderAddRun.ts`, `appBuilderRedeployRun.ts` and `appBuilderRemoveRun.ts`, behind the
per-id handlers; `appBuilderComponentRunner.ts` holds what they share. There is no headless
variant: `deployAppHeadless` was retired once its only caller was replaced, and being
UI-free turned out to be the wrong goal for an agent-triggered deploy — that is
precisely when the user needs telling.

A parallel `appComponentManager` existed under the singular model and was deleted in
2026-08. While it lived it was the only code maintaining `componentSelections`, so
dashboard-added components went unselected and project reset dropped them. If you are
about to add a second path for this, that is what happened last time.

## Related

- [`appbuilder-component-authoring`](../../../.claude/skills/appbuilder-component-authoring/SKILL.md)
  — catalog entries and the deploy/subscribe contracts

## Conventions that bind this

The rules are in [the handbook](../../../docs/development/handbook.md). One state model, one deploy path. The keyed map is the single authority; a second path for the same action is what `call-path-audit` exists to catch.
