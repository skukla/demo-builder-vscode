# Step 05 — After ship: does a credential reach ACROSS Adobe orgs?

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
