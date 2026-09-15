# ADR-023: Error handling — translate at the boundary, and let errors live with their domain

**Status**: Accepted (owner-ratified 2026-09-11)

**Date**: 2026-09-11

---

## Context

Twenty-two decision records existed and none was about errors. That is not a filing
gap — it is the reason a whole errors module was built, abandoned, and left in place
without anyone noticing.

Measured 2026-09-10 and 2026-09-11, before any of this was decided:

| | |
|---|---|
| Throws going through the central hierarchy | **4**, in the entire codebase |
| Plain `throw new Error(...)` | 354 |
| Central domain errors never thrown OR caught by anything | 3 of 6 — while a documentation page listed all three as live |
| Sites handing an SC a caught error's own message | 67 |
| Call sites of the classifier that showed its output to a person | 9 of 18 |

The errors people actually use are defined beside the code that throws them:
`DaLiveAuthError` thrown in 6 files and caught in 10, `DataInstallerApiError` 9 and 4,
`ToolManagerError` 9 and 1. A rule telling everyone to use the central classes would
have been a policy with 354 counter-examples.

## Decision

Four parts. They were decided together because each one falls over without the others.

### 1. A failure a PERSON reads is translated, never the library's own words

`Request failed with status code 403` names a transport detail and leaves an SC guessing
which permission, which account, which site. Translated means a per-provider formatter
(three exist), a domain error's own message, or an honest generic — "Could not reach
Adobe Console. See Debug Logs for details." The raw text still goes to the Debug Logs.

67 sites predate this and are ledgered shrink-only. A rule arriving as 67 build failures
is a rule people switch off.

**The rule is about WHOSE words reach the person, and that is not decidable at the call
site** — it depends on what threw. `componentUpdater` passes its caught message straight
through and is right to: everything reaching it was thrown by this extension with a
deliberate sentence like "Build failed (exit 1): tsc: 3 errors". A generic was
substituted there during implementation and six tests caught it within a minute. So the
enforcer detects the SHAPE, and a person judges each site when they retire its row.

### 2. Message text decides RETRIES, and nothing else

The two uses of message matching have opposite tolerances for being wrong. "Should I
retry?" — a bad guess costs one retry. "What do we tell the person?" — a bad guess tells
someone the wrong thing to do.

This repo had already made that judgement once and then half-unmade it: a generic
FORMATTER was tried and removed because "a shared one has to guess which provider
produced a string", while a generic CLASSIFIER doing exactly that guessing survived.
Any failure whose text contained `unauthorized` became an auth error and told a person
to sign in — including when the real cause was a missing permission, where signing in
changes nothing and they would do it again.

`classifyTransience()` answers only the retry question and returns a shape with nothing
displayable on it, so the compiler refuses the other use rather than a reviewer having
to notice it.

### 3. A domain error lives with the domain that throws it

`src/core/errors/` held the hierarchy and is now 169 lines holding no classes at all.
What survives is `FailureShape`: the four fields a failure carries across a boundary —
a code for branching, a sentence for the SC, the technical detail for the logs, and
whether offering Retry is honest.

**A domain error implements that interface where it is thrown. Nothing inherits.**
`TimeoutError` lives beside `withTimeout`; `AdobeOrgMismatchError` lives in the
authentication feature.

The strongest argument for keeping the decomposition is that the MCP specification
arrived at the same one independently: a message for the model to act on, kept distinct
from the transport detail underneath. Two audiences want different fields from one
failure, which is why it is an envelope and not a string.

### 4. A failed tool call is reported as a FAILURE

An MCP tool that fails returns a result carrying `isError: true`, never a successful
result whose text says it failed. The protocol defines two error mechanisms and asks
clients to treat them differently; tool execution errors "contain actionable feedback
that language models can use".

That flag was set nowhere. Every failure came back as a *successful* result whose text
happened to say otherwise, so no client could tell them apart and the agent lost its
best recovery path — silently, for as long as the surface has existed.

The subtlety: only the TOP-LEVEL result counts. A cancellation is a success carrying a
failure inside it — a handler that ran correctly and is reporting that the user backed
out. Marking that as a failure would tell an agent to retry something a person just
declined.

## Options considered

**A. Result type everywhere — no throwing across any boundary.** Rejected: 354 throw
sites, and the boundary where it matters already returns results.

**B. Convert all 345 raw throws to typed errors.** Rejected: it treats the symptom.
Most of those throws are fine; what was wrong was what crossed the boundary.

**C. Re-adopt the central hierarchy — make everything an `AppError`.** Rejected, and
this is the one worth recording. It was tried; it lost. Four throws after months of
availability is not an adoption problem to push harder on, it is an answer. Errors are
most useful carrying domain knowledge, and domain knowledge does not live in `core/`.

**D. Boundary translation.** Adopted — the decision above.

## Consequences

**Accepted knowingly:** a feature-local error is invisible to other features by design,
so a caller that wants to branch on one must import it from the feature that defines
it. That is the same trade ADR-022 already accepts for every other symbol.

**The enforcers cannot judge the interesting half.** Whether a message is ours or a
library's needs a person. The checks hold the line and the ledgers record who looked.

**A control broke when the ratchet reached zero.** The central-classes check asserted
`count > 0` to prove it was still reading the file — a control that depends on a
violation existing. That has now happened three times in `tests/sop/`. Controls here
should be anchored on something that stays true when the corpus is clean.

## Enforced by

| Part | Enforcer |
|---|---|
| Translate at the boundary | `tests/sop/user-facing-errors.test.ts` + its shrink-only ledger |
| Errors live with their domain | the `coreErrorClasses` ratchet in `tests/sop/architecture-rules.test.ts`, pinned at 0 |
| Failed tool calls report failure | `tests/features/ai/server/toolFailureEnvelope.test.ts` |

Each of those conventions carries a proof in `scripts/convention-proofs.mjs` — a planted
violation that the named enforcer must reject at the named assertion.

## Reference notes

- `AppError`, `TimeoutError`, `NetworkError`, `AuthError`, `toAppError` — the retired
  central hierarchy. Named here as history; they were deleted on 2026-09-11 and are
  correctly absent from the repository.
