---
id: AB-69
kind: fix
area: app-builder
needs: []
value: med
status: active
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
   a bare map keyed by point id, see the live read below; the PUT replaces the map) and exits 0 either
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

## Live read, 2026-10-08 20:50: the registry body is a BARE map

After the owner signed `aio` into Adobe Demo System, `getEndPointsInWorkspace` was called
for both Justrite workspaces (JustriteERPIntegrat and JustriteERP). Each answered 200 with
a top-level map keyed `commerce/extensibility/1`, `commerce/configuration/1` and
`commerce/backend-ui/2`, with no `endpoints` wrapper. The Console API spec and the CLI's
fixtures show `{ endpoints: {...} }`; that wrapper is the CLI's own (`getExtensionPoints`
adds it, `removeSelectedExtensionPoints` strips it before the PUT). The first build of this
fix read `body.endpoints`, which against the real service finds nothing and would have
reported every removal clean. Corrected the same evening, before any live removal ran.
Two live registrations confirmed, one per workspace, which is the duplicate the grid shows.

## Live cleanup, 2026-10-09 01:00 to 01:15 UTC (owner: "Go.")

Run through the running extension's MCP tools on the release-candidate build
(`loop/2026-10-05-release-candidate@00159e017`), each place read back by API, never
believed from the tool's own answer.

**Before.** Both project records held a deployed pair into Adobe project
KuklaJustriteXjap. Adobe's registry held the three points (`commerce/extensibility/1`,
`commerce/configuration/1`, `commerce/backend-ui/2`) on BOTH workspaces. Commerce held
ONE set of ERP state, not two: one placement webhook, and it pointed at the ORIGINAL
justrite workspace even though the copy had deployed two days later; eight
`commerce_erp_integration.*` event subscriptions on one provider.

**Removing the copy's pair** (`remove_integration`, four minutes): Runtime verified
empty (12 packages deleted), Commerce detached ("undid 109 company changes"), the
JustriteERP workspace deleted; the registry answers 404 for it; the copy's record empty.

- **Finding 1: Commerce holds one install per app, so the copy's uninstall emptied it for
  the original too.** Read with the ORIGINAL project's credential right after the copy's
  removal: webhooks `[]`, event subscriptions down to the unrelated
  `saas_assets_integration` one. The original's record still said "installed in Commerce
  at 0.13.0". The replace-by-ERP-name rule stops two pairs of the same name from being
  deployed; it does not cover an uninstall from one project while a sibling of a
  DIFFERENT name shares the same Commerce, because the Commerce-side install is one per
  app, not per workspace. Open question for the owner: should a removal refuse (or warn)
  when another project on disk has the same catalog app installed into the same Commerce
  instance, since what it undoes is theirs too?

**Deleting the copy project** (`delete_project` with the repo and the DA.live site, 38
seconds): local files gone, GitHub repo `skukla/kukla-just-rite-test` deleted (it predated
the copy by 15 hours; a test repo). DA.live content reported deleted; Helix refused to
list the published pages (HTTP 401), so NOTHING was unpublished.

- **Finding 2: the pages are still live.** `main--kukla-just-rite-test--skukla.aem.live/`
  and `/signs` answer 200 after the delete, and so does the aem.page preview.
  `get_auth_status` says DA.live is NOT signed in on this host, which is the 401. The
  tool answered `contentDeleted: true` in the same breath, which cannot be verified from
  outside (DA.live's list and content endpoints are 401 anonymously). A delete that
  needs a DA.live session should say so BEFORE it runs, not report half a deletion
  after. Owner's step to finish: sign in to DA.live, then
  `cleanup_dalive_site org=skukla site=kukla-just-rite-test githubRepo=skukla/kukla-just-rite-test`
  (whether Helix unpublishes a site whose code repo is already deleted is untested).

**Removing justrite's pair** (`remove_integration`, four minutes): Runtime verified
empty, Commerce detached ("undid 109 company changes and cleared 2 ERP order
numbers"), the JustriteERPIntegrat workspace deleted. Commerce reads from this host are
now 401 by design: `run_commerce_rest` signs with the integration's workspace
credential, and there is none. The webhooks and subscriptions had already been read
empty under Finding 1.

**After, Adobe side, clean:** the project holds only its Production workspace; the
registry answers 404 for both ERP workspaces; both Runtime namespaces verified empty by
the removals; justrite's record has no `appBuilderComponents`; the copy is gone from disk.
Not checked from here: Commerce Admin's Apps > App Management list and the Orders grid
columns after "Refresh registrations" (the owner's browser), and the Runtime namespaces
Adobe deletes about ten minutes after each workspace.

**Re-add** (owner: "just add one ERP so I can demo adding the second"): `add_integration`
id `erp-integration`, name "Justrite", on justrite. Ten minutes (01:13 to 01:23 UTC).
Read back: the record holds the pair, ERP "Justrite ERP" (listId `justrite`), deployed into
a new workspace; Commerce installed at 0.13.0 (live install succeeded 01:21); ONE placement
webhook, pointing at the new workspace; the eight `commerce_erp_integration.*`
subscriptions back, one set; the registry holds the three points on the new workspace
and nothing on Production. One set of everything, which is the end state the owner asked
for. Small oddity: Adobe named the workspace `JustriteERP1` because the deleted
`JustriteERP` still held its name minutes after its delete; the title is "Justrite ERP".

Still the owner's to check in the browser: the Orders grid shows ONE set of ERP columns
after "Refresh registrations", and Apps > App Management lists one app.

## Shipped so far

- 2026-10-08  fix(app-builder): one deployment per ERP name in an Adobe project, and a removal confirms its Commerce Admin registration is gone (`0078d4805`)
- 2026-10-08  fix(authentication): the extension-point registry is a bare map, as the live service answers it (`f3cf95d30`)
- 2026-10-08  fix(app-builder): name what a removal checks, and say why Adobe refused a delete (`cb5c45420`)
- 2026-10-08  docs(backlog): AB-69 logs cb5c45420 (`c1ba61c66`)
