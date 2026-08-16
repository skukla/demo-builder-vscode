# A refused API subscription arrives as HTTP 200 and is treated as success

**Filed:** 2026-08-16, found while running
`.rptc/plans/data-installer-credential-broker/step-05.md`.
**Shipped defect.** Not urgent — the path it breaks is the minority one since the
credential broker landed — but silent, and the symptom appears far from the cause.

## What happens

`adobeEntityFetcher.subscribeOAuthServerToServerIntegrationToServices` is
`Promise<void>` and **discards the SDK response**:

```ts
await client.subscribeOAuthServerToServerIntegrationToServices(orgId, idIntegration, serviceInfo);
```

Adobe reports a refused subscription as **HTTP 200 with the failure in the body**.
Measured against an org with no ACCS product profile:

```json
{ "error": ["ACCS-REST-API"],
  "errorDetails": [{ "sdkCode": "ACCS-REST-API", "domain": "JIL", "code": 400,
                     "message": "Service ACCS-REST-API requires selection of a product" }] }
```

So the call "succeeds". `provisionAccsCredentials` logs `subscribing ACCS-REST-API`,
reads the pair out of the workspace download, and returns `ok: true` — handing the
user a credential whose scopes are still `AdobeID,openid`.

## Why it matters

**The subscription IS the entitlement** — it is what moves scopes to
`commerce.accs` + `additional_info.*`. Without it the credential cannot reach any
instance, and the only symptom is a Data Installer pre-flight **400** minutes later
with nothing connecting it back to the subscribe step. The docstring on
`accsCredentialProvisioner` already states the subscribe is load-bearing; nothing
checks that it happened.

## Fix

Return the response body and treat a non-empty `error`/`errorDetails` as a failure,
surfacing the service's own message (`"requires selection of a product"` is
actionable; "provisioning failed" is not). Both callers —
`provisionAccsCredentials` and `apiSubscriber` — currently assume no news is good
news.

**Test it with the shape above**, not with a rejected promise: a fixture that
throws would pass against the broken code and prove nothing.

## Scope note

`subscribeAdobeIdIntegrationToServices` is the same shape and should be checked at
the same time; it was not exercised by this probe.
