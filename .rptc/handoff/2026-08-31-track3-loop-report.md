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

## Your decisions in the morning

- Merge `loop/2026-08-30-track3-convergence` into develop?
- PL-22 — what the 59% mutation score means for policy (not loopable).
- The rewrite of `tests/README.md` and the splitting playbook, which Track 3 unblocks.
