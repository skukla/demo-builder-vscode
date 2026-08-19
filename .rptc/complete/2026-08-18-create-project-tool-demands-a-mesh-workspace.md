# `create_project` refuses without an Adobe workspace, for packages that have no mesh

## Provenance

Hit 2026-08-18 while trying to verify — headlessly, over the running MCP server — that project
creation publishes a previewable block library. The verification never started: the tool
refused before doing any work.

```
create_project { projectName: "libcheck-0818", package: "bodea", stack: "eds-accs", … }
→ {"error":"An Adobe workspace is required for API Mesh.
   Select one first: select_org → select_project → select_workspace."}
```

Retried on `eds-paas` (the mesh-free EDS stack) and got the identical refusal, 0.0s elapsed.

**Bodea does not use a mesh.** `src/features/project-creation/config/demo-packages.json`
records `requiresMesh: false` for it (`isle5`, `custom`, `citisignal` and `bodea` are all
`false`; only `buildright` is `true`).

**Correction 2026-08-18:** this paragraph originally named the field `mesh`. It is
`requiresMesh`, and it is typed `boolean | 'optional'` — a third value the fix must handle.
The wrong name was carried into a conversation before anyone read the config.

## The defect

`src/features/ai/server/createProjectTool.ts:112-119` resolves the Adobe context and treats a
missing workspace as fatal, unconditionally:

```ts
const workspace = (await mgr.getCurrentWorkspace()) as WizardState['adobeWorkspace'];
if (!workspace) {
    return {
        error: {
            error: 'An Adobe workspace is required for API Mesh. Select one first: …',
        },
    };
}
```

The guard never asks whether the package or stack being created needs one. Two things are
wrong with that, and they are separable:

1. **It blocks work that would succeed.** A mesh-free package needs no workspace, and the
   wizard path proves it — the same package creates fine there. The headless path is the only
   one that demands it.
2. **The message names a component the project does not have.** "required for API Mesh" sends
   the reader looking for a mesh in a project whose package declares `mesh: false`. A guard
   that fires for the wrong reason costs more than one that does not fire: it is a false
   explanation, and the reader believes it.

## Why it was not fixed on the spot

The workaround is `select_org → select_project → select_workspace`, which attaches a throwaway
demo to one of the user's real Adobe Console projects and mutates the session's current
selection. That is a bigger side effect than the verification was worth at the time, and it was
not what the user had agreed to. The verification it was blocking was resolved by inference
instead (creation and refresh call the same `executeEdsPipeline` Step 6, and the two pre-fix
refreshes failed exactly as creation did).

## Scope

Small and well-bounded.

1. Make the guard conditional on whether the resolved package/stack actually requires a mesh.
   `demo-packages.json` already carries `mesh`, and the mesh requirement resolver lives in
   `demoPackageLoader.ts` — the data is there, nothing needs inventing.
2. Reword the refusal so it names the real reason. When a mesh IS required, "API Mesh needs an
   Adobe workspace" is correct and useful; when it is not, there should be no refusal at all.
3. Check the sibling guards in the same tool for the same shape — a requirement asserted for
   every project rather than for the ones that have it.

## Constraints

- **Do not weaken the guard for mesh packages.** `buildright` genuinely needs a workspace, and
  creating it without one must still refuse. Both directions need a test: mesh package with no
  workspace still refuses; mesh-free package with no workspace proceeds.
- The wizard path is unaffected and must stay that way — it supplies a workspace naturally.
- Assert the ARGUMENT the tool passes on, not just the outcome. The workspace is threaded into
  wizard state, and a mocked creation answers the same whether it received one or not.

## Kickoff prompt

> Read `.rptc/backlog/2026-08-18-create-project-tool-demands-a-mesh-workspace.md`. The headless
> `create_project` MCP tool refuses to create ANY project without an Adobe workspace, including
> packages whose `demo-packages.json` entry says `mesh: false` — so a Bodea or CitiSignal
> project cannot be created headlessly at all, and the refusal blames API Mesh for it. Make the
> guard conditional on the resolved mesh requirement, keep it firing for packages that do need
> one (`buildright`), and fix the message. Tests in both directions; assert the workspace
> actually reaching wizard state, not just the success flag.

## Update 2026-08-18 — the premise moved

Two things changed after this was filed, and both bear on the fix:

1. **A mesh can now be added DURING creation**, through the Integrations area's Add
   Integration flow. So "does this project need an Adobe workspace?" is not knowable when
   `create_project` starts — the answer depends on what the caller does later. The guard
   should demand a workspace only when the package's `requiresMesh` makes a mesh certain,
   and otherwise let the mesh step demand it at the moment a mesh is actually chosen. That
   is where the requirement genuinely lives.

2. **The wizard has the same hole, in the other direction.** `isIntegrationsComplete`
   (`tileStatus.ts:139`) never consults `requiresMesh`, so a package that REQUIRES a mesh
   can be walked past with none selected. Filed as
   `2026-08-18-force-the-mesh-a-package-requires.md`, deliberately separate: that one is an
   undesigned capability gating zero users today, and this one is a bounded defect blocking
   agent work now. **Whichever lands first defines the shared predicate** — *does the
   selected package + stack require a mesh?* — and the other consumes it rather than
   writing a second copy.

Scope item 3 above ("check the sibling guards for the same shape") is unchanged and still
the place a second instance would hide.
