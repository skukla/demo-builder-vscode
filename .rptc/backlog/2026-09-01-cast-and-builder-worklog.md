---
id: PL-34
kind: chore
area: platform
needs: []
value: high
status: active
---

# Every open finding from the 2026-09-01 toolchain day, in one list

One work log, so nothing from that session survives only in a commit message. Each
row states what is true, what it costs, and how it is verified. Ordered by ratio of
value to risk, which is the order to work them in.

The method for all of it is [toolchain.md](../../docs/development/toolchain.md) and
the `ask-the-tool` skill: survey on the syntax tree, transform on the syntax tree,
let `tsc` say which sites were load-bearing, let the suite say which survived
behaviourally, read only the residue. Harness: `scripts/codemod/project.mjs`.

## A — mechanical, unblocked, do first

**A1. Teach the codemod to use a builder for MEMBERS, not just the outer object.**
41 of the 85 HandlerContext conversion failures are members whose type ALREADY has a
canonical fake: `globalState` 12, `StateManager` 12, `ExtensionContext` 9, `Project`
5, `Logger` 3. The codemod hands the raw literal to `createMockHandlerContext`, whose
overrides are typed, so a partial member is rejected. Replacing the member with its
builder first should clear all 41. No new fake needed; this is a codemod change.

**A2. Two unnecessary type assertions in `tests/sop/canonical-fakes.test.ts`**, lines
394 and 405, found by the type-aware config. Real, small, and in an enforcer — worth
fixing precisely because that file is a backstop.

**A3. Run the type-aware config over the whole test tree.** It found 36 unnecessary
assertions in ONE feature directory. The repo-wide number is unknown. NOT with a
blanket `--fix`: on `requireMock('vscode') as {...}` the rule is technically right
and its fix is a regression, because the assertion is the only type information in
the expression. Review the diff.

## B — needs a new builder, ranked by what it unblocks

The compiler produced this ordering; it was not argued for.

| Builder | Failures it unblocks | Notes |
|---|---|---|
| `SecretStorage` | 21 | the largest single blocker |
| `AuthenticationService` | 16 | second |
| `WebviewPanel` | 5 | small |
| `TokenManager` | 2 | smallest |

Writing the first two clears roughly 37 of the 44 that need something new. Each
belongs in `tests/helpers/`, typed to the real interface so it stops compiling when
that interface grows — the rule the existing builders already follow.

## C — the cast families, with honest numbers

Two different measurements, and conflating them is what produced an overstated
report once already:

| Family | brace-anchored (the ceiling) | every `as T` (AST) |
|---|---|---|
| `Project` | 150 | — |
| `HandlerContext` | 38 | 100 |
| `Partial<Project>` | 38 | — |
| `vscode.ExtensionContext` | 6 | 0 above the ceiling |
| `Logger` | 0 (banned) | **98** |
| `StateManager` | 0 (banned) | **63** |
| `CommandExecutor` | 0 (banned) | **9** |

**C1. `Project` at 150 is BLOCKED on judgement, not tooling.** The builder supplies
rich defaults and several suites assert on ABSENCE; substituting would silently
change what they check. No tool resolves that. Do not batch it.

**C2. The 6 remaining `vscode.ExtensionContext`** are residue both oracles rejected —
their literals carry a stateful `globalState` or a path an assertion reads back. Six
is a reading job, not a codemod.

**C3. The 12 HandlerContext casts the codemod skipped** cast an identifier or a call
result, not an object literal. Nothing to hand a builder; each needs reading.

**C4. `as any` 1,065 and `as never` 533.** The big number. `as never` came down from
748 by a text-based pass that also corrupted a detector's control fixtures — do not
repeat that method. Survey by POSITION first: an ARGUMENT cast is a silenced type
error (four production defects here hid behind exactly that) and gets read; a
DECLARATION cast is usually a fake and is batchable.

## Where the mechanical seam ENDS — measured 2026-09-01

