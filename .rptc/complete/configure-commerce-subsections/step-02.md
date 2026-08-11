# Step 02 — Delete the API Mesh tab

A whole rail tab for one field the user cannot change, which is also a dead end.

## Why

`MESH_ENDPOINT` is the API Mesh tab's only field. It is:

- **optional** in the registry,
- **auto-supplied** — written during project creation after the mesh deploys, never
  collected from the user,
- **display-locked** — `getFieldValue` returns the deployed endpoint before the touched
  check (`useConfigureFieldValues.ts:108-113`), so typing changes nothing on screen.

The mesh's real controls are the Integrations grid, where it is the first peer card
(`deriveMeshCard`).

**It is also a dead end.** Display reads the deployed endpoint; validation reads
`getValueFromConfigs` (`ConfigureScreen.tsx:180`), which has no such override. Type
garbage: the field still shows a valid URL, an error appears beneath it, the tab gets a red
dot, Save disables, and there is no way to clear it because the field will not show what
you typed. The typed value is still written to `componentConfigs` and submitted
(`useConfigureFieldValues.ts:151-170`).

The wizard already sidesteps all of this by filtering `MESH_ENDPOINT` out entirely
(`useComponentConfig.ts:216-217`). Configure should do the same.

**Confirm the dead end in a Dev Host first** — it is inferred from the lookup split, not
observed.

## Change

Filter `MESH_ENDPOINT` out of Configure's service groups, mirroring the wizard. The `mesh`
group then has no fields on every shape and `useServiceGroups`' existing empty-group filter
(`useServiceGroups.ts:89-96`) drops the tab with no further work.

Delete the now-dead conditional that removes `MESH_ENDPOINT` only when no mesh component is
selected (`useServiceGroups.ts:66-75`) — it exists to keep the field for mesh projects,
which is the behaviour being removed.

Leave the `mesh` entry in `SERVICE_GROUP_DEFINITIONS`. Removing it is a schema change for a
group that will simply never populate, and `serviceGroupTransforms.test.ts` pins all eight
ids.

## Watch for

The endpoint must still reach the generated `.env` and `config.json`. It comes from
`getMeshEndpointUrl(project)` / the keyed mesh entry, not from this field — verify that the
`.env` for a mesh project is byte-identical before and after.

## Tests

- No API Mesh tab on any shape (EDS+ACCS, EDS+PaaS, headless+PaaS).
- Control: the mesh project's generated `.env` still carries `MESH_ENDPOINT` with the
  deployed value.
- Control: a project with a mesh still renders every other tab it did before.
- The dead end is gone by construction — no field, no divergence.

## Done when

- The tab is gone on every shape
- `MESH_ENDPOINT` still reaches the `.env` unchanged
- `gate` green
