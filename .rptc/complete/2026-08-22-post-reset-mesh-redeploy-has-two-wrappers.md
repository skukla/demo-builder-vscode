# Post-reset mesh redeploy is implemented twice

**Filed:** 2026-08-22
**Origin:** The mesh call-path audit (the first spine choke-point audit; its
worked example and the pinning test are `tests/templates/spine-chokepoints.test.ts`).
**Status:** SHIPPED 2026-08-22. The duplicated KNOWLEDGE was the
create-or-update rule — "source the existing mesh id from REMOTE truth" —
copied three times with its own explanatory comment. Now ONE copy:
`mesh/services/meshRedeploy.deployMeshCreateOrUpdate`, called by the EDS
reset, the non-EDS reset, AND the headless deploy (all three, per this item's
design note). One correction to the filed design: the helper does NOT own
`updateMeshState`/`saveProject` — the audit showed the two resets genuinely
differ there (EDS saves after success, non-EDS deliberately defers), so
persistence stayed with callers as their own policy. All 65 proof suites ran
unchanged, zero mock edits needed; full gate green.

## The claim (verified, both files read 2026-08-22)

The two reset flows each carry their own "redeploy the mesh after reset"
wrapper. Same job, two implementations:

| | EDS reset | Non-EDS reset |
|---|---|---|
| File | `src/features/eds/services/edsResetMeshHelper.ts` (`deployMeshAndPersist` + `redeployApiMesh`, 163 lines) | `src/features/lifecycle/services/projectResetService.ts` (`runTargetedMeshDeploy`, ~60 lines) |
| Sequence | `fetchMeshInfoFromAdobeIO` → `deployMeshComponent` (the spine) → `updateMeshState` → `saveProject` | identical sequence |
| Create-or-update | existing mesh id from Adobe I/O remote truth | identical (its comment even cites the other: "like deployMeshHeadless and projectResetService") |
| Org targeting | caller's `withOrgContext` + own auth preflight (`ensureProjectAdobeContext`) | caller-side targeting |
| Failure shape | partial-success `EdsResetResult` with `errorType: 'MESH_REDEPLOY_FAILED'` | partial-success `earlyReturn` + a `showWarningMessage` toast |

Both sit ON the deploy spine — so the choke-point test contains the worst
damage (nobody can fork the actual deploy) — but the fetch-id → deploy →
persist → report-partial-success choreography around it is duplicated, and
only the touched one will get future fixes (e.g. an auth-preflight fix landing
in one reset flow and not the other).

Note the near-third: `deployMeshHeadless` runs the same create-or-update
choreography for the dashboard/MCP door. Three similar wrappers is Rule-of-
Three territory — the extraction should at least be DESIGNED against all
three, even if headless keeps its own progress surface.

## The fix

Extract one shared `redeployMeshAndPersist(project, meshPath, context,
onProgress)` (natural home: `features/mesh/services`, beside the spine) that
owns: remote mesh-id fetch, spine call, `updateMeshState` + `saveProject`.
Callers keep what genuinely differs — auth preflight, org-context wrapping,
progress surface, and each flow's partial-success result shape.

Behaviour-preserving refactor: both reset suites and the headless suite run
unchanged (that is the proof, per the ServiceGroupList precedent).

## Why deferred

Touches both reset flows at once; the spine choke-point test already prevents
either copy from becoming a second deploy path. Do it as its own slice, not as
a rider on other reset work.

## Proof suites (verified to exist 2026-08-22)

`tests/features/eds/services/edsResetMeshHelper.test.ts`,
`tests/features/eds/services/edsResetService-meshAuth.test.ts`,
`tests/features/lifecycle/services/projectResetService-meshContext.test.ts`
(+ the rest of the projectResetService-* family). Behaviour-preserving means
these run unchanged; their MOCKS are the first thing to audit when the shared
helper lands (a mock keeps answering in the old shape — see
webview-test-authoring §8).

## Kickoff prompt

> Extract the shared post-reset mesh redeploy per
> `.rptc/backlog/2026-08-22-post-reset-mesh-redeploy-has-two-wrappers.md`.
> Read both wrappers first (`edsResetMeshHelper.deployMeshAndPersist`,
> `projectResetService.runTargetedMeshDeploy`) plus the near-third
> (`deployMeshHeadless`); design the helper against all three even if
> headless keeps its own surface. Home: `features/mesh/services`, beside
> `deployMeshComponent`. Callers keep auth preflight, org targeting,
> progress, and their own partial-success result shapes. Proof: the suites
> named above run unchanged. Full `gate` after; one slice, its own commit.
