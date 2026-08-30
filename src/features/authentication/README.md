# Authentication

Adobe IMS sign-in, and everything that depends on knowing which org you are in.

## The org model is the whole feature

An IMS token is **identity-scoped, and bound to an org**. `aio`'s org / project /
workspace selection is a single process-global config with no per-command override.
Together those two facts drive almost every design decision here.

The canonical model — `ensureOrgContext`, `detectProjectOrgMismatch`, per-operation
`withOrgContext` targeting, and forced re-login as the recovery — is in
[adobe-org-context](../../../.claude/skills/adobe-org-context/SKILL.md).

**Read that before writing any org guard.** There is no in-app org picker and no
ad-hoc org comparison anywhere; both have been tried and removed.

## Deleting a Console project needs an order

`consoleProjectTeardown.ts` removes event registrations and third-party event
providers **before** deleting the project. Deleting first returns an opaque `409`
that names nothing, so the order is the fix, not a nicety.

It collects failures rather than throwing on the first one — a teardown that stops
halfway leaves the user with a project they can neither use nor remove.

## Why there is an SDK path and a CLI path

`createEntityServices` prefers the Adobe Console SDK and falls back to the `aio` CLI.
The SDK is far faster; the CLI works when the SDK does not.

The cost is a timeout trap: a call bounded at 10s for the SDK attempt then starts the
CLI, so the budget must cover **both**, not the fast path. That is why the wizard's
data messages are set to 180s — see
[`@/core/communication`](../../../src/core/communication/README.md).

## Caching

`AuthCacheManager` caches tokens and org/project lists with a TTL. `TokenManager`
validates and refreshes. A second `AuthenticationService` would fork that cache,
which is why exactly one is constructed, in `extension.ts`.

## Related

- [ADR-015](../../../docs/architecture/adr/015-dependency-architecture.md) — why the
  service is built once at the composition root

## Conventions that bind this

The rules are in [the handbook](../../../docs/development/handbook.md). Exactly one `AuthenticationService` is constructed, in `extension.ts` — a second would fork its token cache. Org guards go through `ensureOrgContext`, never an ad-hoc comparison.
