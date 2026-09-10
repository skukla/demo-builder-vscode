# Adobe setup

Signing in, and choosing the org / project / workspace a demo belongs to.

## The flow

`login()` opens a browser and waits. It does not poll a status endpoint — the `aio`
CLI owns the exchange, and the extension awaits its completion. A forced login clears
the caches **first**, because the CLI will clear its own console context and a stale
cache read afterwards would look like a successful sign-in to the wrong org.

Budget for it with `TIMEOUTS.AUTH.BROWSER`. A person has to switch to a browser,
possibly authenticate with an IdP, and switch back.

## Why there is no org picker

An IMS token is **bound to an org**, and `aio`'s selection is a single process-global
config. So "let the user pick an org" is not a dropdown — it is a re-authentication.

The extension therefore targets an org **per operation**, by building each child
process's environment, rather than mutating global `aio console` state. When a
project's org does not match the session's, the recovery is a forced login, not a
silent switch.

The full model — `ensureOrgContext`, `detectProjectOrgMismatch`, `withOrgContext`,
and the forced-login recovery — is in
[adobe-org-context](../../.claude/skills/adobe-org-context/SKILL.md). **Read it before
writing any org guard.** Ad-hoc org comparisons have been added and removed more than
once.

## SDK first, CLI second

Entity lookups try the Adobe Console SDK and fall back to the `aio` CLI. The SDK is
much faster; the CLI works when the SDK does not.

The trap is the timeout: a call bounds the SDK attempt and only then starts the CLI,
so the budget must cover **both**. Sizing for the fast path is what made the wizard's
data calls fail on work that would have finished.

## Conventions that bind this

The rules are in [the handbook](../development/handbook.md). Exactly one
`AuthenticationService` is constructed, at the composition root — a second would fork
its token cache. Time values come from `TIMEOUTS`, never a literal.

## Related

- [`src/features/authentication/README.md`](../../src/features/authentication/README.md)
  — the feature, including the Console-project teardown order
