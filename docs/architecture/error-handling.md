# Error handling

One shape crosses the boundary, and three formatters turn provider noise into
something a human can act on.

## The shape

A handler **returns** its failure — it does not throw. `{ success: false, error }`,
where `error` is a sentence a user can read. Throwing breaks every caller branching
on `result.success`: they get a rejected promise where they expected an object, and
the UI shows nothing instead of the problem.

The full rule, including why cancellation is a *success* carrying a failure, is in
[consistency-patterns.md](../development/sop/consistency-patterns.md).

## Typed errors, for code that must branch

Use a type when something downstream must *distinguish* failures; use a message when it
only has to show one. `ErrorCode` is the programmatic companion — 201 uses across 47
files — and is what lets a UI offer "Sign in" for an auth failure and "Retry" for a
network one without matching on message text.

**A domain error class lives with the domain that throws it.** That is where the
practice actually is, measured 2026-09-10 across all 21 error classes in `src/`:

| | thrown | caught |
|---|---|---|
| `DaLiveAuthError` (`features/eds/services/types.ts`) | 8 | 11 |
| `DataInstallerApiError` (`features/data-installer/…`) | 9 | 4 |
| `ToolManagerError` (`features/eds/services/types.ts`) | 9 | 1 |
| `IoEventsApiError`, `HelixApiError`, `PushRejectedError`, … | 2–5 each | 1–6 each |

`src/core/errors/index.ts` is the **legacy central hierarchy**, and this section used to
describe it as the place errors live. It is not. It held `AppError` plus six domain
errors and accounted for **four throws in the entire codebase** against 354 plain
`throw new Error(...)`. Three of the six — `ValidationError`, `PrerequisiteError`,
`MeshError` — had never been thrown or caught anywhere, and were deleted on 2026-09-10;
this document had listed all three as part of the hierarchy, which is how a doc
describing another module goes wrong without anything failing.

What remains is what earns its place: `AppError` as a base worth catching, plus
`TimeoutError`, `NetworkError` and `AuthError`. The module may only shrink — a new
domain error goes beside the code that throws it.

## Three formatters, one per provider

| | For |
|---|---|
| `features/authentication/services/authenticationErrorFormatter.ts` | Adobe IMS and Console |
| `features/eds/services/errorFormatters.ts` | GitHub, DA.live, Helix |
| `features/mesh/utils/errorFormatter.ts` | `aio api-mesh` |

They are **deliberately not one generic formatter.** That was tried and removed: a
shared one has to guess which provider produced a string, and each provider's errors
need different knowledge to be intelligible — a GitHub push-protection rejection and
an IMS token expiry have nothing useful in common.

Adding a provider means adding a formatter beside its feature, not a branch in a
shared one.

## What a formatter is for

Turning `Error: Request failed with status code 403` into something that says which
permission is missing and what to do about it. If the output is not more actionable
than the input, the formatter is not earning its place.

## Conventions that bind this

The rules are in [the handbook](../development/handbook.md). Handlers return rather
than throw; errors never carry secrets into a log — redaction happens in
[`@/core/logging`](../../src/core/logging/README.md) before anything is written.
