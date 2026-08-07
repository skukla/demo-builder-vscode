# Step 02 — Moving the integrations when the destination changes

Split out of step-01 on 2026-08-07, when the user overturned locked decision 5:
a destination change MOVES every integration rather than leaving them behind.
Step-01 builds persistence and the control and keeps `Change` gated; this step
builds the move and removes that gate.

## The mechanism (settled by reading the seams, 2026-08-07)

"Delete and recreate" is right about the REMOTE artifacts and wrong about the
local ones — the clones do not move:

- `deployAppBuilderComponent` re-runs only a component's deploy tail. No re-clone,
  no re-install. That is the "recreate".
- `buildOrgTargetFromProjectAdobe(adobe, cachedOrg)` takes ANY `ProjectAdobeRef`,
  so the old destination stays addressable after `project.adobe` holds the new
  one. That is what makes the "delete" half possible.

## Order: recreate BEFORE delete

Deploy to the new destination first, then undeploy from the old.

| Order | Failure halfway |
|---|---|
| **new → old** (chosen) | Integration still runs at the OLD destination; recoverable |
| old → new | Gone from both; data loss |

Namespaces differ per project+workspace, so being briefly live in both collides
with nothing.

## Scope

- A confirmation naming what moves and where — this tears down real Runtime
  entities and is irreversible per component.
- For each entry in `project.appBuilderComponents`, the mesh included (the keyed
  runner already dispatches by `kind`, so do not fork):
  1. deploy to the NEW target,
  2. re-subscribe required APIs against the NEW workspace,
  3. undeploy from the OLD target, built from the pre-change `ProjectAdobeRef`.
- **All-or-nothing (user decision 2026-08-07).** A failed deploy ABORTS the move
  and undoes whatever already moved: each restored component is deployed back to
  the old destination and torn down at the new one, and `project.adobe` reverts.
  A half-moved project is the outcome this exists to prevent, so partial success
  is not a reportable state.
- A component whose RESTORE deploy fails is never torn down at the abandoned
  destination — it is the only copy left, and removing it turns a failed rollback
  into data loss. Those are reported as `stranded`, and the result must never
  read as a clean abort while any exist.
- Remove step-01's `Change` gate once this lands.

## Watch out for

- **The subscribe PUT is a full union.** A moved integration must re-subscribe
  against the new workspace or the reconcile silently strips its APIs
  (`appbuilder-component-authoring`). The union sources are catalog `requiredApis`
  + baseline + `additionalConsoleApis` + `componentApiPicks`.
- **Runtime credentials are per-workspace.** `fetchRuntimeCredentials` injects
  `AIO_RUNTIME_NAMESPACE`/`AIO_RUNTIME_AUTH` per invocation; the old-target
  undeploy needs the OLD workspace's, not the new one's.
- **`withOrgContext` targets Console ops only** — `aio app undeploy` additionally
  needs those runtime credentials or it dies on a missing namespace.
- Partial failure is the design problem, not the plumbing. Decide up front what a
  project looks like when component 2 of 4 fails: which destination does
  `project.adobe` hold, and what does each card say?
- Never re-derive org checks — reuse `runGuards` (`adobe-org-context`).

## Tests

- Order: the new-target deploy precedes the old-target undeploy for every
  component (assert the call sequence, not just the calls — an order-blind test
  passes against the data-losing order).
- A failed new-target deploy leaves the old deployment untouched.
- The mesh routes through its own tail, not the app tail.
- Partial failure records per-component outcomes and does not report success.
- Cancelling the confirmation changes nothing — no persist, no deploy, no undeploy.

## Acceptance

1. Changing the destination on a project with deployments moves all of them.
2. Every move is recreate-then-delete; a mid-run failure leaves the component
   live at the old destination.
3. APIs are re-subscribed against the new workspace.
4. A partially-moved project reports its true state per component.
5. Step-01's `Change` gate is gone.
6. `gate` green.
