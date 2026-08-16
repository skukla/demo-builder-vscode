# Step 05 — After ship: does a credential reach ACROSS Adobe orgs?

> ## ANSWERED 2026-08-16 — but not the way this step expected
>
> **The question cannot arise.** A credential in the SC org cannot be subscribed to
> `ACCS-REST-API` at all, so one capable of *attempting* cross-org reach cannot be
> created. The experiment below never got to its four legs.
>
> Measured in **Solution Led Commerce SC** (`3397333`), against an existing project
> there, with the CLI re-authenticated to that org:
>
> | Check | Result |
> |---|---|
> | S2S credential creation | **succeeds** — so this is not a permissions wall |
> | Subscribe with `licenseConfigs: null` | **HTTP 200** carrying `error: ["ACCS-REST-API"]`, `"Service ACCS-REST-API requires selection of a product"` |
>
> The same read against BOTH orgs isolates the single differing row:
>
> | | Adobe Demo System (`285361`) | Solution Led Commerce SC (`3397333`) |
> |---|---|---|
> | `ACCS-REST-API`, `adobeid` entry | enabled **true**, 0 products | enabled false, 0 products |
> | `ACCS-REST-API`, **`entp`** entry | enabled **true**, **1 product** | enabled false, **0 products** |
> | Control — a service disabled in the same org | `CommercePartnersSDK` false | — |
> | Control — services that DO offer products | 17 | 12 |
>
> Both controls are load-bearing. `enabled` is not uniformly true even in Demo
> System, so the SC org's `false` is a real difference and not an artifact of the
> read. And both orgs return non-empty product lists for other services, so the
> zero is specific to ACCS rather than a blanket empty response.
>
> **The `entp` entry is what carries the product profile**, and only Demo System
> has one — which is what `"requires selection of a product"` means literally.
> The missing thing is a row of licensing on the ORG. No Adobe I/O project or
> workspace configuration can substitute for it.
>
> Confirmed independently by the owner: ACCS instances live in Adobe Demo System;
> SCs use the SC org only for their integration I/O projects.
>
> **Also untested:** Demo System has exactly ONE ACCS product and the extension
> subscribes with `licenseConfigs: null` successfully. Whether null works because
> there is exactly one to auto-select is unmeasured, and would start to matter if
> that org gained a second.
>
> **The subscription IS the entitlement** (`accsCredentialProvisioner` records this:
> it moves scopes from `AdobeID,openid` to `commerce.accs` + `additional_info.*`).
> No subscription, no `commerce.accs`, so the credential could never reach any ACCS
> instance — in its own org or anywhere else.
>
> ### What this does and does not settle
>
> **Settled:** the credential stays in the shared service permanently, by physics
> rather than preference. `.rptc/backlog/per-sc-io-project.md` ships items (b)–(e)
> and leaves (a) where Option 1 put it.
>
> **NOT settled, and do not cite this for it:** whether an ACCS-subscribed
> credential in org A can read an instance in org B. That is still untested. It
> stopped being a question worth answering *for this decision*, because the org
> where SCs hold projects cannot produce such a credential — but a different org
> pair could, and this writeup says nothing about that case.
>
> ### Found on the way — a defect in shipped code
>
> `adobeEntityFetcher.subscribeOAuthServerToServerIntegrationToServices` returns
> `Promise<void>` and **discards the response**. The failure above is an HTTP
> **200** with the error in the BODY, so the extension currently treats a refused
> subscription as a success: `provisionAccsCredentials` logs "subscribing", reads
> the pair, and returns ok — handing back a credential with `AdobeID,openid` scopes
> whose only symptom is a Data Installer pre-flight 400 much later, with nothing
> connecting the two. Filed separately; not fixed here.
>
> **Probe hygiene:** the credential was deleted and both workspaces re-listed at 0,
> matching the pre-probe state.
>
> The original method is kept below unchanged — if the cross-org question is ever
> revived for a different org pair, this is still how to run it.

---


**Run this only once Option 1 has shipped.** It changes nothing about Option 1; it decides
whether `.rptc/backlog/per-sc-io-project.md` can absorb the credential later, or whether the
credential stays behind in the shared service permanently.

## The question

A credential's reach follows the technical account's product entitlement in the org where the
**Commerce instances** live. Measured 2026-08-16, within `285361` (Adobe Demo System): one
credential provisioned against instance A read instance B, with two failing controls.

**Cross-org is untested.** If an SC holds an I/O project in the Solution Led Commerce SC org
while the instances sit in Adobe Demo System, can a credential minted in the SC's org reach
those instances?

- **Yes** → the credential stops being special. Option 2 takes it with everything else, and
  Option 1's broker becomes redundant (dead weight, not an obstacle).
- **No** → the credential stays in the shared service permanently, by physics rather than by
  preference, and Option 2 ships items (b)–(e) only. Record it in ADR form; it is the kind
  of constraint that gets re-litigated otherwise.

## Method

Build it out for real rather than inferring — the owner's instruction. Create an Adobe I/O
project + workspace in the **Solution Led Commerce SC** org, provision a `demo-builder-s2s`
credential there through the existing loop (create S2S → subscribe `ACCS-REST-API` via the
direct call, NOT the axis-filtered path), then:

| Leg | Credential | Instance | Expect |
|---|---|---|---|
| **The test** | minted in Solution Led Commerce SC | an instance in Adobe Demo System | ? |
| Positive control | the known-good pair from `285361` | the same instance | 200 |
| Negative control | the cross-org pair | a nonsense instance id | 400 pre-flight |
| Credential control | a bad secret | the same instance | 401 `invalid_client` |

Call `get-websites-and-stores`, the read the dry run already uses — it cannot start work by
accident.

**Both controls are mandatory.** The 2026-08-16 measurement was materially weaker before the
bad-secret leg was added: without it, a 200 could have meant the endpoint does not
authenticate per-instance at all. Do not skip them because the answer looks obvious.

## Reading the result

A **200 on the test leg with the store structure of that instance** is the only thing that
counts as cross-org reach. Matching a cached or generic response is the failure mode to guard
against — compare the returned website codes against what the positive control returns for
the same instance, and against a DIFFERENT instance, so a wrong-but-plausible answer is
visible.

If the test 401s or fails pre-flight while the positive control succeeds, that is a clean
negative: the credential must live in the instances' org.

## Do not

- Do not infer the answer from the subscription scopes. `additional_info.projectedProductContext`
  makes the org-entitlement mechanism *plausible*; it does not make cross-org failure
  measured. This step exists because the mechanism is not the measurement.
- Do not run it against an instance nobody minds writing to and then assume a write would
  behave like the read. This step measures REACH via a read. A write conclusion needs a write.
- Do not leave the probe credential behind. Revoke it and verify by re-listing, the way the
  publish-key probes did.
