# Track 3 convergence — overnight loop report

Started 2026-08-31 when the owner went to bed. Appended as work happens.
State and contract: `2026-08-31-track3-loop-state.md`.

## Summary

Converting 28 test suites off their module mocks, so a stateless collaborator arrives
through a seam instead of by intercepting its module. **8 of 28 done** at loop start.

## What has landed

| Suite | Wall | Note |
|---|---|---|
| `publishKeyRegistrar` | Helix | Removing it exposed 11 `as never` casts hiding that `Logger` has no `.mock` |
| `refreshBlockLibraryHeadless` | Helix | The mock returned an empty object and asserted nothing |
| `storefrontRepublishContent` | Helix | Assertion got STRONGER — `expect.anything()` became the named instance |
| `contentAuthoringTools` x2 | Helix | Factory seam; 99 tests green |
| `edsResetUI.testUtils` | GitHubApp | Frees 6 suites; the service sat behind a dynamic import |
| `catalogPrewarmPhase` | Helix + tokens | The suite was WRITTEN as this conversion's witness. Lost no assertion |

Seams also added to `storefrontSetupPhases` (retires three walls at once) and
`edsResetConfigStep`.

## Findings so far

**Every wall that comes down exposes something it was hiding.** Three for three: the
casts above, a partial fake tsc refused, and an assertion that could not name its own
subject. This is the argument for the work — the tests get stronger, not just cheaper.

**One wall is load-bearing and must not be removed carelessly.** `edsResetConfigStep`
asserts Helix is CONSTRUCTED with the token provider. That check exists because its
absence caused a live 401 on 2026-08-15 — a site carrying an admin role refuses the
GitHub token, and the CDN kept serving a stale config. A handed-in fake hides it.
Convert by keeping one test on the default path.

**tsc found a better seam than I designed.** For `catalogPrewarmPhase` I typed a factory
return as unknown; the compiler named `PdpPublisher`, the narrow interface the consumer
actually needs. Injecting that beats injecting the whole class.

## Not every "wall" is the same defect (found 2026-08-31)

The 28 were counted by one signal — a `jest.mock` naming a service module. Reading them
shows at least three different things wearing that shape, and only the first is what
ADR-016 is about:

1. **An injection wall.** The suite needs the collaborator and has no way to hand it in.
   This is the real target; a seam retires it and usually makes an assertion stronger.
2. **A construction assertion.** The mock exists to check the service is BUILT with the
   right credentials — `edsResetConfigStep` and the 401 case. A handed-in fake hides
   exactly what the test is for. Convert by keeping one test on the default path.
3. **A static side-effect silencer.** `edsDaLiveAuthHandlers-storeToken` mocks
   `HelixService.initKeyStore` — a STATIC, called fire-and-forget as `void`, purely so a
   handler path does not touch real secret storage. Nothing is being handed in, so there
   is nothing to inject. Threading a seam for a static initializer through the service
   cache would cost real complexity for no test-design gain. **Left deliberately.**

The count of walls is therefore an upper bound on the work, not a target to drive to
zero — the same lesson the coverage scan already carries about its own number.

## What converting a wall keeps turning up (2026-08-31, walls 11-14)

Four more suites came off their module mocks, and in **three of the four** the fix was
in the source, not the test. The shape repeats exactly:

> A function declares a whole service CLASS as a parameter and calls two or three
> methods on it. A test cannot supply that without a cast, so it mocks the module
> instead. Narrowing the parameter to the methods actually used fixes both — the
> signature gets honest, and the mock becomes unnecessary.

Three parameters were narrowed this way. `migrateStorefrontNamingIfNeeded` took two
classes and calls three methods. `registerSiteConfig` took the Config Service and calls
two. The two block-library publish helpers took Helix and call two. Every real service
still satisfies its new interface, so no production caller changed.

`registerSiteConfig` is worth singling out: narrowing it unblocked the config-service
half of two OTHER suites at once. Some of these walls share a root, and finding the root
is cheaper than converting the leaves one at a time.

**A fourth defect class, beyond the three above: a suite that re-mocks mid-test.**
`configSyncService` called `require('.../helixService')` inside five test bodies and
installed a fresh implementation each time, one of them reading
`HelixService.mock.results[0]` — so what a test received depended on whether an earlier
test had constructed one. That is not a mock wall so much as a test suite reaching into
Jest's module registry at runtime, and the seam removes the ability entirely.

**A construction assertion does not have to be traded away.** `edsResetConfigStep`
looked unconvertible: its whole point is that the DA.live token reaches the Helix
CONSTRUCTOR, and handing in an instance skips construction. A FACTORY seam keeps the
property assertable with no module mock. That is now the rule — instance seam by
default, factory seam when the suite asserts about construction.

Every one of the four was verified by planting the defect the test exists to catch and
confirming the converted suite still fails. Two of those plants would have passed
silently under the old module mock.

**Parked, with a reason.** The five `storefrontSetupPhases-*` and `edsResetService-*`
suites share one root: `executeEdsPipeline` takes three whole service classes with 25
methods between them. Narrowing that is a real piece of work rather than a step, and it
should be decided rather than slipped into an overnight batch.

## Your decisions in the morning

- Merge `loop/2026-08-30-track3-convergence` into develop?
- PL-22 — what the 59% mutation score means for policy (not loopable).
- The rewrite of `tests/README.md` and the splitting playbook, which Track 3 unblocks.
