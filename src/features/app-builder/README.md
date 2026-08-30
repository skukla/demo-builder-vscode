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

## Every deploy goes through the keyed runner

`appBuilderComponentRunner.ts`, behind the per-id handlers. There is no headless
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