Four passes of the codemod, each adding a transformation and each measured:

| pass | type errors | files failing |
|---|---|---|
| outer literal only | 100 | 51 |
| + logger/stateManager/context/authManager members | 71 | 42 |
| + secrets/globalState, converted recursively | 51 | 33 |
| + WebviewPanel builder, + ternary members | 46 | 32 |

The last pass converted **2 more files**. That is the seam ending, and it is worth
stating plainly rather than grinding: the remaining ~32 are a READING job, not a
codemod job.

What is left, and why each resists automation:

- **~16 partial `Project` inside a mock resolution.** The cause is a helper whose
  parameter is typed `unknown` — `makeCtx(project: unknown)` — so
  `jest.fn(async () => project)` yields `Promise<unknown>`. Fixing it means deciding
  what that parameter SHOULD be, per file, and then whatever the callers pass has to
  satisfy it. No tool holds that decision.
- **ExtensionContext 4, AuthenticationService 4, TokenManager 3, misc.** A long tail
  with a different reason each.

`TokenManager` is deliberately NOT getting a builder: 3 failures does not justify
another 40-method fake, and writing one to make a number move is the failure mode
these builders exist to prevent.

## Debt this work CREATED, recorded rather than left

Converting a cast to a builder call makes files longer. Four crossed the 500-line
warning threshold on this branch (the block is 750, so none is near failing):

| file | before | after |
|---|---|---|
| `tests/sop/canonical-fakes.test.ts` | 476 | 560 |
| `tests/features/ai/server/cloudResourceTools.test.ts` | 467 | 545 |
| `tests/features/eds/services/reset/edsResetUI-sampleData.test.ts` | 500 | 517 |
| `tests/features/ai/server/toolDescriptors.test.ts` | 390 | 515 |

`canonical-fakes.test.ts` is the one to watch: it is an ENFORCER and most of its
growth is mine — the ban list, the AST-total note, `readOrEmpty`. An enforcer that
keeps growing is a candidate for splitting by rule, which the splitting playbook
covers.

Also pre-existing and NOT from this work: one `import/order` warning in
`src/core/state/apiOwners.ts`, a file no commit on this branch touches.

## Open: TWO suites flaked under a full parallel run, 2026-09-01

Both passed alone immediately after, and the next full gate was green. Recorded as
observations, not diagnoses — this repo's rule is that a proposed cause needs a
command that would falsify it, and neither has one yet.

**RESOLVED 2026-09-01 — it was not the binding race, and it was not slowness.**

The failing test is `inExtensionMcpServer.socketOwnership.test.ts` › "leaves the
successor reachable when disposal interleaves with the successor bind". The failure
is a jest TIMEOUT of the whole test at 10s, not a failed assertion.

The starvation reading was tested and falsified: under full CPU saturation (32
spinners on 16 cores) the test body went 381ms -> 645ms, under 2x, because its waits
are wall-clock `setTimeout`s that do not stretch when the CPU is busy. Nothing was
slow; something was HANGING.

The hang was in the TEST HELPER. `SocketRpc` in `inExtensionMcpServer.testUtils.ts`
listened for `data` and nothing else, so a peer that accepted the connection and then
closed WITHOUT replying left its promise in `pending` unsettled forever. The reload
race this suite exists to exercise produces exactly that: a client connects to the
outgoing server, writes `initialize`, and the outgoing server is disposed before it
answers. The gate mock was ruled out on the way — it gates `fs/promises.stat`, and
production no longer calls it, so it never fires.

`SocketRpc` now rejects every in-flight request on socket close or error, and bounds
each request at 4s (below jest's 10s, so the RPC names the failure before jest can
only name the test). `socketRpc.failure.test.ts` pins it, with a negative control:
disable the close handler and that test fails.

This does not make a failing thing pass. It converts an unbounded wait into a named
error, so a genuine reload-race strand now reports "socket closed with 1 request in
flight" instead of a mystery timeout.

