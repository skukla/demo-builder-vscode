---
id: AB-87
kind: fix
area: app-builder
needs: []
value: med
status: backlog
---

# Deleting a project leaves its mesh and App Builder integrations deployed

Filed 2026-11-18 from the beta.153 walk (U3.1, while choosing an Adobe project for an import).

## What happens

`runProjectDelete` (`src/features/projects-dashboard/services/projectDeletionService.ts`) removes
the datapack's data (`removeDataBeforeDelete`, line 73), the storefront's repository and DA.live
site (`performEdsCleanup`, line 90) and the local files (`deleteProjectFiles`, line 105). Nothing
in it, or in the other files under `services/`, touches Adobe: the API Mesh and every deployed
App Builder integration (runtime actions, event registrations) stay in the project's Adobe
workspace after the project is gone. Searched 2026-11-18: no `mesh`, `undeploy` or App Builder
call on the delete path.

## Why it matters

Whatever can be done can be undone (CLAUDE.md, property 1): an SC who creates and deletes demos
through the week leaves a mesh and integrations behind in each workspace, and the next demo
deployed there inherits them. EDS-73 is the same gap for the Configuration Service entry.

## Suggested fix

Delete offers the Adobe side as it offers the repository and the site: a ticked row, "Remove
the API Mesh and Integrations", that undeploys through the existing remove paths (the mesh
delete with `meshDeployLock`, `appBuilderRemoveRun` per integration). Kept, and said so, when
another local project uses the same workspace (the `sharedOnlineOf` pattern in
`sharedRepoProjects.ts`). The agent's `delete_project` gets it through `runProjectDelete`.
