---
id: EDS-60
kind: question
area: eds
needs: []
value: med
status: open
---

# Does a storefront update work on a machine with no git name or email?

Filed 2026-10-22, from the patch canary's first real update.

## What is true now

A template or Adobe boilerplate update merges in a local clone and commits there
(`src/features/updates/services/templateCheckout.ts:122`, "Could not commit the
template's changes."). The commit uses whatever git identity the machine has; the
extension sets none.

On 2026-10-22 the canary ran that same code on a GitHub runner with no identity and
stopped at the commit: "Author identity unknown ... fatal: empty ident name". Fixed
for the canary by setting one in its workflow (eds-demo-patches `3550b3c`). An SC's
machine was not looked at.

## The question

Would an SC with no `user.name` / `user.email` in git hit the same stop? On macOS
git usually works one out from the account's full name and the host name (with a
warning), so most likely not, but nothing has tested it, and a fresh account with no
full name, or a managed machine, may differ. The commit's author also lands in the
storefront's history, so a made-up `kukla@MacBook.local` address is visible there.

## Recommendation

Answer it by running the update with `GIT_CONFIG_GLOBAL=/dev/null` and an empty
`HOME`-level config in a test, then decide. If it can fail: give the commit an
identity of its own when the machine has none (the signed-in GitHub user's name and
noreply address, which the extension already reads), never write to the SC's global
git config.
