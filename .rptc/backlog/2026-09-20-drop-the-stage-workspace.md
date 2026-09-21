---
id: AB-24
kind: chore
area: app-builder
needs: []
value: med
status: active
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

## Decided: Adobe's workspace is the PROJECT's; every add gets its own

Owner, 2026-09-20, after two wrong turns worth recording because each was an inference
nobody had checked.

**The mesh is not guaranteed** (owner). So "the mesh takes the first workspace" is not a
rule — whatever occupied it would depend on what the SC happened to add first, and the
workspace's name would depend on add order.

**And the mesh does not need `ACCS-REST-API`.** An earlier draft here argued against
giving the mesh its own workspace because it would split the Commerce subscription and
double the product-profile attach. That was inferred from `subscriberTarget` threading
`commerceTenant` through the mesh path — which is defensive plumbing, not a requirement.
Its own comment says why: "Every subscribe caller builds its target here, so the tenant
cannot reach one caller and miss another." The mesh entries in `components.json` declare
no `requiredApis` at all, so a mesh subscribe resolves to the baseline
(`AdobeIOManagementAPISDK`) plus the SC's own picks. `ACCS-REST-API` comes from
`erp-integration`'s `requiredApis` and from the datapack provisioner — never from the
mesh. **The objection is withdrawn: splitting the mesh out costs nothing.**

So the model is uniform:

| Workspace | Holds | Created by | Removed by |
|---|---|---|---|
| Adobe's first one, retitled | the datapack credential — the only thing that is not an add and must outlive every add | Adobe, at project create | project delete |
| one per add | that add: the mesh, an integration, an integration+system pair | the add | the removal |

Nothing is empty, nothing is named for a thing it does not contain, and nothing called
"Production" survives.

**One consequence for [[AB-23]]:** `resolveDesiredApis` returns the union of every
component's picks across the whole project — it is project-scoped, which is the shared-
workspace assumption in code form. Per-workspace subscribing has to make it
per-component. AB-23 already names this; this is the reason it is not optional.

### Do NOT retitle it. Leave it "Production", in our UI too.

The retitle was the plan until 2026-09-20 and the measurements killed it. Recorded in
full because the reasoning reversed twice.

**What was measured, all on throwaway projects that were deleted afterwards:**

| Question | Answer |
|---|---|
| Can a workspace's machine name change? | **No.** `400 — "Workspace name can not be changed."` |
| Can a project's machine name change? | **No — and Adobe returns 200 and silently ignores it.** |
| Can a workspace's TITLE change? | Yes, `200` — but the PATCH must carry the machine name. |
| Does the title reach Adobe's own tooling? | **No.** `aio console workspace list` prints Id, Name, Enabled — there is no Title column. `aio console project list` prints Name AND Title. |

So a workspace title is a field Adobe barely surfaces. Retitling changes what the
EXTENSION shows (`workspaceTitle` drives every display we own) and nothing an SC or a
customer would see in Adobe's own surfaces.

**That makes the rename actively harmful for the case that motivated it.** The reason to
rename was walking a customer IT team through the code. A name only we honour produces
exactly the failure it was meant to prevent: the SC says "the Core workspace", the IT
team's Console says "Production", and nobody can match them up. One name that is slightly
wrong beats two names that disagree.

**The word barely surfaces anyway.** Adobe's first workspace has NO workspace segment in
its Runtime namespace — measured twice: `285361-zznschecke1mk` and
`285361-zzprcheckfosh`, both org id plus project machine name. So "production" appears in
no action URL. It is a label in Adobe's Console, which is Adobe's surface, not ours.

And dropping Stage improves those URLs on its own: today they carry `-stage`, and after
this they carry nothing extra.

**Still unverified:** whether the Console web UI shows a workspace's name or its title.
The CLI evidence is strong but it is not the UI, and checking it needs an Adobe sign-in,
which is the owner's to do. It would only matter if Console shows titles — and even then
the divergence argument above stands.

## What changes

| Where | Change |
|---|---|
| `adobeConsoleProjectOps.ts` | Delete `createDefaultStageWorkspace` and its call. |
| `adobeEntityFetcher.createProject.test.ts` | Two tests go — the Stage-create pin and its best-effort-failure sibling. |
| `useProjectCreationPhases.ts` `pickWorkspace` | A new project has ONE workspace, so `workspaces[0]` is the answer. The stage-find becomes dead. |
| `AdobeWorkspacePicker.tsx` `autoSelectCustom` | Prefer the project's RECORDED workspace, then a lone workspace, then `=== 'Stage'` exactly. Covers all three populations without a substring match. |
| Creation copy | `phaseSubMessageFor` names the Stage workspace twice. Both follow the new title. |

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

## An observation worth chasing: Production's Runtime namespace

The throwaway project's Production workspace reported **no Runtime namespace** when read
seconds after creation. Our code says the opposite — `ensureProjectWorkspacesHaveRuntime`
carries a comment that "the App Builder (jaeger) template provisions Runtime for the
default Production workspace", and that the workspace WE add is the one that misses out.

**This is a lead, not a finding.** Two readings fit: Adobe provisions it asynchronously
and the read was too early, or Adobe never provisions it and our sweep is what creates it
for both workspaces. Telling them apart needs a create, a wait and a re-read.

It changes no decision here — `ensureProjectWorkspacesHaveRuntime` stays either way,
because it is idempotent and tolerates the 409. But if the second reading is right, that
comment is a false claim about another system of the same kind as the "Adobe refuses to
delete Production" one, and it is worth correcting.

## Every surface

- **Existing projects keep Stage** in `project.adobe.workspace` and keep working, because
  every path targets the recorded id rather than a name. Two populations, one code path.
- **No regenerate path re-creates Stage** — the create is only in `createProject`, so
  creation and regeneration cannot diverge here.
- **The Runtime namespace changes for new projects** — `<org>-<project>` with no suffix
  rather than `...-stage`. Visible in action URLs, harmless.
- **Agent surface**: no tool changes.

## Done when

Creating a project makes no workspace of its own, the demo runs in the one Adobe provides
(called Production, in Adobe's surfaces and in ours), a project created before this still
works untouched, and no code matches a workspace by the substring "stage".

## Shipped so far

- 2026-09-20  docs(backlog): do not rename the workspace after all (`9f70f328b`)
- 2026-09-20  docs(backlog): the project's workspace is titled "Core" (`1e0c27602`)
- 2026-09-20  docs(backlog): Adobe's workspace is the project's, every add gets its own (`6aec121f1`)
- 2026-09-20  docs(backlog): Adobe permits retitling its own Production workspace (`ec1655e21`)
- 2026-09-20  docs(backlog): a workspace retitle works, but the PATCH must carry the name (`a5d049278`)
- 2026-09-20  docs(backlog): the project keeps Adobe's workspace, retitled (`032b4c908`)
- 2026-09-20  fix(adobe): no workspace name is protected, Production included (`d90607e5f`)
- 2026-09-20  docs(backlog): AB-24, stop creating a Stage workspace (`c8690debd`)
