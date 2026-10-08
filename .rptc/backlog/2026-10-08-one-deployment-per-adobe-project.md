---
id: AB-69
kind: fix
area: app-builder
needs: []
value: med
status: backlog
---
# One deployment per Adobe project

<!-- Do NOT template this body. Items vary because the work varies; the
     provenance, the measurements and the caveats are what make an item useful
     months later. The frontmatter carries the structure so the prose need not. -->

Filed 2026-10-08.

## What happened

Two Demo Builder projects, `justrite` and its copy `justrite-copy`, each deployed the
ERP integration into the SAME Adobe project (KuklaJustriteXjap) in two workspaces, and
both installed into the same Commerce. Commerce's Orders grid showed the integration's
two columns twice, both labelled with the Adobe project's title. Verified on the
owner's machine, 2026-10-08.

The copy's integrations deploy through creation's integrations phase
(`executorAppBuilderPhase.ts`), which never asked whether the Adobe project already
held that deployment. Nothing did: the dashboard add refuses a second copy inside ONE
project, and that was the only check.

## The rule (owner, 2026-10-08, final wording 16:05)

One Adobe project holds one ERP of a given name. The unit of uniqueness is the pair's
ERP SYSTEM's display name within the Adobe project (`adobe.projectId`), not the catalog
id and not the integration's name (a default nobody changes): an SC talks about the ERP
("orders go to Justrite ERP"). Two pairs whose ERPs are named differently coexist. Same
ERP name (the copy case) means deploying REPLACES the other project's pair, and the
replacement must be absolutely clean: nothing of the old deployment left anywhere, each
step confirmed by reading back, never assumed. An integration that brings no system
(the starter kit, a custom app) is unique by its own name.

## What was built

1. **Registry read and write** (`adobeConsoleExtensionPoints.ts`
   `listWorkspaceExtensionPoints` / `removeWorkspaceExtensionPoints`, wired by
   `adobeEntityService.ts` and forwarded by `AuthenticationService`). The Admin UI SDK registration behind the grid columns is
   the app's extension points, published on its WORKSPACE in Adobe's registry by `aio
   app deploy`; `aio app undeploy` unpublishes them through the same two Console SDK
   methods (`getEndPointsInWorkspace` / `updateEndPointsInWorkspace`, body
   `{ endpoints: { '<point id>': {...} } }`, the PUT replaces the map) and exits 0 either
   way. The write answers what a RE-READ holds, never what it was handed.
2. **Every removal verifies the registration is gone** (`appBuilderComponentRunner.ts`
   `checkRegistration`, deps in `workspaceRegistryDeps.ts`). After the undeploy, for an
   app component in a workspace of its own that declares `extensions:` in
   `app.config.yaml` (`listDeclaredExtensionPoints`, read before the local folder goes):
   list the workspace's published points; if a declared one is still there, unpublish
   it and re-read; if it is STILL there, or the registry cannot be read, the removal
   stops with the record, folder and workspace kept (`registrationLeft`), and a
   workspace of its own must not take it. The cleanup summary's `note` says what
   happened ("...was still published and was removed" / "...is still published").
   Remove anyway goes on. With no registry deps (bare callers) or no workspace, a failed
   undeploy is reported as "could not be checked" and still keeps the workspace from
   taking leftovers.
3. **Replace, never duplicate** (`pairWithSameErpElsewhere.ts`, pure;
   `dashboard/handlers/replaceDeployedElsewhere.ts`, the orchestration). Before every
   door into `addAppBuilderComponent` — the dashboard add (`add_integration` dispatches
   into it), `handleAddErp` (`add_erp`), and creation's integrations phase — the other
   local projects are loaded (`persistAfterLoad: false`) and the finder asks for one in
   the same Adobe project holding a deployed or installed ERP of the name this pair's
   ERP will get (trimmed, case-insensitive; `displayNameInProject` on both sides). A
   hit removes that project's INTEGRATION (which takes its bound systems, the runner's
   own rule; an ERP added on its own is removed on its own), NOT forced, with that
   project's runner deps and its record saved in place (`saveProjectConfigOnly`, so the
   current-project pointer does not move). A removal that does not finish stops the add
   with its reason before anything deploys.

## Verification

Unit tier, arguments asserted: the Console ops suite pins the SDK calls
`(orgId, projectId, workspaceId)` and the write payload (previous map minus the keys,
typed fixture in `tests/helpers/workspaceEndpointsFixtures.ts`); the runner's
registration suite pins the read `(project, workspace)`, the unpublish
`(project, workspace, [declared keys])`, the stop, Remove anyway, and the no-call cases;
the finder suite covers same name replaces, different name coexists, same default
integration name with a different ERP name untouched, different Adobe project
untouched; each door suite asserts the removal is called with the OTHER project and the
integration id before the add, and that a failed removal stops the add. Nothing here
was run against Adobe: the live check is the owner's, on the Justrite sandbox.

## Follow-up, not this repo

The Admin UI SDK registration in `commerce-erp-integration` should carry the ERP's
display name, so the Orders grid reads "ERP order (Justrite ERP)" instead of the Adobe
project's title. Today two same-named columns cannot be told apart in Commerce.
