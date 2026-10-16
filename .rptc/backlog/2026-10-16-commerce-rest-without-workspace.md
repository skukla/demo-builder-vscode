---
id: AI-72
kind: fix
area: ai
needs: []
value: med
status: active
---

# The Commerce REST tools work on a project with no Adobe workspace

Filed 2026-10-16 while setting up the EDS-49 patch canary.

`read_commerce_rest` / `write_commerce_rest` sign every call with a server-to-server
credential taken from the project's Adobe workspace (`resolveRestTargetFor` in
`commerceRestClient.ts`). A storefront-only project (EDS + ACCS, no mesh, no App Builder
integration) has no Adobe project or workspace at all, so both tools refuse with "the
project has no Adobe org, project and workspace to take a credential from". Creating the
canary's test shopper hit exactly this on two projects: the canary itself, and My Commerce
Demo (org only). The shopper was made through the storefront's public sign-up instead.

**Measured 2026-10-16** against the CitiSignal ACCS sandbox, read-only
`GET V1/store/storeViews`:

| Authorization | `x-api-key` | Result |
|---|---|---|
| the SC's own Adobe sign-in (the `aio` CLI user token) | none | **200**, the store views |
| the same token | `aio-cli-console-auth` | 401 `ErrInvalidOauthToken` |
| none | none | 403 |

So the store's admin API accepts the SC's own sign-in, provided the request does NOT
also name a client id. The fix: when the project has no workspace credential, sign with
the SC's own token and send no `x-api-key` / `x-gw-ims-org-id`. A write then succeeds
or fails on the SC's own Commerce admin rights, and Commerce's answer is reported as is.

Not measured: a WRITE with the user token. The read proves the token is accepted; a
write could still be refused by role.

## What was built (2026-10-16)

`resolveRestTargetFor` signs with the SC's own token (`getTokenManager().inspectToken()`)
when the project has no Adobe org, project and workspace. `requestRest` sends
`x-api-key` / `x-gw-ims-org-id` only when a credential supplied them. A 401/403 on
such a call says the SC's own sign-in was refused, instead of naming the
ACCS-REST-API subscription. Both tool descriptions say which sign-in they use.
