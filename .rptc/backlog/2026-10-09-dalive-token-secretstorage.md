---
id: EDS-35
kind: fix
area: eds
needs: []
value: med
status: built
---

# The DA.live access token sat in plaintext globalState

Filed 2026-10-09.

Every other credential the extension holds (the GitHub token, Commerce
credentials, integration secrets) is in `context.secrets`, VS Code's SecretStorage,
which the OS keychain protects. The DA.live access token was the exception:
`DaLiveAuthService` kept it in `context.globalState`, which VS Code stores as plain,
unencrypted data on disk, beside its expiry, the user's email and the org.

**Owner's decision (2026-10-09, "Yes"):** move the token into SecretStorage, with a
one-time migration so nobody signs in again. The mirror to `~/.aem/da-token.json`
(mode 0600) for Adobe's da-auth-helper and the agent's `da-auth` skill is deliberate
and stays.

## What changed

- The token is written to and read from SecretStorage under
  `demoBuilder.daLive.accessToken`. Only the token moved: expiry, email, org and
  `setupComplete` are not secrets and stay in globalState under `daLive.*`.
- `daLiveTokenMigration.ts` moves a token an older build left at globalState
  `daLive.accessToken`: write, read back, and only then delete the old copy (the
  sequence `commerceSecretMigration.ts` uses). A refused or unverified write leaves
  globalState untouched and the SC signed in from there; the next start retries.
- It runs on activation, in the upkeep chain right after the Commerce secret sweep,
  and on the service's first read. Reads, stores and sign-out all wait for it, so an
  old copy cannot land on top of a newer sign-in or survive a sign-out.
- Sign-out (`logout`, and `resetAll` through it) deletes the token from
  SecretStorage and any globalState copy.
- Adopting a token from `~/.aem/da-token.json` now writes it to SecretStorage.

## Not done here

- `src/extension.ts` constructs a second `DaLiveAuthService` at activation that is
  only ever disposed; every caller uses the cached one from `getDaLiveAuthService`.
  Harmless, but it is a duplicate instance worth deleting separately.
- No live check yet: after F5, confirm the SC stays signed in across a reload, that
  sign out then sign in works, and that the agent's `get_auth_status` still reports
  the DA.live session.

## Shipped so far

- 2026-10-09  fix(eds): keep the DA.live token in SecretStorage, not globalState (`2d5f8f496`)
- 2026-10-09  docs(backlog): EDS-35 built, logs its commit (`6bf22878c`)
