# Mesh deploy: create-vs-update must consult the remote (+ blank-error formatter fix)

> **✅ SHIPPED 2026-07-15** (same-day pull-forward, `/rptc:fix` on develop). Landed: (b) the
> "already has a mesh" → one-shot retry-as-update fallback in `deployMeshComponent` (same
> withOrgContext; update-path failures never loop); the blank-error fix (`formatAdobeCliError`
> now trims — a leading `›` no longer yields a blank first line); command-aware progress
> strings; PLUS the review's inverse-gap find: `edsResetMeshHelper` now sources
> `existingMeshId` from `fetchMeshInfoFromAdobeIO` (remote truth) like the other callers.
> Option (c) was investigated and deliberately NOT taken: the wizard's `apiMesh` seam exists
> but re-adding a flow-time probe is a UX change the fallback makes unnecessary.
> **Residual (recorded, not blocking):** `createHandler`'s bespoke create pipeline duplicates
> the already-has-a-mesh handling with a drifting detector (case-sensitive `.includes` vs the
> new `/already has a mesh/i`) — an `architecture-duplication-scan` candidate; if both
> pipelines survive, share one exported signature predicate.

## Provenance

Found 2026-07-15 during ADR-011 D3 live-check testing (debug-log triage; the log is the seed
example in `.claude/skills/debug-log-triage/`). **Pre-existing on `develop`** — not a D3
regression (verified: identical strategy code both sides) — but it blocks any create flow that
reuses an Adobe project/workspace already carrying a mesh, including the D3 live-check runbook.

## The bug

`deployMeshComponent` picks its strategy from **project state only**
(`src/features/mesh/services/meshDeployment.ts:115-121`):

```ts
const meshCommand: 'create' | 'update' = existingMeshId ? 'update' : 'create';
```

For a NEW project, `existingMeshId` is always empty — but the REMOTE workspace may already
have a mesh (Adobe allows one mesh per workspace). Result: `aio api-mesh:create` fails with
*"Selected org, project and workspace already has a mesh"* and creation aborts + cleans up.
Nothing probes the remote and nothing catches the signature to retry as update.

**Wizard seam worth checking first:** the executor's decision context logged
`typedConfig.apiMesh: undefined` — the wizard has an `apiMesh` config slot it did not populate.
There may be an existing check (`check-api-mesh` handler / destination-stage probing) whose
result simply isn't threaded to the executor. Prefer wiring an existing probe over adding one.

## Secondary (same incident): blank error surfaced

The failure logged `[error] Error:` with NO message — the formatter dropped the CLI's stderr,
which held the actionable line. The structured `{stdout, stderr}` debug dump had the truth.
Fix the mesh deployment failure path (`errorFormatter.ts` / the catch in `meshDeployment.ts`)
to surface the CLI stderr/stdout summary in the user-facing error.

## Goal / Scope

1. Create-vs-update decides correctly when the workspace already has a mesh. Options:
   (a) probe remote (`aio api-mesh:get`, org-context targeted) before choosing — one extra CLI
   call (~2-4s) on every deploy; (b) **catch the "already has a mesh" signature → retry once as
   update** — zero happy-path cost, matches the existing "check stdout for success indicators"
   CLI-resilience pattern; (c) thread an existing wizard-side probe through `typedConfig.apiMesh`.
   Investigate (c) first, else prefer (b). Recommend (b)+(c).
2. Failed mesh deploys surface the CLI's own error line to the user.
3. Regression tests pinning both (mock CLI returning the signature; error text non-empty).

## Constraints

- The retry-as-update must run inside the SAME `withOrgContext` targeting as the create.
- Post-D3: the deploy outcome lands on the keyed mesh entry (`recordDeployOutcome`) — an
  update-after-create-failure must persist identically to a clean update.
- Timeout handling per `src/commands/CLAUDE.md` (CLI ops can succeed after the timeout fires).

## Kickoff prompt
> Fix mesh create-vs-update (`.rptc/backlog/2026-07-15-mesh-create-vs-update-remote-probe.md`)
> via `/rptc:fix`. First check whether the wizard already probes for an existing mesh
> (`typedConfig.apiMesh` arrives undefined at the executor); wire it through if so. Then add the
> "already has a mesh" → retry-as-update fallback in `meshDeployment.ts` and surface CLI stderr
> in the failure message. RED-first; note the D3 keyed-entry persistence constraint.
