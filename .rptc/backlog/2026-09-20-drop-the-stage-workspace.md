---
id: AB-24
kind: chore
area: app-builder
needs: []
value: med
status: backlog
---

# Stop creating a Stage workspace

Creating a project today makes TWO workspaces and uses one. Adobe's
`createFireflyProject` provisions **Production**; `createDefaultStageWorkspace` then adds
**Stage**; everything goes into Stage and Production sits empty.

Measured on Bodea, 2026-09-20 — Production held **0 credentials and no subscribed
services**, against Stage's 2 credentials and 6 services (ACCS-REST-API,
AdobeIOManagementAPISDK, GraphQLServiceSDK, CloudIntegrationSDK,
AppBuilderDataServicesSDK, commerceeventing). The zero is real, not a failed read: the
same inspection against Stage returned all of it.

**Stop creating Stage.** Combined with [[AB-23]], a project then has the workspace Adobe
gives it plus one per add, and nothing that exists for its own sake.

## Production is NOT protected — our code said it was, and that was never tested

`deleteWorkspace` and `adobeResourceTools.ts` both stated that Adobe refuses to delete a
Production workspace. Deleting Bodea's answered **HTTP 200 in 3 seconds** (owner-authorised,
2026-09-20). Both comments are corrected.

This matters beyond the comments: an argument for keeping the permanent core in Production
*because it cannot be removed by accident* was drafted into this item and is now withdrawn.
Production is an ordinary workspace that Adobe happens to create.

## Its Runtime namespace has no workspace suffix

Also measured: Production's namespace is `285361-214brownarmadillo` — org id plus project
machine name, with **no workspace segment**. Stage's is
`285361-214brownarmadillo-stage`. So Adobe treats the project's first workspace as the
unsuffixed default. Worth knowing before anything is named for a namespace's shape.

## The open decision: where project-level Adobe state lives

Per-add workspaces cover the mesh and the integrations. One thing is neither:

**The datapack credential.** A datapack write authenticates with an OAuth
server-to-server pair, and one can only be created inside a workspace
(`accsProvisionEligibility.ts`). It belongs to the PROJECT, not to any add. Put it in an
add's workspace and removing that add destroys it.

Two answers, and the first is the recommendation:

**(a) Production is the project's workspace.** It holds the datapack credential and the
mesh. Integrations get their own. Adobe creates it for free, so this costs nothing and
needs no new create path.

**(b) Everything is per-add, including the mesh.** Cleaner symmetry — every workspace is
made by an add and destroyed by its removal. But it splits the Commerce subscription: the
mesh and the datapack credential both need `ACCS-REST-API` with a Commerce product
profile attached, so two workspaces means two credentials, two subscriptions and two
profile attaches. That attach is the step that has been fragile all week, and doubling it
buys symmetry rather than a capability. The mesh is also in nearly every demo, so a
workspace that always exists is the project workspace with extra steps.

Under (a) the mesh stays put and nothing about it changes.

## What changes

| Where | Change |
|---|---|
| `adobeConsoleProjectOps.ts` | Delete `createDefaultStageWorkspace` and its call. |
| `adobeEntityFetcher.createProject.test.ts` | Two tests go — the Stage-create pin and its best-effort-failure sibling. |
| `useProjectCreationPhases.ts` `pickWorkspace` | A new project has ONE workspace, so `workspaces[0]` is the answer. The stage-find becomes dead. |
| `AdobeWorkspacePicker.tsx` `autoSelectCustom` | Prefer the project's RECORDED workspace, then a lone workspace, then `=== 'Stage'` exactly. Covers all three populations without a substring match. |
| Creation copy | `phaseSubMessageFor` names the Stage workspace twice. Both become Production. |

`ensureProjectWorkspacesHaveRuntime` stays: idempotent, tolerates the 409, and is the net
for a Console-made project that arrives without a namespace.

## Why the name was never load-bearing

The creator's comment says Stage matches "the convention the workspace picker auto-selects
on and downstream tooling expects". The first half is circular — we named it Stage so our
own matcher could find it. The second half does not hold: the only functional reads of the
name in `src/` are the two auto-select matchers. Every other "Stage" in `src/` is a doc
comment, and every one in `tests/` is a fixture VALUE, not a behaviour pin — the workspace
travels as a recorded id everywhere, never as a matched name.

It also removes a real failure mode. The Stage create is best-effort by design: a failure
leaves a Production-only project and the picker falls through to `workspaces[0]`. So the
system already has two possible answers to "which workspace is this project's", decided by
whether a call succeeded.

## Every surface

- **Existing projects keep Stage** in `project.adobe.workspace` and keep working, because
  every path targets the recorded id rather than a name. Two populations, one code path.
- **No regenerate path re-creates Stage** — the create is only in `createProject`, so
  creation and regeneration cannot diverge here.
- **The Runtime namespace changes for new projects** — `<org>-<project>` with no suffix
  rather than `...-stage`. Visible in action URLs, harmless.
- **Agent surface**: no tool changes.

## Done when

Creating a project makes no workspace of its own, the demo runs in the one Adobe provides,
a project created before this still works untouched, and no code matches a workspace by the
substring "stage".
