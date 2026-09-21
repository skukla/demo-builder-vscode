---
id: AB-23
kind: feature
area: app-builder
parent: AB-9
needs: []
value: high
status: active
---

# Every integration and system gets its own Adobe workspace

Decided by the owner 2026-09-20, answering AB-17. Each integration and each system an SC
adds gets its own workspace inside the demo's ONE Adobe I/O project. The mesh stays in
the project's main workspace — a workspace may hold only one mesh.

The reasoning and the alternatives are in AB-17; the survey of what has to change, and
the live evidence behind it, is in `.rptc/research/workspace-per-integration/research.md`.
This item is the build.

## What it removes

Each of these is a limit an SC hits today, not a tidiness argument.

- **A project can hold only one App Management app.** `commerce-integration-starter-kit`
  and `erp-integration` are both App Management apps, so a project cannot have both. The
  install record's key and the `commerce/extensibility/1` registration are per workspace
  (AB-2 spike).
- **Only one component can have a web UI.** One static site per namespace, and a deploy
  replaces every file on it. The blank shell — the "build your own app" path — cannot
  have one at all.
- **One database per workspace**, so a second ERP would share collections with the first
  (AB-16 loses its renaming work).
- **Two projects sharing a workspace overwrite each other** (AB-15's first case).
- **Removal** has to find and delete only this app's packages in a shared namespace.
  Deleting the workspace takes its code, database and registrations with it.

## What changes

From the research's survey. Most lower layers already take explicit ids; what is missing
is a workspace recorded PER COMPONENT and read by the target resolver.

| Area | Where | Change |
|---|---|---|
| State | `src/types/base.ts` `AppBuilderComponentState`; `manifest.schema.json` | Record the component's workspace (`id`, `name`, `title`). `project.adobe.workspace` stays the MAIN one. A missing field means "the main workspace", so existing projects keep working. |
| Target | `appBuilderComponentRunner.ts` `targetFor` | Read the component's workspace, fall back to the main one. Every deploy, redeploy, undeploy and verify goes through it. |
| Add | runner add path; `executorAppBuilderPhase.ts` | Create the workspace (name derived from the component id), record it, provision Runtime, then deploy. Creation and dashboard-add must do the same thing. |
| Remove | `appBuilderComponentTeardown.ts` | After undeploy, delete the workspace, removing its event registrations first as project teardown does. |
| API subscription | `apiSubscriber.ts`, `componentApiPicks.ts`, `consoleApiHandlers.ts` | Subscribe per workspace: the component's `requiredApis`, the baseline, its own picks. Mesh APIs stay on the main workspace. |
| App Management | `resolveAppManagementEnv`; `appManagementInstaller.ts` `buildAppData`; the uninstaller | Use the integration's own workspace and credential. |
| ERP screen | `systemScreen.ts`, the catalog's `screen` block, `demo-erp` | Delete the key and the web-action screen; the ERP ships `web-src` and opens with the SC's own sign-in. |
| ERP login | SecretStorage + deploy env; `demo-erp` API actions; `commerce-erp-integration` `erpAuthHeaders` | An app's Adobe token is REFUSED by an app in another workspace (live, AB-17 step 5). Demo Builder issues the ERP's login for the integration when the pair is added, and deletes it on removal. |
| ERP → integration | `demo-erp/lib/events.js`; `commerce-erp-integration` | Through I/O Events, which cross workspaces (proven live). Not a direct call. |
| Destination move | `destinationHandlers.ts`, `appBuilderComponentMigration.ts`, `set_project_destination` | Decide what "change destination" means when each app has its own workspace. |
| Links and display | `openUrlHandlers.ts`, `agentsMdSections.ts`, `settingsSerializer.ts` | One Console link and one entry per component. |

## Every surface

- **Creation and the dashboard add** both go through the runner, so they agree once it does.
- **The agent surface**: `add_app_builder_component`, `remove_app_builder_component` and
  `set_project_destination` change behaviour; `docs/systems/mcp-server.md` must say so.
- **The webview**: the Add Integration flow's destination stages assume one shared
  workspace (`flowStages.ts`, `AddIntegrationFlowAdapter.tsx`).
- **Existing projects** keep working untouched on slice 1's fallback, and reach the new
  model by removing and re-adding an integration. No migration ships — see below.
- **Project reset** (`projectResetService.ts`) targets `project.adobe` only: decide whether
  reset leaves integration workspaces alone or resets them too.

## Existing projects: no migration is built

**There is no migration feature** (owner, 2026-09-20, correcting a draft of this item that
designed one). Moving Kukla Bodea onto the model is a TESTING step done by hand, not a
capability the extension ships.

An earlier version of this section specified a dashboard action, an MCP tool, a handler and
tests, plus the rules for deleting them afterwards. All of that is removed. It was
scaffolding designed as a feature, for a population of a handful of projects belonging to
one person.

**What actually covers existing projects:**

- **They keep working, untouched.** A component with no recorded workspace deploys to the
  project's workspace, exactly as it does today. That is slice 1's fallback and it needs
  nothing else.
- **A project reaches the new model by ordinary use.** Remove an integration and add it
  again, and the add path gives it its own workspace. That is a thing the product already
  does; no new code path is needed to reach the same end state.
- **Bodea is moved by hand when we want to test the model on it.** Its only App Builder
  component is the mesh, so that is one workspace and one redeploy, done once, leaving
  nothing behind in the codebase.

**What this does leave open**, and it is a real question rather than a hidden one: the
fallback in `targetFor` has no end date now, because nothing bulk-converts old projects.
It stays until every project an SC holds has been through a remove-and-re-add. That is
cheap to keep — one `??` — and deleting it is a later decision with its own evidence, not
something this item schedules.

## Live checks the plan still owes

**Both were answered on 2026-09-20. Nothing live is outstanding.**

**1. An App Management install from a workspace that is not the project's first.**
Already proven, by the AB-2 spike on 2026-08-27, and an earlier draft of this item said
the opposite without checking: *"the kit deployed to a second workspace (KitSpike) of the
same Console project produced a second, fully independent install service — both
workspaces' `/app-management` endpoints answered 401-auth-required side by side."*

What that establishes is the part the design rests on: a second workspace gets its own
App Management service, so two Commerce-facing integrations in one project are possible.
The narrower thing it did NOT do is complete a Commerce-side install handshake from that
second workspace. That is worth watching for during the build rather than blocking on —
the endpoint existing independently is what was in doubt.

**2. Commerce REST on a NEW workspace's credential**, with the tenant's own product
profile. **Done, end to end, on a throwaway workspace in a real project:**

| Step | Result |
|---|---|
| org catalog read (control) | 99 rows, 2 of them ACCS-REST-API |
| the server-to-server row's profiles | 105 |
| profiles naming this project's Commerce instance | exactly 1 — `profileForTenant` picks it |
| subscribe, then read back | accepted; ACCS-REST-API carries 1 profile |
| credential scopes | include `commerce.accs` |
| IMS token | HTTP 200 |
| Commerce REST `storeConfigs` | **HTTP 200** |

The workspace was deleted afterwards. **Watch the row-picking**: a first attempt reported
ZERO profiles because it took the first catalog row for the code. The org lists
`ACCS-REST-API` twice and only the server-to-server row carries `properties.licenseConfigs`
— `pickServiceRow` in `apiServiceResolution.ts` already knows this, and anything new must
go through it rather than a bare find.

**Answered earlier the same day:** deleting a workspace removes its Runtime namespace
(HTTP 200 in 3 seconds). Still open: whether a Developer-role SC can do that in a project
that has turned read-only (AB-18) — that condition was moved away from, not fixed.

## The deploy trap, explained and already handled

The AB-2 spike found that a freshly created workspace **fails `aio app deploy`** at the
log-forwarding step — `Cannot read properties of undefined 'runtime'`, seen twice — and
recorded `--no-log-forwarding-update` as a bypass with the cause unknown: propagation, or
an `aio` bug.

**It was neither.** Measured 2026-09-20 on a fresh project, reading the workspace over a
minute without provisioning anything:

```
+ 0s  runtime present, 0 namespaces
+15s  runtime present, 0 namespaces
+30s  runtime present, 0 namespaces
+60s  runtime present, 0 namespaces
after createRuntimeNamespace: 285361-zzrtwaittrkg
```

A workspace has **no Runtime namespace until one is created**, and waiting never helps.
The spike drove the CLI directly — create workspace, download config, `aio app use`,
deploy — and never provisioned one, so it deployed into a workspace with nothing to
deploy to.

**The extension already does the right thing.** `createWorkspace` calls
`ensureWorkspaceRuntimeNamespace` immediately, and `createProject` sweeps every workspace.
So this item's add path inherits the fix rather than needing `--no-log-forwarding-update`.

**Two things to carry anyway:**

- Whatever creates a workspace for an integration must provision Runtime before
  deploying. That is one call, it is idempotent, and it tolerates the 409.
- The same measurement corrects a comment that claimed Adobe's App Builder template
  provisions Runtime for the Production workspace and that only our added workspace
  missed out. It does not; the sweep is the only thing that provisions either. That
  comment is the kind that gets a loop deleted as redundant, so it is fixed in the same
  change as this note.

The spike also flagged that a workspace holding live event registrations may 409 on
delete the way project deletes did — the Remove row above already reuses the teardown
registration sweep for that reason.

## What Console will actually show

The rename measurements in [[AB-24]] apply here too, and they change what the titles buy.

Adobe will not let a workspace's machine name change after creation (`400 — "Workspace
name can not be changed"`), and `aio console workspace list` has no Title column at all.
So **the machine name is what Adobe's own surfaces display.**

That is fine at creation, because the machine name is derived from the SC's name:
"Northwind ERP" gives `NorthwindErpq3k9`, which reads correctly in Console.

**It is not fine after a rename.** An SC who renames "Northwind ERP" to "Acme ERP" gets
the new name in the extension and `NorthwindErpq3k9` in Console, forever. There is no
alternative — the name is frozen. So the title sync is still worth doing, because the
extension is where an SC lives, but the plan must state that Adobe keeps the original
name and that an SC walking a customer through Console will see it.

## Documents this makes out of date

`ADR-011` (one project AND one workspace per demo) needs a successor ADR that keeps "one
project per demo" and changes the workspace rule, citing the research. The ERP plan's
decisions 7, 12 and 20 are superseded — see the research's table.

## What the agent surface already has

Checked live against the running server, 2026-09-20. The workspace lifecycle an agent
needs is complete: `list_orgs`, `list_adobe_projects`, `list_workspaces`, `select_org`,
`select_project`, `select_workspace`, `create_adobe_workspace`, `delete_adobe_workspace`,
plus project create and delete. A destructive one puts a modal in front of the SC and
waits three minutes for an answer, which is why a probe that gives up after 60 seconds
reads it as a hang.

One defect found while checking: **`delete_adobe_workspace`'s schema tells the agent to
get the id from `list_adobe_workspaces`, and no such tool exists** — the real one is
`list_workspaces`. An agent following the description reaches a dead end.

What is missing is not a tool but STATE: nothing reports WHICH workspace an integration
lives in, because nothing records it yet. That is this item's first change, and the tools
that read a component's state should carry it once it exists.

## How workspaces are made and named today

Read from the code and confirmed against Bodea's live project (2026-09-20), because
this decides what the per-integration naming has to fit into.

Creating a project makes **two** workspaces:

1. `createFireflyProject` provisions **Production** and nothing else. That is Adobe's,
   and Adobe refuses to delete it.
2. `createDefaultStageWorkspace` then adds **Stage** explicitly, to match what the
   Console's own App Builder template produces (`adobeConsoleProjectOps.ts`).
3. Both get a Runtime namespace, because a workspace added through `createWorkspace`
   does not get one automatically.

Everything the demo uses lives in Stage. Production sits empty and undeletable.
`list_workspaces` on Bodea returns exactly those two.

**Stage is chosen by a substring match**, in two places that must agree —
`pickWorkspace` in `useProjectCreationPhases.ts` and `autoSelectCustom` in
`AdobeWorkspacePicker.tsx`. Both take the first workspace whose name or title
*contains* "stage".

**Naming.** Stage is hardcoded, with no suffix. Every other workspace goes through
`deriveAdobeEntityName(title)`: strip to alphanumeric, cap the base at 15 characters,
append 4 random ones. So a workspace titled "ERP Integration" gets the machine name
`ERPIntegrationx7k2`. The title stays human-readable; the SC never types the name.

### What that means for this item

- **Name each workspace after the integration it serves.** The workspace machine name
  becomes part of the Runtime namespace — a real one observed this session was
  `285361-kuklabodeamesh5ngv-stage`, which is org id + project machine name + workspace
  machine name, lowercased. So the workspace name reaches every action URL for that
  integration, and it is the only label an SC sees in Developer Console. It is also what
  makes a delete confirmable by a person.
- **Record the name, never re-derive it.** The 4-character suffix is random, so the same
  title produces a different name every time. The component's recorded workspace
  (`id`, `name`, `title`) is the only lookup; matching by name would be a guess.
- **Title from the catalog entry's display name, not its id**, since the base truncates
  at 15 alphanumeric characters.
- **Make Production the project's main workspace and stop creating Stage** — the owner's
  call, 2026-09-20, and the right one: the workspace Adobe will not let us delete is
  exactly where the permanent core (the mesh, the Commerce credential) belongs, while
  every ADD gets a deletable workspace of its own. Creating Stage puts the permanent core
  somewhere deletable and leaves the undeletable workspace empty. Filed as [[AB-24]].
- **Make the Stage match EXACT before adding more workspaces.** With two workspaces a
  substring match cannot go wrong. With one per integration it can: any workspace whose
  title contains "stage" is a candidate, and which one `find` reaches first depends on
  the order Adobe returns them, which is not ours to rely on. Matching `=== 'Stage'` in
  both places costs one line each and removes the question. An integration workspace
  must also never be titled something containing "stage".

**Not settled:** whether Adobe's 20-character name limit applies to workspaces or only to
projects. The limit is measured for projects (`adobeEntityName.ts`); the longest workspace
name created so far was 17. A derived name is 19 at most, so this only matters if the
workspace limit is lower.

## Renaming: the id names the workspace, the SC's name titles it

Adobe gives a workspace two fields, and they answer two different questions.

| Field | Comes from | Changes on a rename |
|---|---|---|
| machine `name` | the component id, through `deriveAdobeEntityName` | **never** |
| `title` | the SC's display name for the integration | yes, best-effort |

So the relationship is 1:1 with the component **id**, not with the name the SC typed.

**Why the machine name must not follow a rename.** It reaches the Runtime namespace —
a real one is `285361-kuklabodeamesh5ngv-stage`, which is org id + project machine name
+ workspace machine name. Renaming it has two possible outcomes and both are bad: either
the namespace follows, and every deployed action moves to a new URL while the mesh,
storefront and Commerce config still point at the old one; or it does not, and Console
disagrees with reality forever. Neither is worth a cosmetic rename.

This is the rule the code already applies one level up: `renameRemoteProject` sends
`{ title }` alone, deliberately, because the machine name is part of the project's
identity.

**Why the id is the right source.** It is already the machine identity everywhere else —
the folder (`components/<id>/`), the keyed-state key, and the deployed OpenWhisk package
(`deriveOwPackage(componentId)`, a pure function of the id). It is immutable by
declaration: `handleRenameAppBuilderComponent` states that the id is immutable and only
the entry's `name` changes. And it is collision-checked at mint against every catalog id
and every selected id, so it is unique inside the project.

It is also already human-friendly, because it is derived from the name the SC typed:
"Northwind ERP" mints `northwind-erp`. So deriving the workspace name from the id gives
a readable name without tracking a mutable one.

**Uniqueness across demo projects.** Two demo projects can share one Adobe project
(AB-15), so two `northwind-erp` components could ask for the same workspace name.
`deriveAdobeEntityName` appends four random characters, so they differ and Adobe returns
no 409. This is also why the name must be RECORDED on the component and never
re-derived for a lookup.

**Renaming should sync the title.** When an SC renames an integration, PATCH the
workspace title through `editWorkspace`, best-effort, exactly as the project rename does.
A failed sync must not fail the rename — renaming works offline today and should keep
working offline.

**A gap this exposes, outside this item.** A pre-built catalog integration cannot be
renamed at all today: `handleRenameAppBuilderComponent` refuses it because the runner
rewrites `name: entry.name` on every redeploy. The ERP is a catalog entry, so the name
an SC types when adding it is a display-name variable on the bound system, not a
component name, and there is no way to change it afterwards. Worth its own item.

## Two ERPs in one project: not today, yes under this item

**Today it is refused. Under workspace-per-integration it works** — the blocker that no
amount of id-minting could solve is exactly the one a separate workspace removes.

**The naming needs nothing from the SC.** `mintInstance` already dedupes silently: a
taken `northwind-erp` mints `northwind-erp-2`, and the DISPLAY name gets the same
suffix, so the two read as "Northwind ERP" and "Northwind ERP 2" rather than as
identical twins. The workspace name derives from the id and the title from the display
name, so two distinct workspaces come out of two unnamed adds:

| component id | workspace name | workspace title |
|---|---|---|
| `northwind-erp` | `NorthwindErpq3k9` | Northwind ERP |
| `northwind-erp-2` | `NorthwindErp2x7m` | Northwind ERP 2 |

### What stops it today, and what each one costs

**1. The fixed OpenWhisk package — the hard one, and this item dissolves it.**
`erp-integration` is `layout: 'extension'`, so it ships a fixed package name and the
deploy path skips the per-id rewrite. Two copies from that source overwrite each other
on Runtime **whatever ids we mint** (AB-2 spike, proven live). That is why
`packageClashRefusal` exists, and its own wording names the condition: "a second copy
in the same workspace would overwrite the first". Separate workspaces means separate
Runtime namespaces, so there is nothing left to overwrite. The refusal becomes
workspace-aware instead of being deleted: it should refuse only when the clash is
inside one workspace.

**2. Minting an id for a paired entry.** `alreadyAddedRefusal` refuses a second
`erp-integration` because the id is the state slot, the clone folder and the package
name. A second ERP needs a minted id — which the flow already does for every unpaired
entry, and deliberately does NOT do for a paired one (owner, 2026-09-20). That decision
was right for two reasons and this item removes the second of them: forking broke the
pairing (still true, see 3), and forking bought nothing because the package clash
defeated it anyway (no longer true). So the fork comes back once 3 is solved.

**3. Pairing is a CATALOG-level relationship.** `demo-erp` carries `boundTo:
'erp-integration'` — a catalog id, not an instance id. This is the real work. Two ERP
instances need two `demo-erp` instances, bound instance-to-instance, so each
integration talks to its own ERP. Four workspaces for two ERPs, each pair joined by
its own I/O Events provider.

### What that means for the plan

`boundTo` is where this starts, and it is a genuine piece of work rather than a
follow-on. Sequence it after the workspace spine lands — the spine is what makes
instance pairing worth building — but keep it inside this item, because "two of the
same integration" is the capability an SC actually asks for and two DIFFERENT
integrations is only half of it.

## The unit is one workspace per ADD, not per component

A pair — an integration and the system bound to it — shares ONE workspace. Two ERPs
means two workspaces, not four.

**They already share one, and the arrangement is deliberate.** `demo-erp`'s own
`app.config.yaml` says why it has no static site: *"the ERP shares a Runtime namespace
with its integration, a namespace has ONE static site, and `aio app deploy` empties it
before uploading."* The integration owns that site, because its Commerce Admin screen is
an Admin UI SDK extension (`commerce/backend-ui/2`, web-src and all). The ERP serves its
screen from a web ACTION instead, keyed by `ERP_SCREEN_KEY`.

**What splitting the pair would buy, and what it would cost.** It buys the ERP a real
static site with the SC's own Adobe sign-in, which kills `ERP_SCREEN_KEY`. It costs the
ERP-login credential: an app's Adobe token is refused by an app in another workspace
(live, AB-17 step 5), so Demo Builder would have to mint, store and delete a login for
the integration to reach the ERP.

That is not a trade worth taking. **It replaces one shared secret with another shared
secret and adds a workspace.** The screen-auth problem is a screen-auth problem; moving
a workspace boundary is an expensive and indirect way to attack it.

**Keeping the pair together also buys real things:**

- The ERP-login row leaves this item entirely — the largest new mechanism in the plan,
  and it exists only to work around a separation we would be choosing.
- Reversibility gets simpler. The catalog says the ERP *"Comes with the ERP integration
  and goes with it"* — they are added as one act and removed as one act, so a workspace
  whose lifetime is exactly the pair's lifetime is the right unit. One delete takes the
  whole pair. Two workspaces means a half-removed state to handle.
- Nothing in either repo has to change. `web: no-static-site` and the build hook stay as
  they are.
- The shared database is correct here rather than a compromise: the ERP owns the records
  and the integration reaches them over the ERP's API, which is the design.

**The rule, stated so it generalises:** a workspace is created per ADD. One add — the
starter kit alone, or the ERP with its system — is one workspace. This also keeps the
"one App Management app per workspace" limit satisfied, since a pair has exactly one
(`erp-integration` is `lifecycle: app-management`; `demo-erp` is not).

### What changes in the tables above

- **ERP screen**: NOT part of this item. The web-action screen and `ERP_SCREEN_KEY` stay.
  If the key is worth removing, that is its own item about how the screen authenticates.
- **ERP login**: NOT part of this item. Same workspace, so the Adobe token works.
- **ERP → integration events**: unchanged in effect — I/O Events already work and there
  is no reason to switch to direct calls just because they are now co-located.
- **Remove**: deleting the workspace removes the pair, so teardown resolves both
  components to the same workspace and deletes it once.

## Done when

An SC can add two App Management integrations to one project — including two of the
SAME kind, such as two ERPs — each deploys into its own workspace, and each is removed by
deleting that workspace.

A project made before this still works unchanged, and reaches the new model by removing
and re-adding an integration — no migration code ships.

## Shipped so far

- 2026-09-20  fix(ai): point delete_adobe_workspace at a tool that exists (`e6e5ca096`)
- 2026-09-20  docs(research): the Commerce-profile row cited a function that is gone (`97cde4033`)
- 2026-09-20  docs(backlog): one workspace per add, so a pair shares one (`01b00deba`)
- 2026-09-20  docs(backlog): two of the same integration is in scope, not a follow-on (`37b44ef52`)
- 2026-09-20  docs(backlog): the id names the workspace, the SC name titles it (`551fc7133`)
- 2026-09-20  docs(backlog): how workspaces are made and named today (`eb422d0a9`)
- 2026-09-20  fix(destination): a workspace without its machine name is refused (`4eb80a1e5`)
- 2026-09-20  docs(backlog): AB-23's real open checks, and what Console will show (`ebad37812`)
- 2026-09-20  fix(adobe): nothing provisions Runtime except this sweep (`da0f625d4`)
- 2026-09-20  docs(backlog): AB-23's live checks are closed, and a deploy trap named (`eb042cab7`)
- 2026-09-20  feat(app-builder): a component can record the workspace it deploys into (`446e6556b`)
- 2026-09-20  feat(app-builder): an added component gets its own Adobe workspace (`614a09e70`)
- 2026-09-20  docs(backlog): no migration is built — moving Bodea is a testing step (`c9cc8478e`)
- 2026-09-20  docs(backlog): the migration deletes itself, and says when (`1dca6660d`)
- 2026-09-20  docs(backlog): moving existing projects is part of AB-23, not a follow-on (`ee53cef66`)
- 2026-09-20  feat(app-builder): removing a component deletes its workspace (`0af3ac9f6`)
- 2026-09-21  feat(app-builder): subscribe a component's own APIs, not the project's union (`9b08d6757`)
- 2026-09-21  fix(apis): never add a Commerce API without its product profile (`837395477`)
- 2026-09-21  feat(dashboard): Manage APIs edits the component's own workspace (`aeb6530ac`)
- 2026-09-21  docs(state): cite what makes the merge claim true (`e5c1982b4`)
- 2026-09-21  feat(app-builder): App Management uses the integration's own workspace (`8303d84f3`)
- 2026-09-21  perf(apis): a subscribe asks Adobe for only the APIs it needs (`b9257483c`)
- 2026-09-21  fix(app-builder): an added component really deploys into its own workspace (`258ba1735`)
- 2026-09-21  fix(integrations): the ERP pair's remove line says it plainly (`e903d7119`)
- 2026-09-21  feat(app-builder): list_runtime_packages can read one integration's workspace (`131cbb365`)
- 2026-09-21  fix(app-builder): removal also clears the timers and rules an app leaves (`d4591e81f`)
- 2026-09-21  fix(app-builder): an add's progress says each thing once, under its own name (`232944b98`)
- 2026-09-21  fix(app-builder): a pair's workspace is the integration's; Destination names the project (`ea4e67423`)
