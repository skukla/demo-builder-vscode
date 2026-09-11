# What our error strategy should be

A proposal, for a decision. Researched 2026-09-11 by measuring the codebase rather
than reading its documentation, because the documentation turned out to describe a
module that had been abandoned.

**The brief was explicit: do not weight what already exists. Pick the best answer.**
Some of what follows keeps current practice and some deletes it, and each is argued
from evidence rather than from precedent.

---

## The recommendation, first

**Keep exceptions internally. Make the handler boundary the one place an error becomes
something a person reads. Never let a library's own words reach an SC.**

Four concrete changes:

1. **Split the two jobs that are currently one module.** "Is this worth retrying?" and
   "what do we tell the user?" are different questions with different tolerances for
   guessing. Today both run through `toAppError`.
2. **Ban a raw `Error.message` in a user-facing response.** This is the measurable
   defect: ~53 sites do it.
3. **Every feature gets a boundary translator**, not just the three noisy providers.
   Features without provider-specific knowledge get an honest generic message rather
   than a library string.
4. **Write the ADR.** There are 22 decision records and none covers errors, which is
   exactly how a whole error module got built, abandoned, and left half-alive for
   months without anything noticing.

What NOT to do, argued below: do not adopt a Result type everywhere, and do not
convert the 345 raw throws to typed errors. Both are large, and neither fixes what is
actually broken.

---

## What is actually there (measured, not assumed)

| | count |
|---|---|
| `catch` blocks | 664 (315 in services, 143 in handlers) |
| Failure responses built (`success: false`) | 457 (281 handlers, 163 services) |
| Raw `throw new Error(...)` | 345 (187 services, 43 handlers) |
| `instanceof` narrowing on an error | 216 |
| Error subclasses defined | 21 — 4 central, 17 beside their feature |
| `ErrorCode` uses | 201, across 47 files |

Two things this overturns:

**Typed errors are NOT unused.** The central hierarchy is, but 216 `instanceof`
narrowings and 17 feature-local classes say the practice is alive and load-bearing —
`DaLiveAuthError` alone is thrown 8 times and caught 11. An earlier reading of "four
throws in the central module" undersold this badly.

**`ErrorCode` is genuinely adopted.** 201 uses is not a vestige. It is what lets the UI
offer "Sign in" for one failure and "Retry" for another.

---

## What is actually wrong

### 1. Two-thirds of failures hand the user a developer string

~53 sites build a user-facing response as `error: (e as Error).message` or the
`instanceof Error ? … : …` variant. ~25 translate or type it first.

So an SC sees `Request failed with status code 403`, or `spawn aio ENOENT`. Your own
architecture doc states the bar — a formatter exists "turning
`Error: Request failed with status code 403` into something that says which permission
is missing and what to do about it. If the output is not more actionable than the
input, the formatter is not earning its place." Most failure paths never reach one.

**This is the defect worth fixing.** It is user-visible, it is measurable, and it has a
clear rule.

### 2. One module does two jobs with different tolerances for guessing

`toAppError()` classifies an unknown error by substring-matching its message:
`includes('timeout')`, `includes('econnrefused')`, `includes('unauthorized')`. It
returns an `AppError` carrying a `userMessage`.

Its 19 call sites are almost all RETRY decisions — `retryStrategyManager`,
`promiseUtils`, `isTimeout(toAppError(error))`. For that job, message-matching is
defensible: the alternative is no signal at all, and a wrong guess costs one retry.

For the other job it is not defensible, and the repo already knows this. The doc
records that a generic FORMATTER was tried and removed because "a shared one has to
guess which provider produced a string." A generic CLASSIFIER doing the same guessing
survived, and it hands back a `userMessage` — which invites exactly the use that was
rejected.

**They are two functions wearing one name.**

### 3. Nothing ratifies any of it

22 ADRs — dependencies, tests, webviews, CSS, barrel files, session accessors — and
none about errors. The policy lives in three places (`docs/architecture/
error-handling.md`, two handbook conventions, and the consistency-patterns SOP) and is
a decision of record in none.