**`tests/hooks/router.test.ts`** — see below.

A flaky enforcer is worse than a failing one: it teaches people to re-run. If either
recurs, that is the second data point and worth chasing properly — starting with
whether they share a cause (both are suites that bind or write outside their own
process).

## Open, unreproduced: `tests/hooks/router.test.ts` flaked once

Observed 2026-09-01 during a full `npm run gate`: five failures, all in the
once-per-session rules (`adobe-docs` x2, `reuse-first`, `webview-test`, and the
reachability case for `adobe-docs`). Each expected exit 2 and got 0 — the router
exiting early, which means either the pre-filter did not match or the session marker
already existed.

NOT caused by the change in flight. Reverting the router token and re-running gave
69/69; restoring it gave 69/69; the next full gate was green. So it is an interaction
under parallel execution, not a regression.

What is already ruled out: `fresh()` returns `router-test-<pid>-<n>`, unique per
worker and per call, and markers are keyed on it at
`${TMPDIR}/.dbv-<rule>-<session>`. So a plain marker collision does not explain it.

Deliberately NOT diagnosed further. One observation, no reproduction, and this repo's
own rule is that a proposed cause needs a command that would falsify it — I do not
have one. Recorded so the next occurrence is the SECOND data point rather than
another first.

A flaky enforcer is worse than a failing one: it teaches people to re-run.

## The mechanical work is FINISHED — 2026-09-01

Every syntactic position swept, both types. 1,816 -> 1,275. The last retry of the
compiler-verified pass kept ZERO files: each remaining cast sits in a file that fails
for some other reason. There is no seam left to work in bulk.

## What replaces it: `reports/loadbearing-casts.md`

Generated by `scripts/codemod/loadbearing-worklist.mjs`, which strips all 1,264
remaining casts in memory, asks the compiler ONCE, records what it says, and restores
— the working tree is never left modified.

**1,324 errors across 253 files.** Every one is a place where a cast is holding back a
real type error, ranked by count. That is a different artifact from "1,275 casts": it
is sorted, it carries the compiler's own explanation per line, and it can be worked
incrementally by a person.

WHAT THE DISAGREEMENTS ACTUALLY ARE, which says how to work them:

| kind | count | what it means |
|---|---|---|
| fake is missing members the type requires | 100 | the fake is too small — use or write a canonical builder |
| argument type mismatch | 99 | the test passes a shape the callee refuses — **the defect shape** |
| assignment type mismatch | 62 | same, at a binding |
| a member the fake DOES NOT HAVE | 41 | the test reaches for something its own fake lacks |
| fake INVENTS a member | 17 | a member that exists on NOTHING — pure fiction |

The 17 invented members are the highest-value rows in the whole programme: a member
that exists on no real type is a test asserting against something that cannot happen.
Five such were found earlier by hand on StateManager, four on Logger. These are the
rest, found mechanically.

The 100 "missing members" rows are the builder programme continuing, and they are
mechanical once the right builder exists — which is what makes PL-16's ranked build
order still the right next move.

Top files: `deleteAdobeProjectHandler.test.ts` (56), `dashboardHandlers.test.ts` (34),
`appBuilderComponentRunner.test.ts` (31).

## Done when

Section A is empty, section B has the two large builders, and section C carries only
the rows that genuinely need a person — each of those stating why. The ceilings and
`astTotals` in `canonical-fakes.ledger.json` are re-pinned in the same commit as any
conversion, which the enforcer requires anyway.

## What to be careful of

- **Re-pin from the ENFORCER's count, never your own.** A recount by regex said the
  HandlerContext ceiling should RISE to 74; the enforcer said 38. The regex was
  matching the type name inside longer type names.
- **Never run a converter over `tests/helpers/` or `tests/sop/`.** The harness
  refuses, and the reason is that a converter in the builders' home rewrites a
  builder into a call to itself — twice here, a hundred suites down each time.
