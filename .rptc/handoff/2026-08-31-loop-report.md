# Loop report — 2026-08-31, Track 4

Branch `loop/2026-08-31-track4`, pushed. Everything below is gated: 1200 suites,
15534 tests green at every commit.

## The short version

The bug I recommended starting with was already fixed three days ago — I had read
the item's title and not its body. Correcting that record turned up three more
items claiming "not started" over work that had happened.

The real work was Track 4, the last open track of the four-track programme: the
architecture exemption ledger, which holds every file that breaks a rule the
codebase now enforces. **It went from 30 rows to 19.** The rules those files break
are real, and each row now either has no file left to name, or carries a
measurement saying what it would actually take.

Two of the eleven cleared were not what their ledger entries claimed, and finding
that out was most of the work.

## Shipped

| Rows | What |
|---|---|
| 1 | `ProgressUnifier` — core's progress engine named a prerequisites type. The type moved to shared vocabulary |
| 2 | `ResetAllCommand`, `ResetAiOnboardingCommand` — filed under `core/`, always commands. Moved |
| 4 | Feature barrels retired — `data-installer`, `sidebar`, `eds`, `ai` |
| 3 | Types files that only needed type-only imports — `handlers.ts`, `state.ts`, `webview.ts` |
| 1 | `DiagnosticsCommand` converged to `BaseCommand`, removing four service-locator fetches |

Two findings inside that work worth keeping:

**The `eds` barrel had 41 export lines and five were ever imported.** It was
hiding 36 lines of surface nobody used.

**Six test mocks pointed at the deleted barrels and the compiler saw none of
them.** `tsc --noEmit` passed clean while seven suites could not load. The
standing warning in this repo — a hand-written mock is invisible to the compiler
and to the callers — demonstrated again.

## Your decisions

Six things I stopped on rather than force. Each has a recommendation.

### 1. AB-7 — live proof of the integration-removal fix
The code shipped 2026-08-28 (`2b5be4ce0`) with its own test suite. Proving it
actually undeploys needs a working Adobe Console and a real project, which the
loop will not touch. Blocked on 2026-08-28 by a Console outage that only
manifested from inside the extension host.
**Recommendation:** retry it on the next real add/remove. If it still fails only
from the host, the next probe is logging the exact request the SDK sends and
diffing it against the working outside call.

### 2. `serviceLocator` names two classes — ratify or rebuild
It imports `AuthenticationService` and `SidebarProvider` as types only. The
ledger said to fix it by moving the interfaces to `@/types`; **they are classes,
not interfaces**, and `AuthenticationService` has 44 public methods across 855
lines. An interface copy nothing keeps in sync is worse than the import. Nor is
converting callers the answer — all 48 are files the rule explicitly permits to
fetch.
Real options: ratify, or move to typed tokens (`ServiceLocator.get(AUTH)`, token
declared by the owning feature) which removes the naming but rewrites the DI
shape and 50+ call sites.
**Recommendation: ratify.** A locator has to name what it locates.

### 3. `errors.ts` and `shell.ts` are not types files
Measured by converting every import to type-only and reading tsc: 17 errors and 1
respectively, all "cannot be used as a value". `errors.ts` declares error classes
and the functions that build them; `shell.ts` uses `os`. They are runtime modules
that happen to live in `src/types/`.
**Recommendation:** move `errors.ts` to `@/core/errors`; decide `shell.ts` on
sight — it may be one function away from being pure.

### 4. `typeGuards.ts` — the strongest ratify candidate
Genuinely runtime: needs six values including `COMPONENT_IDS` and
`getMeshAppBuilderComponent`.
**Recommendation: ratify.** A type guard is the one kind of runtime code that
belongs beside the types it narrows.

### 5. PR-1 — status left alone deliberately
Its research and your direction shipped, but whether that makes it `planned` is a
judgement about intent, not a fact I can read off disk. Everything else in that
sweep I corrected.

### 6. A flaky test, found not fixed
`inExtensionMcpServer.test.ts` → "reports the build label when one is supplied"
timed out once in a full-suite run, passed 3/3 alone, and passed with my changes
stashed. It is a socket-binding race the suite's own comment says it "makes
visible" rather than fixes. Unrelated to this work; worth its own item if it
recurs.

## What is left in the ledger — 19 rows

- **`constructionBoundary` (10)** — the biggest remaining bucket. Six are the same
  shape: a service constructing its own `GitHubTokenService` instead of asking the
  cache whose instance carries a token-validation cache. That looks like one batch,
  not ten decisions.
- **`layerDirection` (4)** — `serviceLocator` (decision 2 above) plus three real
  runtime crossings in `core/state` reaching into a feature's config.
- **`typesPurity` (3)** — decisions 3 and 4 above.
- **`featureBarrels` (1)** — `authentication`, the largest: 7 source importers, 15
  export lines, and 16 test files with a bare automock of the barrel. Started and
  parked; the automocks want the dead-mock probe rather than mechanical repointing.
- **`commandBase` (1)** — `CommandManager`, now RATIFIED rather than pending. It
  builds all 25 commands so it cannot be one of them. Not debt.

## Record corrections made

- `AB-7` backlog → built
- `AB-2` backlog → spiked (feasibility settled 2026-08-27, build not decided)
- `EDS-6` backlog → gated, with `waiting-on` naming both blockers
- `PL-13`'s prose said 75 ledger rows and 23 fetch-boundary files; the disk said
  30 and 0