### 4. A minority of services answer two different ways

20 of 262 service files both throw AND return `{ success: false }`. Not rampant, but a
caller cannot tell which to expect without reading the body.

---

## The options, and why this one

### A. Result type everywhere — no throwing across any boundary

Every fallible call returns `Result<T, E>`; nothing throws. Rust's model.

**Rejected.** It is the largest possible change — 345 throws and 664 catch blocks —
and TypeScript has no `?` operator, so every call site grows explicit unwrapping. It
would fight the language, the VS Code API (which throws), and every library. The
payoff is exhaustiveness the compiler can check; the price is rewriting the error path
of the entire extension to fix a problem that is actually "we show users raw strings".

### B. Convert all 345 raw throws to typed errors

**Rejected, and this is the tempting one.** Most raw throws are internal guards that
nobody branches on — `throw new Error('No handler registered for ...')`. Typing them
costs churn and buys nothing: a type earns its place only when a caller must
DISTINGUISH failures, which is what the existing 17 feature-local classes already do
where it matters. Typing the rest is ceremony.

### C. Re-adopt the central hierarchy — make everything an `AppError`

**Rejected.** It was tried; it lost. Four throws in the whole codebase after being
available for months is not an adoption problem to push harder on, it is an answer.
Errors are most useful when they carry domain knowledge, and domain knowledge does not
live in `core/`.

### D. Boundary translation — recommended

Keep throwing internally, because it is idiomatic and already works. Make the handler
boundary the single conversion point, and forbid raw strings crossing it.

- **Services throw.** A feature-local class where a caller must branch; a plain `Error`
  where the message is only going to be shown. No change to 345 sites.
- **Handlers translate, once.** The handler catches and produces the user-facing
  failure. This is where `success: false` is built already — 281 of 457 — so the
  boundary exists; what is missing is a rule about what may cross it.
- **Per-provider formatters stay, and gain a default.** Three exist for the genuinely
  noisy providers. Features without one currently fall through to the raw message;
  they should fall through to an honest generic instead ("Could not reach Adobe
  Console. See Debug Logs for details.") — less specific, never misleading.
- **`ErrorCode` stays and is set deliberately**, at the boundary, not inferred from
  message text.
- **`toAppError` is renamed to what it is** — a transience predicate for retry — and
  stops returning a `userMessage`. Its 19 call sites keep working; they only ever ask
  "is this a timeout / network blip?"
- **The four remaining central classes go**, once their last uses move. `AppError`'s
  SHAPE — code, userMessage, technical, recoverable — is the right envelope and should
  survive as the boundary type even though the class hierarchy under it should not.

### Why D and not "just keep going"

D is not ratification. It deletes a classifier's second job, deletes the remaining
central classes, adds a rule that ~53 sites currently violate, and requires a default
translator that does not exist. What it keeps — throwing, feature-local types,
per-provider formatters, `ErrorCode` — it keeps because the measurements say those
work, not because they are there.

---

## What it costs

| Step | Size | Risk |
|---|---|---|
| Ban raw `Error.message` in responses + enforcer with a ledger | ~53 sites, mechanical | Low. Each is a one-line change to a formatter call |
| Default translator per feature | ~10 features | Low |
| Split `toAppError` into a retry predicate | 19 call sites, all asking the same question | Low |
| Retire the 4 central classes | Small, after the above | Low |
| ADR-023 | Writing | None |

The 53-site change is the only bulk, and it is the one with user-visible payoff. Nothing
here requires touching the 345 throws or the 664 catches.

---

## What I need from you

1. **Is "never show an SC a library's own words" the rule?** Everything else follows
   from it. If you would rather ship the raw message than a vaguer honest one, D
   collapses and A is the only alternative worth discussing.
2. **Do the four central classes go?** They are barely used; retiring them is the
   "no soft deprecation" answer, but it is your call whether the hierarchy has a future.
3. **ADR-023 — yes?**

Nothing here has been implemented. This is a proposal.