- **Restore along the import graph.** A stripped shared helper reports errors in its
  CONSUMERS, so restoring only the files named in the errors never converges.
- **Save the compiler's raw output.** A script that computes a verdict and discards
  the evidence cannot be debugged; one reported 1 broken file when 115 were.

## Provenance

- 2026-09-01 session. Corrections already applied and needing no further work: the
  cast bans were reported as broader than they are (renamed and both numbers now
  recorded); eight unguarded corpus reads raced against a probe file (all fixed);
  `--stdin` linting is a dead end (eslint ignores the piped content — recorded in
  `tests/sop/eslint-type-aware.test.ts`).

## Shipped so far

- 2026-09-01  test(helpers): the two builders the compiler asked for, and a check that a fake mirrors its subject (`737b13f30`)
- 2026-09-01  docs(backlog): PL-34 — every open finding from the toolchain day, in one list (`0247cdf43`)
- 2026-09-01  refactor(tests): the codemod converts MEMBERS too — HandlerContext 38 -> 29 (`ddbd91347`)
- 2026-09-01  refactor(tests): HandlerContext 29 -> 13, and most of the "reading work" was my own bug (`fe45c5d38`)
- 2026-09-01  test(helpers): a WebviewPanel fake and ternary members — and the mechanical seam ends here (`6859d5589`)
- 2026-09-01  docs(backlog): correct the warning count, and record the debt this work created (`5332f4acd`)
- 2026-09-01  refactor(tests): declaration-position `as any` — 1,065 to 1,000, and the yield is the finding (`4ae1bc20d`)
- 2026-09-01  refactor(tests): declaration-position `as never` — 84% of them were load-bearing (`632df89d1`)
- 2026-09-01  refactor(tests): 167 unnecessary assertions removed — and the filter built to prevent a regression caused one (`7ce4764cf`)
- 2026-09-01  refactor(tests): argument-position `as any` 1,000 -> 852, and I had been avoiding the wrong thing (`7e77c174a`)
- 2026-09-01  test: delete 41 tests that exercise no production code at all (`73cca5391`)
- 2026-09-01  feat(codemod): the mechanical cast work is finished — here is what replaces it (`2c5395e83`)
- 2026-09-01  refactor(tests): every remaining cast position swept — 1,328 to 1,275 (`30373a340`)
- 2026-09-01  refactor(tests): argument-position `as never` — low yield, and the failures are the finding (`9d5c7944f`)
- 2026-09-01  refactor(ui): one way to declare a component — React.FC is gone, and banned (`8a8aad8c7`)
- 2026-09-01  test(sop): production erases no types — banned in src/, with the allowed forms written down (`23ae66761`)
- 2026-09-01  test: delete 20 mocks of methods that do not exist (`8456e2261`)
- 2026-09-01  test(app-builder): type the shared deps builder, and four suites start being checked (`84359985d`)
- 2026-09-01  fix(tests): the socket flake was a HANG in the test client, not a slow machine (`6a3451aa6`)
- 2026-09-01  test: four more files to zero casts — and one assertion that pinned an impossible shape (`e40eecafa`)
- 2026-09-01  test: three more worklist files — one `unknown`, one gratuitous cast, one named seam (`fc9290045`)
- 2026-09-01  test(sidebar): a hand-rolled ExtensionContext, and one named seam for twenty reaches (`fc1a72dc2`)
- 2026-09-01  refactor(app-builder): the runner needs two methods, so it now asks for two (`d21372ae2`)
- 2026-09-01  test(dashboard): delete a hand-written context type, and 45 casts go with it (`8130c1fe0`)
- 2026-09-01  test(auth): remove one `as any` and the compiler finds an untested failure path (`4b089462b`)
- 2026-09-01  fix(helpers): the canonical Project fixture invented three fields, and its own cast hid them (`eebcd28ac`)
- 2026-09-01  test(project): the Project sweep, and the warning about it was overstated (`105cd2925`)
- 2026-09-01  test: sweep AuthenticationService and WebviewPanel — the safe types are done (`c6e78eb06`)
- 2026-09-01  test: sweep Logger and StateManager — and one mistake the suite caught, not the compiler (`cb5375a2a`)
- 2026-09-01  test: sweep by TYPE, not by file — SecretStorage and ExtensionContext (`887422cd1`)
- 2026-09-01  test(eds): the GitHub file-ops family — 31 casts become one, and a fourth builder gets used (`478b3a318`)
- 2026-09-01  test: two more families — one cast in a helper replaces 42 at the call sites (`d698c5bb8`)
- 2026-09-01  test(dashboard): route three handler contexts to the builder — and I was wrong about absence (`acfa19a48`)
- 2026-09-01  test(sop): an enforcer caught me duplicating an extraction — so it got extracted (`f4cbcb552`)
- 2026-09-01  test(mcp): the mutation pilot found an unconstrained field, hours after being repaired (`90ed1cb67`)
- 2026-09-01  test(auth): the same impossible-input test, in the sibling handler (`275af509f`)
- 2026-09-01  fix(mutation): the effectiveness instrument was unusable — 12GB of its own leftovers (`5abbfe897`)
- 2026-09-02  test(prerequisites): which Node versions a tool installs for when nothing requires one (`67ff4a87c`)
- 2026-09-02  test(prerequisites): whether a per-Node install succeeded — 6 mutants, and 3 tests I deleted (`3cc4caddd`)
- 2026-09-02  fix(mutation): the focus run had no ratchet — the loop would have worked without a net (`ce90ccec4`)
- 2026-09-02  feat(mutation): a 3-minute measurement and a worklist, so this can be worked in a loop (`9c7424d90`)
- 2026-09-02  test(prerequisites): the first four unconstrained decisions, and why they were untestable (`d89c1ec8a`)
- 2026-09-02  docs(research): what Stryker offers that we are not using — and what the score is for (`a269f2ca6`)
- 2026-09-02  test: name what the casts were hiding — and the compiler corrected three of MY shapes (`9a5b895a2`)
- 2026-09-01  test(helpers): a coded-error type, and the DebugLogger confusion caught a third time (`723b9d09d`)
- 2026-09-01  test: work the 5+ band by asking the compiler, and a DebugLogger fake it demanded (`3dd5b0b05`)
- 2026-09-01  test(helpers): command internals become canonical — and the generic buys back what `as any` gave away (`f7939dceb`)
- 2026-09-01  test: four more files, and a scanner that could not survive its neighbours (`8ff774a85`)
- 2026-09-01  test(helpers): the mocked-vscode views become canonical — 33 casts across 10 files (`e449e0e76`)
- 2026-09-01  test: three families cleared — 56 casts, and most of them were never load-bearing (`8d44aa414`)
- 2026-09-02  test(prerequisites): how many steps the progress bar counts, and five fixtures that lied (`29cb30c10`)
- 2026-09-02  test(prerequisites): the payload the prerequisites row is drawn from (`b42c9856b`)
- 2026-09-02  test(prerequisites): Node versions are ordered as numbers, not as text (`90c5f0aae`)
- 2026-09-02  test(prerequisites): which Node version a plugin lands on, and an id lookup with no config (`442153779`)
- 2026-09-02  test(prerequisites): the plugin branch no test had ever entered (`43ba54811`)
- 2026-09-02  feat(mutation): moving the measurement to the next module is one command (`c735dbe67`)
- 2026-09-02  test(ai): what the site tools tell an agent about whether they are safe to call (`b494de862`)
- 2026-09-02  test(ai): the site scan reads without writing, and the delete gate needs both halves (`4ca0a66df`)
- 2026-09-02  docs(handoff): the overnight loop report (`d63ceacf6`)
- 2026-09-02  test(eds): the DA.live token check, and what the sign-in boxes reject as you type (`53c8d26cc`)
