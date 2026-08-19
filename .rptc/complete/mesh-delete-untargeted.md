# `delete_mesh` deletes whatever the CLI last selected

**Filed:** 2026-08-14, from a `/rptc:research` pass on MCP scoping.
**Severity:** highest-value item found in that pass. Destructive, cloud-side,
reachable from BOTH the dashboard and the agent surface, and the safety net that
would have warned is spelled wrong.

## The defect, in three verified parts

**1. The workspace argument is validated and then discarded.**
`handleDeleteApiMesh` takes `payload: { workspaceId }`, validates it against
command injection (`deleteHandler.ts:29-33`), logs it — and then runs:

```
aio api-mesh delete --autoConfirmAction
```

`workspaceId` never reaches the command (`deleteHandler.ts:56-63`). The argument
exists, is checked, and has no effect on what gets deleted.

**2. Nothing targets the org/workspace.** `deleteHandler.ts` imports no targeting
helper and calls no `withOrgContext`. Its siblings do:

| Mesh op | Targeted? |
|---|---|
| check / get | **yes** — `checkHandler.ts:138` |
| deploy | **yes** — `deployMeshHeadless.ts:143` |
| **delete** | **no** — nowhere |

With no active target the `aio` CLI falls back to its process-global
`aio console where` selection — which this codebase deliberately stopped
maintaining. `orgContextEnv.ts:115-122` says so directly: it "holds whatever some
earlier session or another tool left there", citing the 2026-08-03 incident where
an unwrapped call deployed into a deleted project.

**3. The safety net cannot fire, because of a spelling mismatch.** The guard is:

```ts
const ORG_SCOPED_AIO = [/^aio\s+api-mesh:/, …];   // orgContextEnv.ts:142
```

Colon form. The delete command uses the **space** form (`aio api-mesh delete`), so
`needsOrgTargeting` returns false and `commandExecutor` logs nothing. The guard's
own tests pin only colon spellings
(`commandExecutor-orgTargetingGuard.test.ts:98-99`), so the tests share the blind
spot — which is why this survived.

## Blast radius

Both surfaces, not just MCP:

- Dashboard → `meshHandlers.ts:22` (`'delete-api-mesh'`)
- Agent → `actionDescriptors.ts:158` (`delete_mesh`), dispatched through
  `registerDescriptorTools` with no `runWithAdobeTarget` wrapper, unlike every
  hand-written Adobe-touching tool.

Consequence: a user (or an agent) deleting "this project's mesh" can delete the
mesh belonging to whichever org/project/workspace the machine's CLI last had
selected. Meshes are cloud resources shared by a workspace; this is not
recoverable by re-running anything locally.

## Not reproduced live

Everything above is READ from source, plus the modules' own docstrings. Nobody has
observed a wrong-mesh deletion. Reproducing it needs two workspaces and a
deliberately stale `aio console where` — do that first, because the fix should be
verified against a reproduction rather than against the reading.

## Fix sketch (small, but confirm the repro first)

1. Wrap the delete in `withOrgContext(buildOrgTargetFromProjectAdobe(project.adobe, cachedOrg))`
   exactly as `deployMeshHeadless.ts:143` does — the sibling is the template.
2. Widen `ORG_SCOPED_AIO` to cover the space form (`/^aio\s+api-mesh[\s:]/`) and
   add a space-form case to `commandExecutor-orgTargetingGuard.test.ts`, so the
   guard stops agreeing with its own blind spot.
3. Decide what `workspaceId` is FOR. Either pass it to the CLI or remove it —
   an argument that is validated and ignored is worse than no argument, because
   it reads as a target the caller controls.

## Kickoff prompt

> Read `.rptc/backlog/mesh-delete-untargeted.md`. Reproduce first: set
> `aio console where` to a workspace other than the current project's, then delete
> the mesh from the dashboard and observe which mesh disappears. Then wrap the
> delete in `withOrgContext` following `deployMeshHeadless.ts:143`, widen the
> `ORG_SCOPED_AIO` guard to the space form, and pin both with tests. Use the
> `adobe-org-context` skill — it is the canonical model for this.
