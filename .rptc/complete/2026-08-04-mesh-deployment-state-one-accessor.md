# Mesh deployment state: one fact, five readers, two writers

**Filed:** 2026-08-04
**Origin:** Six commits in one day on the mesh add/deploy path, each fixing a different
reader of the same fact. See `docs/research/2026-08-04-mesh-scenarios-and-catalogs.md`.
**Severity:** Medium — no live defect remains, but the arrangement that produced six is intact.
**Present in:** the readers listed below.

---

## ✅ RESOLVED 2026-08-04 — with two of the four questions found already solved

The inventory (step 1) did not match the item's own premise, so recording what was
actually there:

| Question | State when opened | Action |
|---|---|---|
| Which entry is the mesh | `getIdentifiedMeshAppBuilderComponent`, one accessor | none needed |
| Has it EVER deployed | `hasMeshDeploymentRecord`, ONE accessor, 4 call sites | none needed |
| Is it deployed NOW | one real mesh reader (`meshVerifier.ts:339`) | none needed — no drift surface |
| Is it STALE | **three** encodings of "stale or update-declined" | fixed |

So the six readers had already converged; the item over-counted by treating each
2026-08-04 fix site as a standing duplication. What was genuinely open:

**1. The second writer (step 4) — closed.** Verified rather than assumed:
`updateMeshStateImpl` calls `recordDeployOutcome`, which mirrors status onto the
same instance object `deployMeshHeadless` held. Its `meshComponent.status =
'deployed'` and `= 'error'` lines were therefore redundant and are deleted. The
`= 'deploying'` line STAYS — `recordDeployOutcome` mirrors only `deployed`/`error`,
so that one has no other writer. Deleting the two also fixed a real inconsistency:
`recordDeployOutcome` stamps `lastUpdated`, the hand-writes did not.

**2. The stale predicate — closed.** `isUpdatePending` in `statusVocabulary` is now
the one place that knows `stale` and `update-declined` are the same answer;
`meshNeedsRedeploy` asks it instead of testing both literals. `needsStorefrontRepublish`
deliberately keeps its own one-liner: different subject, different field, and Rule
of Three is not met at two.

**3. A test double that was lying — found by the writer collapse.** `deployMesh-storage`
mocked `updateMeshState` as writing the legacy `meshState` singleton and nothing
else — behaviour production retired at ADR-011 D3. Three assertions in that suite
were validating the pre-migration model and passed only because the redundant
writer masked the gap. The double now reproduces what the real function writes, and
the assertions target the keyed entry.

### Correction — closed too early, reopened and fixed the same day

The closure above was wrong in a way worth recording. It reported "the writers are
collapsed" on the strength of an inventory that compared READERS and STATUS writes.
It never compared what the two mesh deploy paths **record** — and they disagreed on
three fields:

| Field | `deployMeshHeadless` | keyed runner (dashboard Add/Redeploy) |
|---|---|---|
| status / endpoint / lastDeployed | ✓ | ✓ |
| `envVars` (staleness baseline) | ✓ via `updateMeshState` | ✗ |
| `sourceHash` | ✓ via `updateMeshState` | ✗ |
| instance `metadata.meshId` | ✓ | ✗ |

