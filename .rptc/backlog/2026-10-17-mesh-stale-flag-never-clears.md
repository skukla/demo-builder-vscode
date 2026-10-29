---
id: AB-79
kind: fix
area: app-builder
needs: []
value: low
status: built
---

# The mesh's "redeploy needed" flag only ever turns on

Filed 2026-10-17, found beside the storefront version of the same defect.

## What is known

`stageSettingsChange` (`projectSettingsChange.ts`) sets
`project.meshStatusSummary = 'stale'` when a settings change reaches the mesh, and
nothing there sets it back. The storefront flag had the same shape: a store switched
and switched back kept asking for a republish with nothing to publish. That one was
fixed on 2026-10-17 (`fix(storefront): a change put back to what is live clears
"republish needed"`): a save whose settings match what was last published clears it.

## Why it was not fixed the same way

The storefront detector compares against a record kept in the project
(`edsStorefrontState`). The mesh detector (`detectMeshChanges`) compares against the
DEPLOYED mesh, fetched over the `aio` CLI, and the summary has more states than
stale/current. What "current again" means there, and which states a revert may clear,
was not verified. Read `meshStatusHelpers` and `deriveMeshStatus` before changing it.

## Reproduce

On a project with a mesh: change a setting the mesh reads, save without redeploying,
change it back, save. Expected: the mesh reads current. Likely today: still stale.
Not yet run; this is the predicted behaviour from the code, not an observed one.

## Shipped so far

- 2026-10-19  fix(mesh): a setting put back to what the mesh was deployed with clears "redeploy needed" (`5e6530b65`)
