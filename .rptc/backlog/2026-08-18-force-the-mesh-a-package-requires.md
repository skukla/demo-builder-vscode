# A package that requires a mesh must be forced to add one

**Filed:** 2026-08-18, from the `create_project` guard conversation.
**Status:** NOT DESIGNED. The requirement below is settled; the surface is not.

## The requirement

A demo package can declare `requiresMesh: true` (`demo-packages.json`; BuildRight
is the only one today). When such a package is selected, the user must not be able
to leave the Integrations area without a mesh, and adding that mesh must force an
Adobe I/O destination — create a new project or select an existing one.

**Hard block**, decided 2026-08-18. Not a warning, not a skippable notice. A demo
whose storefront queries a mesh that was never deployed is broken in a way the
user does not discover until they present it.

## What already exists

Most of the machinery is built. The gap is one predicate.

| Layer | Where it lives | State |
|---|---|---|
| *Must this project have a mesh?* | package `requiresMesh` (`boolean \| 'optional'`) | exists |
| *Which mesh repo?* | stack `optionalDependencies` in `stacks.json`, one per stack | exists |
| **Forced to add it** | `isIntegrationsComplete` (`tileStatus.ts:139`) | **MISSING** |
| *Forced to pick/create an Adobe I/O destination* | same gate, once any deployable is selected | exists |
| *Guided create-or-select flow* | `AddIntegrationFlowModal` destination stage → `useProjectCreationPhases` | exists |
| *Deploys the repo to it* | build-time mesh deploy | exists |

`isIntegrationsComplete` opens with `if (!anyDeployableSelected(state)) return true;`
— integrations are UNCONDITIONALLY optional. Its own docblock records that the
catalog arguments are "unused now that the gate is selection-driven", so the
package's requirement was deliberately designed out of it. Nothing else consults
`requiresMesh` for gating.

## Constraint: the mesh does NOT go in the App Builder catalog

Decided 2026-08-18. `app-builder-components.json` is heading toward a SHARED
catalog of repos for catch-all use cases. A mesh that a specific package must have
is not catch-all, and putting it there — even scoped with `onlyForPackages` —
makes the shared catalog carry project-specific entries.

This matters because the schema currently invites the opposite: its array
description reads "the three seeded meshes, plus integrations over time", and
`resolveRequirement` (`appBuilderComponentSelection.ts:58`) already returns
`'required'` for `kind === 'mesh'` when `pkg.requiresMesh === true`. That path is
written and unused — the catalog holds one entry, `app-builder-shell`, and no mesh.
**Do not take that invitation without revisiting this decision.** The mesh stays
keyed to the STACK (the implementation depends on backend + frontend, not on
branding — Bodea and CitiSignal on `eds-accs` want the same one) and the
requirement stays on the PACKAGE.

## Open design questions

1. **What does the screen say?** An incomplete area today just fails to advance.
   A forced mesh needs to state that this demo requires an API Mesh and put the
   Add affordance in front of the user, or Continue is simply dead with no reason.
2. **`requiresMesh: 'optional'`** is a third value in the type. Proposed: only
   `true` forces; `'optional'` keeps today's behaviour. Confirm.
3. **Does the block belong on the area, the step footer, or both?** The Build
   step's footer owns Continue; the area rail shows status.
4. **Headless parity.** `create_project` must refuse for the same reason, with the
   same predicate — see the sibling item below.

## Relationship to `2026-08-18-create-project-tool-demands-a-mesh-workspace.md`

Both need the same predicate: *does the selected package + stack require a mesh?*
Kept separate because that item is a bounded DEFECT blocking agent work now, while
this is an undesigned capability that gates nobody today (BuildRight is
`hidden: true`, `status: "coming-soon"`). Whichever lands first should define the
predicate; the other consumes it.

## Not urgent, and say why

No shipping package sets `requiresMesh: true`. This gates zero users today, which
is exactly why it is safe to make strict — there is no migration to worry about.
