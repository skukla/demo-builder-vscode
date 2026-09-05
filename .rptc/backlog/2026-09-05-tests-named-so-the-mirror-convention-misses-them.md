---
id: PL-45
kind: fix
area: platform
needs: []
value: high
status: backlog
parent: PL-22
---

# Tests named so the mirror convention misses them

Filed 2026-09-05, from the PL-22 burn-down.

**44 test suites exercise a module that no measurement attributes to them, because their
FILENAME does not start with that module's stem.** 17 of those sit on modules that still
have open gaps, together holding 472 of them. The tests run and pass on every CI build;
they simply count towards nothing.

## MEASURED FOUR TIMES THE SAME DAY — raised to high on this evidence

Filed as a modest cleanup. Four modules met it within hours, and in each the rename ALONE
moved the number before a single test was written:

| Module | Open gaps before | After the rename alone | Recovered |
|---|---|---|---|
| `importHandlers.ts` | 151 | 62 | 59% |
| `dataInstallerWriteClient.ts` | 106 uncovered | 17 | 84% |
| `inExtensionMcpServer.ts` | 83 | 49 | 41% |
| `demoPackageLoader.ts` | 55 | — (closed to 97% with the moved suite) | — |

Between 41% and 84% of a module's apparent gap was tests that already existed, already ran
and already caught those mutants. **Some unknown share of the burn-down's remaining total
is not work, it is misfiling** — which makes this the cheapest item in the queue: seconds
per rename against roughly nine minutes per hundred gaps closed by writing tests.

**The survey below is a FLOOR, not a total.** `demoPackageLoader.ts` was found by a session,
not by the detector: its 297-line suite sat under `project-creation/ui/helpers/` and reached
the module through a re-export barrel. Rule 1 requires the mirror directory, so that whole
shape — right tests, wrong directory — is invisible to the numbers here.

**The per-module half is already shipped.** Every goal session now checks its own module
before measuring (`scripts/mutationQueue.mjs`, from a7fd3e73d). That is what found all four.
What remains is the sweep of modules the burn-down will not reach soon, and the modules
already at zero whose suites still count towards nothing.

**One caution learned the same day:** a session correctly DECLINED to rename three suites
around `readDescriptors.ts` because they are cross-cutting across four descriptor families,
not that module's own. Attributing them would have inflated one file and hidden three. The
check has to reject as well as accept.

## How it surfaced

A burn-down session working `dashboardHandlers.ts` noticed that
`selectProject-navigation.test.ts` tested `handleSelectProject` — a function defined in
`dashboardHandlers.ts` — and renamed it `dashboardHandlers-selectProjectNavigation.test.ts`
so its kills would count. That is one instance of a pattern nobody had looked for.

`suitesFor` in `scripts/focusModule.mjs` finds a module's suites by convention: inside
`tests/<the module's directory>`, any file whose name is the module's stem or begins with
that stem plus `-` or `.`. The convention is fine. What it cannot see is a suite named
after the FUNCTION it tests, or after the scenario, rather than the file.

## The measurement, and the two wrong answers before it

Detector: `scratchpad/orphans.py` (session-local; rewrite it against the tree rather than
trusting the numbers below, which are a snapshot).

A suite counts as uncounted only when ALL of these hold:

1. it lives in the mirror directory of the module it imports;
2. no module in that directory claims it under the stem rule;
3. it imports exactly one module from that directory, so the subject is unambiguous.

**Rule 1 is the one that matters, and leaving it out produced two wrong counts.** A first
pass said 132, counting every suite whose single `@/` import did not match its name — most
of which were importing a TYPE barrel (`@/types/base`), not a module. Excluding types gave
105, still wrong, because a suite that imports a module from ANOTHER feature is a client of
it, not a test of it: that pass flagged `configure-envFiles.test.ts` — written minutes
earlier to test `configure.ts` — as an uncounted test for `ComponentRegistryManager.ts`.
Requiring the mirror directory removes that whole class and gives 44.

Controlled both ways: the known-real case is detected under its old name and correctly NOT
detected under its new one; the two known false positives are excluded.

## Where the still-open ones are

| Module | Open gaps | Uncounted suites |
|---|---|---|
| `importHandlers.ts` | 151 | `brokeredCredentialOffer`, `importScopesHandler`, `importTargetHandler`, `provisionAccsHandler` |
| `dataInstallerWriteClient.ts` | 98 | `exportClient` |
| `inExtensionMcpServer.ts` | 83 | `strictWriteArgs`, `toolAnnotations`, `toolPhaseNarration`, `toolProgressNotifications` |
| `ImportDatapackModal.tsx` | 64 | `watchedActivation` |
| `projectStatusUtils.ts` | 61 | `deploymentSummary` |
| `dashboardHandlers.ts` | 9 | `dashboardHandlersMap`, `navigateBack`, `openIntegrations`, `refreshBlockLibrary`, `showProjectDashboard` |
| `quickEditPublisher.ts` | 6 | `quickEditAnchorMatch` |

Verified by hand: `importTargetHandler.test.ts` (15 tests) and `importScopesHandler.test.ts`
(5 tests) both import the handler map from `importHandlers` and drive it directly.

The remaining 27 are on modules already at zero. Renaming those changes no number and is
not worth doing on its own.

## What it is NOT

**Not a score-inflation trick.** A rename only counts tests that already exercise the
module; it cannot manufacture a kill. The gain is that work already done stops being
invisible.

**Not necessarily a rename.** Two other shapes are possible and should be weighed first:

- teach `suitesFor` to consider a suite's imports as well as its name. Note that
  `focusModule.mjs` records two import-based heuristics tried on 2026-09-03 and rejected —
  but those answered a different question (does this suite EXERCISE the module, used to
  refuse a config), so the precedent is a caution, not a verdict;
- leave the convention alone and accept that a scenario-named suite is not attributed.

Renaming is the cheapest and keeps one rule, at the cost of filenames that read less well.

## Why not now

The burn-down is running and these files are live in it. A rename during a batch invalidates
the incremental cache and rewrites paths a session may be holding — and while measuring
this, a rename in the live worktree crossed a file a session was writing. Do it between
runs, or after the burn-down.

**Whoever picks it up: re-measure first.** Four of the seven live modules are near the
front of the size-ordered queue, so some will be at zero before this is touched, and the
472 will be smaller.
