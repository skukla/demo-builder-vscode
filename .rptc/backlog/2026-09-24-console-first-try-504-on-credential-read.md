---
id: AB-27
kind: fix
area: app-builder
parent: AB-9
needs: []
value: high
status: backlog
---

# The first add of an integration dies on a Console 504 that the second add gets past

Found 2026-09-24 by the owner adding "Northwind ERP" on `feature/erp-integration`: the add
reached "Getting Commerce access" and failed after 1m1s with

    Could not resolve the app's IMS credentials:
    [CoreConsoleAPISDK:ERROR_GET_INTEGRATION] 504 - Gateway Timeout ("upstream request timeout")

The retry a few minutes later went through, that step taking 22s. The owner's words: "it
CONCERNS me that every time we try to add an integration, we get this on each first try."

## What happens

Each integration gets its own workspace (AB-23), so every first add creates a FRESH
server-to-server credential and subscribes its APIs. Developer Console's upstream is slow
on that cold credential: the subscribe before the failing step 504s and is retried past
(`adobeOrgServices.ts`, the 2026-09-20 hardening), then the deploy-time credential read
that follows it (`adobeWorkspaceCredentials.ts` `getS2SDeployCredentials`: `getIntegration`
+ `getIntegrationSecrets`, after `getCredentials` in the ensure step) 504s too — and that
read had NO retry, so a slow first read became a failed add. The second add finds a warm
credential and none of this fires. Read from the Debug Logs of the failed and the
successful add, same session.

## The fix (this item)

One shared helper, `src/core/utils/transientRetry.ts` `withOneTransientRetry`: run the
call, and if `classifyTransience` says the failure is transient (timeout, network — never
auth), pause `TIMEOUTS.ORG_SERVICES_RETRY_DELAY` and run it once more. Extracted from
`adobeOrgServices.ts`, which now delegates to it (behaviour unchanged, its retry suite
untouched), and applied to the three credential READS in `adobeWorkspaceCredentials.ts`.
Never to the create: credential names are org-unique and a repeated create answers 409.
Pinned in `adobeWorkspaceCredentials.s2s.test.ts` (each read retried once, the list read
creating nothing, a refusal never retried) and `tests/core/utils/transientRetry.test.ts`.

## What it does not settle

- **Two 504s in a row still fail the add**, about two minutes in, with the same message.
  The 2s pause is the org-services one; nothing measured says how long a cold credential
  takes to warm. If a first add still fails after this, the Debug Logs will show the retry
  warning before the error — that is the signal to lengthen the pause or add a try, not to
  guess now.
- Not run live yet. The owner's next first add of an integration is the check.

Filed 2026-09-24.
