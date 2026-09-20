---
id: AB-23
kind: feature
area: app-builder
parent: AB-9
needs: []
value: high
status: backlog
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
- **Existing projects**: every integration sits in the main workspace and must keep
  working. Whether to move them, and how, is a plan decision — the destination-move code
  is the likely starting point.
- **Project reset** (`projectResetService.ts`) targets `project.adobe` only: decide whether
  reset leaves integration workspaces alone or resets them too.

## Live checks the plan still owes

The research lists these; none is a blocker to starting, but each must be answered before
the matching code is trusted.

1. ~~Deleting a workspace really removes its Runtime namespace.~~ **Done 2026-09-20**: a
   create+delete round trip in Bodea's current project answered HTTP 200 in 3 seconds, and
   the namespace went with it. What is NOT settled is whether a Developer-role SC can do
   the same in a project that has turned read-only (AB-18) — that condition was moved away
   from, not fixed.
2. The ERP's login works across workspaces: 200 with it, 401 without and with a wrong one,
   and an admin action still 200 with the SC's own token.
3. Commerce REST on a new workspace's credential with the tenant's own profile, done by an
   SC with a Developer role, without the project turning read-only. **The choosing is
   already built** — `profileForTenant` in `subscriptionList.ts` matches the project's
   configured tenant — so what is left to check is the live subscribe on a NEW workspace's
   credential, not the code.
4. The ERP's `web-src` in its own workspace opens with the SC's sign-in and reaches its
   actions.
5. An App Management install from a workspace that is not the project's main one.

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

## Done when

An SC can add two App Management integrations to one project, each deploys into its own
workspace, each is removed by deleting that workspace, and a project made before this
still works unchanged.

## Shipped so far

- 2026-09-20  fix(ai): point delete_adobe_workspace at a tool that exists (`e6e5ca096`)
