---
id: AB-24
kind: chore
area: app-builder
needs: []
value: med
status: backlog
---

# Stop creating a Stage workspace; use Production as the project's main one

Creating a project today makes TWO workspaces and uses one of them. Adobe's
`createFireflyProject` provisions **Production**; `createDefaultStageWorkspace` then adds
**Stage**; everything the demo owns goes into Stage and Production sits empty. Confirmed
live on Bodea, 2026-09-20 — `list_workspaces` returns exactly those two.

Drop the second create. The demo's main workspace becomes Production.

## Why

**The workspace we cannot delete is the one that should hold the permanent core.** Our
code states that Adobe refuses to delete Production (`deleteWorkspace`,
`adobeResourceTools.ts`). Under [[AB-23]] every add gets its own deletable workspace, and
what stays for the life of the project — the mesh, the Commerce credential — belongs in
the one that cannot be removed by accident. Creating Stage does the opposite: it puts the
permanent core in a deletable workspace and leaves the undeletable one empty.

**Nothing outside our own picker wants the name.** The creator's comment says Stage
matches "the convention the workspace picker auto-selects on and downstream tooling
expects". The first half is circular — we named it Stage so our own matcher could find it.
The second half does not hold up: the only functional reads of the name in `src/` are the
two auto-select matchers (`useProjectCreationPhases.ts`, `AdobeWorkspacePicker.tsx`).
Every other appearance of "Stage" in `src/` is the word "production" in a doc comment, and
every appearance in `tests/` is a fixture VALUE, not a behaviour pin — the workspace
travels as a recorded id everywhere, never as a matched name.

**It removes a real failure mode.** The Stage create is best-effort by design: a failure
leaves a Production-only project, and the picker then silently falls through to
`workspaces[0]` — Production. So the system already has two possible answers for "which
workspace is this project's", decided by whether a call succeeded. One workspace at create
time means one answer.

**It also shortens the create.** One fewer Console call, and the Runtime namespace comes
free: the App Builder template provisions one for Production, which is exactly why
`ensureProjectWorkspacesHaveRuntime` had to exist for the workspace we were adding.

## What changes

| Where | Change |
|---|---|
| `adobeConsoleProjectOps.ts` | Delete `createDefaultStageWorkspace` and its call. |
| `adobeEntityFetcher.createProject.test.ts` | Two tests go — the Stage-create pin and its best-effort-failure sibling. |
| `useProjectCreationPhases.ts` `pickWorkspace` | A new project has ONE workspace, so `workspaces[0]` is the answer. The stage-find becomes dead. |
| `AdobeWorkspacePicker.tsx` `autoSelectCustom` | Prefer the project's RECORDED workspace, then a lone workspace, then `=== 'Stage'` exactly. Covers all three populations without a substring match. |
| Creation copy | `phaseSubMessageFor` says "Registering the project and its Stage workspace" and "Selecting the Stage workspace". Both become Production. |

`ensureProjectWorkspacesHaveRuntime` stays. It is idempotent, tolerates the 409, and is
the net for a Console-made project that arrives without a namespace.

## Every surface

- **Existing projects keep Stage** in `project.adobe.workspace` and keep working, because
  every path targets the recorded id rather than a name. Two populations, one code path.
- **No regenerate path re-creates Stage** — the create is only in `createProject`, so
  creation and regeneration cannot diverge here.
- **The picker serves three populations**: new projects (Production only), projects made
  before this (Production + Stage), and Console-made projects (whatever they have). The
  recorded-workspace-first rule is what makes one rule cover all three.
- **The Runtime namespace changes for new projects** — `...-production` rather than
  `...-stage`. Visible in action URLs, harmless.
- **Agent surface**: no tool changes. `list_workspaces` returns whatever exists.

## Not verified

**Whether Adobe actually refuses to delete a Production workspace.** Our code says so in
two places and neither cites a measurement; the live delete proven on 2026-09-20 was of an
ordinary workspace, not Production. Testing it means deleting a real Production workspace,
which is not worth doing to settle a supporting argument. **The recommendation does not
depend on it** — if Production turns out to be deletable, using it as the main workspace is
still one fewer create and one fewer answer to "which workspace is this".

## Done when

Creating a project makes one workspace, the demo runs in it, a project created before this
still works untouched, and no code matches a workspace by the substring "stage".