Found in a user's debug logs hours later, from a real project whose manifest showed
`sourceHash: None`, `envVars: {}`, `metadata: null` on a mesh reading `deployed`.
Two live consequences: staleness could NEVER be computed for a dashboard-added mesh
(empty baseline → an Adobe I/O fetch on every window open → "Failed to parse mesh
data" → give up), so no redeploy prompt would ever fire after a credential change;
and every status request fell back to `aio api-mesh:describe` to recover the mesh
id, costing ~3s and logging a failure each time.

Fixed by giving the runner a `captureMeshBaseline` dep — injected at the
`appBuilderComponentRunnerDeps` seam, because that module's docstring is explicit
that the runner stays free of cross-feature deploy imports (a first attempt
imported the mesh helpers directly and violated it) — plus stamping `meshId` onto
the instance in the mesh branch. `appBuilderComponentRunner-meshRecordParity.test.ts`
pins the RECORD rather than the mechanism, so any future path landing a poorer one
fails.

**The lesson for the next audit:** "one writer" was verified for the field the
symptom pointed at (status) and assumed for the rest of the record. Compare the
whole persisted shape, not the field currently misbehaving.

**Not done, deliberately:** relocating `hasMeshDeploymentRecord` from
`dashboard/services` to sit beside the resolver. It is already a single accessor;
moving it is a file move, not a fix, and both feature dirs already import it.

---


## The shape

Every mesh bug fixed on 2026-08-04 was the same thing: **two writers of "is this mesh
deployed, and which mesh is it", and a reader consulting the wrong one.** Each fix moved the
failure one reader downstream.

| Reader | Consulted | Should have | Fixed in |
|---|---|---|---|
| Add picker | hand-authored catalog | the registry | `bc70668a` |
| `aio api-mesh` | no `.env` written | the registry env contract | `68d4d7fa` |
| `getMeshComponentInstance` | an absent instance | the instance `installComponent` returned | `d69aa309` |
| `handleRequestStatus` | instance status stuck at `ready` | the deploy outcome | `8111fd3d` |
| `hasMeshDeploymentRecord` | `envVars` staleness baseline | the deploy record | `9f8321cb` |
| `projectStatusUtils.getMeshStatusKey` | bare find-by-kind | the canonical resolver | `12f82063` |

That is not six unrelated bugs. It is one fact with six readers and two writers
(`recordDeployOutcome` and `deployMeshHeadless`'s hand-written assignments) that never fully
agreed. Each reader looked correct in isolation, which is exactly why every one was found by
a user reporting a symptom rather than by review or tooling.

## Goal

One accessor every surface calls for mesh deployment state — the way
`core/vscode/progressRegister` became the one answer for "how does an operation narrate
itself", and for the same reason: a shared decision with no shared implementation drifts.

## Execution plan

1. **Inventory the readers.** Run `.claude/skills/architecture-duplication-scan` §4 narrowed
   to the mesh fact. It returns a five-site shortlist today (the owner plus re-derivations).
   Add the status readers by hand: `hasMeshDeploymentRecord`, `handleRequestStatus`'s mesh
   branch, `getMeshStatusKey`, the integrations grid, the projects-list card.
2. **Name the questions.** They are not one question. At least: *which entry is the mesh*
   (solved — `getIdentifiedMeshAppBuilderComponent`), *has it ever deployed*, *is it deployed
   NOW*, *is it stale*. Conflating them is what let a staleness baseline answer an existence
   question.
3. **One accessor per question**, in `features/app-builder/services/appBuilderComponentState`
   beside the resolver that already lives there.
4. **Collapse the writers.** `recordDeployOutcome` already advances both the keyed entry and
   the instance (`8111fd3d`); `deployMeshHeadless`'s direct `meshComponent.status =` lines are
   now redundant. Delete them, so one writer remains.
5. **Contract test**, not a comment. The bar: one edit to the shared accessor must fail tests
   on every surface. `progressRegister` is the reference — breaking its rule fails 12 tests
   across 5 suites.

## Constraints

- **Do not conflate the four questions into one boolean.** The `hasMeshDeploymentRecord` bug
  was precisely that.
- Legacy `meshState` synthesis must keep working — pre-migration manifests carry the baseline
  without the newer fields, and `9f8321cb` deliberately kept `envVars` in the disjunction for
  them.
- The keyed `appBuilderComponents` map stays the persisted authority (ADR-011 D3). This is
  about READ paths, not a new store.
- Rule of Three does not apply: the `reuse-first` skill's demonstrated-drift exception does,
  and six instances is well past it.

## Kickoff prompt

> Mesh deployment state has six readers and two writers that repeatedly disagreed — six
> user-reported bugs on 2026-08-04, each a different reader. Separate the questions (which
> entry is the mesh / has it deployed / is it deployed now / is it stale), give each ONE
> accessor, delete `deployMeshHeadless`'s now-redundant direct status writes, and add a
> contract test that fails on every surface when the shared answer changes. See
> `.rptc/backlog/2026-08-04-mesh-deployment-state-one-accessor.md`.
