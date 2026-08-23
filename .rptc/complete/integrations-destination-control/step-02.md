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
  one — which is what made a "delete" half thinkable at all.

## A move DEPLOYS. It never tears down. (revised 2026-08-07)

The original design deployed to the new destination and then undeployed from the
old. That half is gone. A move now runs deploys only, and the previous deployment
is left running.

The reasoning, in the order it decided the question:

- **Undeploy is the one irreversible step in the whole flow.** Deploying twice is
  free; deleting Runtime entities is not. Everything that could go wrong with a
  move gets cheaper the moment nothing is destroyed.
- **Nobody asked for cleanup.** The user's ask was "point this project somewhere
  else". Reclaiming the old namespace is a different job with a different trigger,
  and it already has a home: removing the integration, or the Developer Console.
- **Overwrite is Adobe's own model.** "Deploying actions will overwrite any
  previous deployments" (aio-cli-plugin-app). A move landing on top of an
  identically-named package at the target is the documented behaviour, not a
  corruption — not something to protect the user from with a teardown.
- **It collapses the failure design.** With no destructive step there is no
  half-destroyed state to reason about: a failed deploy reverts `project.adobe`
  and everything, everywhere, is still serving.

What the user gives up is automatic reclamation of the old namespace. That is a
real cost and it is the right one to pay — it is recoverable by hand, and its
opposite is not.

## Scope

- **No confirmation** (user decision 2026-08-07, after seeing one). A modal in
  front of an operation that destroys nothing and is undone by changing the
  destination back costs a click and buys no safety. What replaces it is feedback
  DURING the run, below.
- Telegraph the move on both surfaces, because the two are not interchangeable:
  the progress notification carries the steps, and each card carries its own
  in-flight line. The handler owns which channel a card reads — integrations take
  the keyed row push, the mesh takes the mesh status channel (its card is keyed
  `'mesh'` and the row channel deliberately skips the mesh's component id, so a
  row push for a mesh reaches nothing).
- Mark EVERY card before the API subscribe, not one at a time inside the deploy
  loop. Marking inside the loop left the grid reading DEPLOYED until the subscribe
  round trip returned, then told card 2 nothing until card 1 finished.
- Push the new destination to the header as soon as it is written. The header
  crumb is seeded once at init, so without a push it named the OLD target for the
  rest of the session while every card deployed to the new one.
- For each entry in `project.appBuilderComponents`, the mesh included (the keyed
  runner already dispatches by `kind`, so do not fork):
  1. re-subscribe required APIs against the NEW workspace,
  2. deploy to the NEW target.
- **All-or-nothing (user decision 2026-08-07), now cheap.** A failed deploy aborts
  the move and reverts `project.adobe` to the previous ref. Components that
  already deployed to the new destination stay there — harmless, since the old
  ones were never removed — and the result names them rather than implying the run
  left no trace.
- Remove step-01's `Change` gate once this lands.

## Known gap: nothing inspects the TARGET

The move deploys blind. Nothing lists what is already deployed at the destination,
and that matters because **two local projects can point at one Adobe workspace** —
observed live 2026-08-07, when re-pointing `my-commerce-demo` landed it on the same
`Demo Mesh · Stage` as `demo-builder-test`.

Consequences, none of them currently detected:

- Two projects holding an integration with the same id derive the same
  `ow.package`, and `aio app deploy` prunes entities in its own package — so the
  second deploy silently replaces the first project's integration.
- The mesh is workspace-scoped, so two projects with meshes aimed at one workspace
  contend for a single resource.

Detecting it needs a target-inspection mechanism that does not exist (list the
namespace's packages before deploying). Deferred on that basis; the product
question it used to also depend on is answered — a collision overwrites,
deliberately. With the confirmation dropped, nothing warns about it either, which
is the accepted cost of that decision rather than an oversight.

The SOURCE side needs nothing, for a stronger reason than before: nothing touches
it at all.

**Closed 2026-08-07:** selecting the destination already in use used to deploy each
component and then tear it down at what was the same namespace — destroying every
integration, with the rollback unable to help because no deploy failed. Guarded in
both the migration (`sameDestination`) and the handler (short-circuit, so the
run ends before anything is written). The no-teardown design removes the mechanism entirely; the
guards stay, because a same-destination "move" is still a pointless redeploy.

## Watch out for

- **The subscribe PUT is a full union.** A moved integration must re-subscribe
  against the new workspace or the reconcile silently strips its APIs
  (`appbuilder-component-authoring`). The union sources are catalog `requiredApis`
  + baseline + `additionalConsoleApis` + `componentApiPicks`.
- **Runtime credentials are per-workspace.** `fetchRuntimeCredentials` injects
  `AIO_RUNTIME_NAMESPACE`/`AIO_RUNTIME_AUTH` per invocation. Now that only the new
  target is addressed, every invocation wants the NEW workspace's — the old-target
  credential path that made this subtle is gone.
- **`withOrgContext` targets Console ops only** — `aio app deploy` additionally
  needs those runtime credentials or it dies on a missing namespace.
- **A published production app refuses a plain re-deploy** and needs
  `--force-deploy`. Not handled: a move onto a published Production workspace will
  fail with Adobe's message rather than a recognised one.
- Never re-derive org checks — reuse `runGuards` (`adobe-org-context`).

## Tests

- The move NEVER calls a teardown — assert on the absence, since this is the whole
  revision and an order-only assertion cannot see it.
- A failed deploy reverts `project.adobe` to the previous ref and saves.
- A failed deploy reports which components DID reach the new destination.
- Same source and target is a no-op — no subscribe, no deploy (this is the
  data-loss guard from the previous design; it stays a correctness test).
- The mesh routes through its own tail, not the app tail.
- Every card is told BEFORE the subscribe, asserted as a whole sequence. An
  `indexOf`-pair comparison passed against a migration that pushed nothing, since
  `indexOf` returns -1 for an absent entry and -1 is less than everything.
- A mesh id routes to the mesh channel and NOT the row channel.
- The destination reaches the header, and again when an aborted move reverts it.
- No prompt precedes the move — pinned, because re-adding one looks like caution.

## Acceptance

1. Changing the destination on a project with deployments redeploys all of them
   there.
2. Nothing is undeployed, at either destination.
3. APIs are re-subscribed against the new workspace.
4. A failed move points the project back at the previous destination and says what
   already landed at the new one.
5. The move narrates itself: notification steps, every card in flight immediately,
   each settling as it lands, and a header that names the new destination.
6. Step-01's `Change` gate is gone.
7. `gate` green.
